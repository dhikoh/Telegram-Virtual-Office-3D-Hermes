/**
 * Tahap 12 — media chat & retensi.
 *
 * Satu baris `media` = satu berkas fisik di MEDIA_DIR:
 *   kind='upload'   gambar yang pemilik kirim di chat      (retensi 7 hari)
 *   kind='artifact' keluaran agen, mis. video/gambar hasil run (retensi 30 hari)
 *
 * Retensi punya dua lapis, keduanya lewat sweepRetention():
 *   1. umur    upload > MEDIA_IMAGE_RETENTION_DAYS, artifact > MEDIA_ARTIFACT_*;
 *   2. cap     total ukuran seluruh media > MEDIA_CAP_MB → yang paling tua
 *              terhapus dulu sampai muat lagi (aturan owner: bukan yang baru).
 *
 * Setiap penghapusan menghapus baris DB DAN berkasnya, lalu dicatat ke audit
 * sebagai 'media.retention_sweep' supaya tidak ada file yatim dan tidak ada
 * data yang hilang tanpa jejak.
 *
 * Semua batas dibaca dari env saat dipanggil (bukan disimpan saat import) supaya
 * server, test, dan sweep interval selalu memakai konfigurasi yang sama.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { config } from '../config.js';
import { AuditRepository } from '../db/repositories/audit.js';

export type MediaKind = 'upload' | 'artifact';

export interface MediaRow {
  id: string;
  agent_id: string;
  kind: MediaKind;
  mime: string;
  size: number;
  original_name: string | null;
  /** RELATIF terhadap MEDIA_DIR, mis. 'uploads/<id>.png'. */
  path: string;
  task_id: string | null;
  created_at: number;
}

/** Public shape — path tidak pernah dikirim ke klien (Rule F-08). */
export interface MediaPublic {
  id: string;
  agent_id: string;
  kind: MediaKind;
  mime: string;
  size: number;
  original_name: string | null;
  task_id: string | null;
  created_at: number;
}

export interface MediaSettings {
  dir: string;
  imageRetentionDays: number;
  artifactRetentionDays: number;
  capBytes: number;
  uploadMaxBytes: number;
  sweepIntervalMin: number;
}

const MB = 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'application/pdf': '.pdf',
};

/** Ekstensi selalu berasal dari mime yang sudah terdaftar — tak pernah dari nama berkas. */
export function safeExtensionFor(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? '.bin';
}

/** MEDIA_DIR kosong → <direktori DB>/media, mengikuti pola DB_PATH di config.ts. */
export function resolveMediaDir(env: Record<string, string | undefined> = process.env): string {
  const explicit = (env.MEDIA_DIR || '').trim();
  if (explicit) return path.resolve(explicit);
  return path.join(path.dirname(path.resolve(config.DB_PATH)), 'media');
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Batas retensi/unggahan. Env mengalahkan default schema (env-schema.ts) supaya
 * operasional bisa mengubah retensi tanpa rebuild, dan test bisa memaksa cap kecil.
 */
export function mediaSettings(overrides: Partial<MediaSettings> = {}): MediaSettings {
  return {
    dir: resolveMediaDir(),
    imageRetentionDays: envNumber(
      'MEDIA_IMAGE_RETENTION_DAYS',
      config.MEDIA_IMAGE_RETENTION_DAYS
    ),
    artifactRetentionDays: envNumber(
      'MEDIA_ARTIFACT_RETENTION_DAYS',
      config.MEDIA_ARTIFACT_RETENTION_DAYS
    ),
    capBytes: envNumber('MEDIA_CAP_MB', config.MEDIA_CAP_MB) * MB,
    uploadMaxBytes: envNumber('MEDIA_UPLOAD_MAX_MB', config.MEDIA_UPLOAD_MAX_MB) * MB,
    sweepIntervalMin: envNumber('MEDIA_SWEEP_INTERVAL_MIN', config.MEDIA_SWEEP_INTERVAL_MIN),
    ...overrides,
    ...(overrides.dir !== undefined ? { dir: path.resolve(overrides.dir) } : {}),
  };
}

const INSERT_SQL = `INSERT INTO media (id, agent_id, kind, mime, size, original_name, path, task_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export interface SaveMediaInput {
  agentId: string;
  kind: MediaKind;
  mime: string;
  originalName?: string | null;
  taskId?: string | null;
  buffer: Buffer;
  createdAt?: number;
}

/** Simpan berkas + baris media dalam satu langkah; gagal DB → berkas ikut dibuang. */
export function saveMedia(
  db: Database.Database,
  input: SaveMediaInput,
  settings: MediaSettings = mediaSettings()
): MediaRow {
  const dir = path.resolve(settings.dir);
  const id = crypto.randomUUID();
  const sub = input.kind === 'upload' ? 'uploads' : 'artifacts';
  const fileName = `${id}${safeExtensionFor(input.mime)}`;
  const absDir = path.join(dir, sub);

  fs.mkdirSync(absDir, { recursive: true });
  const absPath = path.join(absDir, fileName);
  fs.writeFileSync(absPath, input.buffer);

  const row: MediaRow = {
    id,
    agent_id: input.agentId,
    kind: input.kind,
    mime: input.mime.toLowerCase(),
    size: input.buffer.length,
    original_name: input.originalName || null,
    path: `${sub}/${fileName}`,
    task_id: input.taskId ?? null,
    created_at: input.createdAt ?? Date.now(),
  };

  try {
    db
      .prepare(INSERT_SQL)
      .run(
        row.id,
        row.agent_id,
        row.kind,
        row.mime,
        row.size,
        row.original_name,
        row.path,
        row.task_id,
        row.created_at
      );
  } catch (err) {
    // Jangan tinggalkan file yatim bila pencatatan DB gagal.
    try {
      fs.unlinkSync(absPath);
    } catch {
      /* file paling tidak tetap di bawah MEDIA_DIR dan terkena sweep */
    }
    throw err;
  }

  return row;
}

export function getMediaById(db: Database.Database, id: string): MediaRow | null {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as MediaRow | undefined;
  return row ?? null;
}

export function listMedia(db: Database.Database, agentId: string): MediaPublic[] {
  const rows = db
    .prepare('SELECT * FROM media WHERE agent_id = ? ORDER BY created_at DESC')
    .all(agentId) as MediaRow[];
  return rows.map(toPublic);
}

/** Rule F-08 — path fisik tidak pernah ikut ke klien. */
export function toPublic(row: MediaRow): MediaPublic {
  return {
    id: row.id,
    agent_id: row.agent_id,
    kind: row.kind,
    mime: row.mime,
    size: row.size,
    original_name: row.original_name,
    task_id: row.task_id,
    created_at: row.created_at,
  };
}

/**
 * Path absolut sebuah baris, selalu di dalam MEDIA_DIR (baris bisa saja sudah
 * kedaluwarsa / path-nya korup — jangan pernah keluar dari root media).
 */
export function absoluteMediaPath(
  row: Pick<MediaRow, 'path'>,
  settings: MediaSettings = mediaSettings()
): string | null {
  const dir = path.resolve(settings.dir);
  const abs = path.resolve(dir, row.path);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) return null;
  return abs;
}

/** Hapus berkas media (boleh hilang — file memang bisa terlanjur terhapus). */
export function removeMediaFile(
  row: MediaRow,
  settings: MediaSettings = mediaSettings()
): boolean {
  const abs = absoluteMediaPath(row, settings);
  if (!abs) return false;
  try {
    fs.unlinkSync(abs);
    return true;
  } catch {
    return false;
  }
}

/** Hapus baris DB + berkasnya. */
export function removeMedia(
  db: Database.Database,
  row: MediaRow,
  settings: MediaSettings = mediaSettings()
): number {
  const removed = db.prepare('DELETE FROM media WHERE id = ?').run(row.id).changes;
  if (removed > 0) removeMediaFile(row, settings);
  return removed;
}

export interface SweepResult {
  removed: number;
  freed_bytes: number;
  removed_ids: string[];
  expired: number;
  over_cap: number;
}

/**
 * Pembersih retensi. Aman dipanggil berulang:
 *   1. hapus yang lewat umur (upload > imageRetentionDays, artifact > artifactRetentionDays);
 *   2. bila total masih > capBytes, hapus yang paling tua sampai muat;
 *   3. tulis satu baris audit 'media.retention_sweep' bila ada yang terhapus.
 *
 * Retensi 0 = dimatikan (tanpa penghapusan berbasis umur / tanpa cap).
 */
export function sweepRetention(
  db: Database.Database,
  overrides: Partial<MediaSettings> = {},
  auditUserId = 0
): SweepResult {
  const settings = mediaSettings(overrides);
  const now = Date.now();
  const rows = db
    .prepare('SELECT * FROM media ORDER BY created_at ASC, rowid ASC')
    .all() as MediaRow[];

  const result: SweepResult = {
    removed: 0,
    freed_bytes: 0,
    removed_ids: [],
    expired: 0,
    over_cap: 0,
  };

  const drop = (row: MediaRow, reason: 'expired' | 'over_cap') => {
    if (removeMedia(db, row, settings) > 0) {
      result.removed += 1;
      result.freed_bytes += row.size;
      result.removed_ids.push(row.id);
      result[reason] += 1;
    }
  };

  // 1) Retensi berbasis umur.
  const surviving: MediaRow[] = [];
  for (const row of rows) {
    const days =
      row.kind === 'upload' ? settings.imageRetentionDays : settings.artifactRetentionDays;
    const tooOld = days > 0 && now - row.created_at > days * 24 * 60 * 60 * 1000;
    if (tooOld) drop(row, 'expired');
    else surviving.push(row);
  }

  // 2) Cap total — yang paling tua dulu.
  if (settings.capBytes > 0) {
    let total = surviving.reduce((sum, row) => sum + row.size, 0);
    let index = 0;
    while (total > settings.capBytes && index < surviving.length) {
      const row = surviving[index];
      total -= row.size;
      drop(row, 'over_cap');
      index += 1;
    }
  }

  // 3) Audit — hanya bila benar-benar ada yang terhapus, supaya tidak ada satu
  //    baris kosong tiap jam yang menutupi riwayat audit yang berarti.
  if (result.removed > 0) {
    new AuditRepository(db).logAction(
      auditUserId,
      'media.retention_sweep',
      'media',
      JSON.stringify({ removed: result.removed, freed_bytes: result.freed_bytes })
    );
  }

  return result;
}

let sweepTimer: NodeJS.Timeout | null = null;

/**
 * Interval sweep untuk server berjalan. Tidak dipakai di test (server.ts
 * melewati NODE_ENV=test) dan selalu bisa dihentikan lewat stopMediaSweepTimer.
 */
export function startMediaSweepTimer(
  db: Database.Database,
  overrides: Partial<MediaSettings> = {}
): NodeJS.Timeout | null {
  const settings = mediaSettings(overrides);
  if (settings.sweepIntervalMin <= 0) return null;
  stopMediaSweepTimer();
  sweepTimer = setInterval(() => {
    try {
      sweepRetention(db, overrides);
    } catch (err) {
      // Retensi gagal tidak boleh membunuh server — coba lagi satu siklus berikutnya.
      console.error('media sweep failed:', err);
    }
  }, settings.sweepIntervalMin * 60 * 1000);
  sweepTimer.unref?.();
  return sweepTimer;
}

export function stopMediaSweepTimer(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
