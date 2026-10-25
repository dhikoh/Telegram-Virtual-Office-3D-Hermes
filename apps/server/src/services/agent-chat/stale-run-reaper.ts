/**
 * Fix run nyangkut — penutup run yang sudah mati.
 *
 * Bukti produksi (25 Okt 2026): `agent_runs` memuat 10 baris — 7 berstatus
 * 'running' tanpa `finished_at`. Stream gateway sudah mati, tapi barisnya
 * tetap 'running', jadi UI menampilkan "Bagas sedang mengetik..." selamanya
 * dan sambung-ulang menunggu aliran yang tidak akan pernah datang.
 *
 * Aturan: run yang masih 'running' setelah 30 menit dianggap mati. Batas 30
 * menit sengaja jauh di atas `chatTimeoutMs` (300 detik) supaya run yang
 * memang lambat tidak pernah ikut ditutup — hanya yang benar-benar
 * ditinggalkan.
 *
 * Dipanggil dari dua tempat:
 *  1. server start (sekali) — membersihkan sisa restart / crash.
 *  2. route chat saat SSE 'close' — menutup run agen itu saat pemilik
 *     menutup panel, bukan membiarkannya 'running'.
 */
import type Database from 'better-sqlite3';

/** Batas umur run 'running' sebelum dianggap mati (30 menit). */
export const STALE_RUN_MS = 30 * 60 * 1000;

/** Status penutup — 'interrupted' supaya berbeda dari 'failed' (gateway menolak)
 *  dan 'completed' (jalan normal). Riwayat UI bisa membedakan ketiganya. */
export const STALE_RUN_STATUS = 'interrupted';

export interface StaleRunRow {
  id: string;
  agent_id: string;
  session_id: string | null;
  started_at: number;
  model: string | null;
}

export interface ReapResult {
  /** Run yang akan/di sudah ditutup. */
  closed: StaleRunRow[];
  /** true bila hanya menghitung, tidak menulis. */
  dryRun: boolean;
  /** Ambang batas yang dipakai (ms sejak started_at). */
  thresholdMs: number;
}

/**
 * Cari run 'running' yang sudah melewati ambang. Tidak menulis apa pun —
 * dipakai oleh `--dry-run` maupun oleh penutup sesi untuk laporan.
 */
export function findStaleRuns(
  db: Database.Database,
  now: number = Date.now(),
  thresholdMs: number = STALE_RUN_MS
): StaleRunRow[] {
  const cutoff = now - thresholdMs;
  return db
    .prepare(
      `SELECT id, agent_id, session_id, started_at, model
       FROM agent_runs
       WHERE status = 'running' AND started_at < ?
       ORDER BY started_at ASC`
    )
    .all(cutoff) as StaleRunRow[];
}

/**
 * Tutup run nyangkut menjadi 'interrupted' + `finished_at`.
 *
 * Idempoten: run yang sudah 'interrupted' tidak pernah dipilih lagi
 * (`status = 'running'` di WHERE), jadi memanggil ini dua kali tidak
 * mengubah apa pun dan tidak menghasilkan duplikat.
 */
export function reapStaleRuns(
  db: Database.Database,
  options: { now?: number; thresholdMs?: number; dryRun?: boolean } = {}
): ReapResult {
  const now = options.now ?? Date.now();
  const thresholdMs = options.thresholdMs ?? STALE_RUN_MS;
  const dryRun = Boolean(options.dryRun);

  const closed = findStaleRuns(db, now, thresholdMs);
  if (dryRun || closed.length === 0) {
    return { closed, dryRun, thresholdMs };
  }

  const update = db.prepare(
    `UPDATE agent_runs
     SET status = ?, finished_at = ?, error_reason = ?
     WHERE id = ? AND status = 'running'`
  );

  // Satu transaksi: seluruh batch tertutup atau tidak ada yang tertutup.
  const runAll = db.transaction((rows: StaleRunRow[]) => {
    for (const row of rows) {
      update.run(
        STALE_RUN_STATUS,
        now,
        `Run ditinggalkan: tidak ada peristiwa sejak ${new Date(row.started_at).toISOString()}`,
        row.id
      );
    }
  });
  runAll(closed);

  return { closed, dryRun, thresholdMs };
}

/**
 * Tutup SATU run tertentu bila ia masih 'running'.
 *
 * Dipakai saat giliran berakhir tanpa event terminal (gateway melempar,
 * koneksi putus): baris run yang dibuka giliran ini tidak boleh tertinggal
 * 'running' tanpa finished_at. Hanya run milik giliran ini yang disentuh —
 * run milik permintaan lain (mis. sambung-ulang yang sedang berjalan)
 * tidak pernah ikut tertutup.
 *
 * Idempoten: `status = 'running'` di WHERE membuat run yang sudah terminal
 * tidak pernah dipilih dua kali.
 */
export function closeRunIfRunning(
  db: Database.Database,
  runId: string | null | undefined,
  reason: string,
  now: number = Date.now()
): boolean {
  if (!runId) return false;
  const result = db
    .prepare(
      `UPDATE agent_runs
       SET status = ?, finished_at = ?, error_reason = ?
       WHERE id = ? AND status = 'running'`
    )
    .run(STALE_RUN_STATUS, now, reason, runId);
  return result.changes > 0;
}

/**
 * Tutup run AKTIF milik satu agen saat stream SSE ditutup pemilik.
 *
 * Bedanya dengan `reapStaleRuns`: tidak ada ambang 30 menit. Panel yang
 * ditutup berarti tidak ada lagi yang menunggu aliran itu, jadi run yang
 * masih 'running' untuk agen tersebut langsung ditutup — kalau tidak, baris
 * 'running' tanpa finished_at tertinggal persis seperti gejala produksi.
 *
 * `excludeRunId` melindungi run yang memang sedang disambung-ulang lewat
 * permintaan lain (reattach) supaya tidak ikut tertutup oleh penutupan
 * koneksi yang lain.
 */
export function interruptAgentRuns(
  db: Database.Database,
  agentId: string,
  options: { now?: number; excludeRunId?: string | null } = {}
): StaleRunRow[] {
  const now = options.now ?? Date.now();

  const rows = db
    .prepare(
      `SELECT id, agent_id, session_id, started_at, model
       FROM agent_runs
       WHERE status = 'running' AND agent_id = ?
       ORDER BY started_at ASC`
    )
    .all(agentId) as StaleRunRow[];

  const targets = options.excludeRunId
    ? rows.filter((r) => r.id !== options.excludeRunId)
    : rows;
  if (targets.length === 0) return [];

  const update = db.prepare(
    `UPDATE agent_runs
     SET status = ?, finished_at = ?, error_reason = ?
     WHERE id = ? AND status = 'running'`
  );

  const runAll = db.transaction((list: StaleRunRow[]) => {
    for (const row of list) {
      update.run(
        STALE_RUN_STATUS,
        now,
        'Aliran chat ditutup sebelum run selesai.',
        row.id
      );
    }
  });
  runAll(targets);

  return targets;
}
