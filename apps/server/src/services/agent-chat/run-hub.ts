/**
 * Fase 2b — papan lari hidup (run hub).
 *
 * Masalah yang dijawab: run milik GATEWAY, bukan milik socket. Saat klien
 * menutup panel, socket mati, tetapi run tetap berjalan. Tanpa papan ini,
 * potongan jawaban yang mengalir sesudahnya hilang tanpa jejak.
 *
 * Papan menyimpan dua hal per run:
 *  - riwayat peristiwa ber-`seq` (untuk diputar ulang saat klien kembali),
 *  - daftar pelanggan hidup (untuk melanjutkan aliran setelah pemutaran).
 *
 * Papan sengaja TIDAK menyentuh jaringan maupun database; penyimpanan permanen
 * ada di tabel `run_events`, dan itu urusan pemanggil.
 */
import type { RecordedRunEvent } from './types.js';

/** Run yang sudah selesai tetap disimpan selama ini agar bisa diputar ulang. */
export const DEFAULT_RUN_TTL_MS = 15 * 60 * 1000;

interface RunRecord {
  runId: string;
  agentId: string;
  events: RecordedRunEvent[];
  subscribers: Set<(event: RecordedRunEvent) => void>;
  terminal: boolean;
  updatedAt: number;
}

export class ChatRunHub {
  private runs = new Map<string, RunRecord>();

  /**
   * `clock` bisa diganti supaya uji TTL tidak menunggu waktu nyata dan tidak
   * bergantung pada kecepatan mesin. Bawaannya jam sistem.
   */
  constructor(
    private ttlMs: number = DEFAULT_RUN_TTL_MS,
    private clock: () => number = Date.now
  ) {}

  /** Daftarkan run baru. Mengulang run_id yang sama TIDAK mengosongkan riwayat. */
  public start(runId: string, agentId: string): void {
    if (this.runs.has(runId)) return;
    this.runs.set(runId, {
      runId,
      agentId,
      events: [],
      subscribers: new Set(),
      terminal: false,
      updatedAt: this.clock(),
    });
  }

  public has(runId: string): boolean {
    return this.runs.has(runId);
  }

  /** Run masih boleh menerima peristiwa DAN masih punya pelanggan potensial. */
  public isLive(runId: string): boolean {
    const run = this.runs.get(runId);
    return Boolean(run && !run.terminal);
  }

  /**
   * Tambahkan peristiwa ke riwayat lalu siarkan ke pelanggan.
   * `seq` diberikan papan, bukan pemanggil: penomoran harus milik satu sumber,
   * kalau tidak sambung-ulang akan melewati atau menggandakan potongan.
   */
  public append(runId: string, event: string, data: unknown): RecordedRunEvent | null {
    const run = this.runs.get(runId);
    if (!run) return null;

    const recorded: RecordedRunEvent = {
      seq: run.events.length + 1,
      event,
      data,
      ts: this.clock(),
    };
    run.events.push(recorded);
    run.updatedAt = recorded.ts;

    for (const subscriber of [...run.subscribers]) {
      try {
        subscriber(recorded);
      } catch {
        // Pelanggan yang gagal TIDAK boleh menjatuhkan run atau pelanggan lain.
        run.subscribers.delete(subscriber);
      }
    }
    return recorded;
  }

  /** Tutup run: pelanggan dilepas, riwayat tetap disimpan sampai TTL habis. */
  public finish(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.terminal = true;
    run.subscribers.clear();
    run.updatedAt = this.clock();
  }

  /** Langganan peristiwa sesudah `afterSeq`; mengembalikan fungsi pelepas. */
  public subscribe(runId: string, afterSeq: number, fn: (event: RecordedRunEvent) => void): () => void {
    const run = this.runs.get(runId);
    if (!run) return () => {};

    // Peristiwa yang tiba antara pemutaran database dan langganan tidak boleh
    // hilang: kirim dulu yang sudah ada di riwayat di atas `afterSeq`.
    for (const event of run.events) {
      if (event.seq > afterSeq) fn(event);
    }
    if (run.terminal) return () => {};

    const wrapped = (event: RecordedRunEvent) => {
      // Hanya peristiwa yang belum terkirim lewat pemutaran awal.
      if (event.seq > afterSeq) fn(event);
    };
    run.subscribers.add(wrapped);
    return () => {
      run.subscribers.delete(wrapped);
    };
  }

  /** Riwayat per run, berurutan menurut `seq`. */
  public history(runId: string): RecordedRunEvent[] {
    return [...(this.runs.get(runId)?.events ?? [])];
  }

  public agentOf(runId: string): string | null {
    return this.runs.get(runId)?.agentId ?? null;
  }

  /** Buang run yang sudah lama tidak tersentuh. */
  public prune(now: number = this.clock()): number {
    let removed = 0;
    for (const [runId, run] of this.runs) {
      if (now - run.updatedAt > this.ttlMs) {
        this.runs.delete(runId);
        removed += 1;
      }
    }
    return removed;
  }

  public get size(): number {
    return this.runs.size;
  }
}

/** Satu papan untuk seluruh proses — rute dan dispatcher berbagi pandangan. */
export const chatRunHub = new ChatRunHub();
