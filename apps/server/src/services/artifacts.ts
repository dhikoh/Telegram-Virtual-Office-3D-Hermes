/**
 * Artefak otomatis dari stream run — wiring Tahap 12 ↔ dispatcher.
 *
 * ---------------------------------------------------------------------------
 * STATUS SUMBER (Rule R3 — jujur, tanpa mengarang)
 * ---------------------------------------------------------------------------
 * docs/samples/live_vps_stream_frames.jsonl (VERIFIED, tangkapan produksi)
 *   TIDAK berisi satu pun frame yang membawa berkas: isinya hanya `heartbeat`,
 *   `task_update` dan `agent_status`. Tidak ada path, tidak ada media.
 * docs/samples/mock_run_events.jsonl (ASSUMPTIONS, fixture parser)
 *   Juga TIDAK berisi frame berkas. Satu-satunya pembawa teks run di sampel ini
 *   adalah `run.completed.data.output` (baris 8) dan `tool.completed.data.preview`
 *   (baris 4) — keduanya prosa naratif tanpa path.
 *
 * Karena itu aturan deteksi di bawah DITURUNKAN dari field yang memang ada di
 * sampel (`output` / `preview`) dan frame pembawa berkasnya DISINTESIS
 * (dilabeli CONSTRUCTED di artifacts.test.ts), bukan diklaim sebagai data nyata.
 *
 * ---------------------------------------------------------------------------
 * ATURAN DETEKSI (dua jalur, eksplisit, keduanya diuji)
 * ---------------------------------------------------------------------------
 * D1 — acara eksplisit: event ∈ {artifact.created, artifact.stored, file.output,
 *      output.file} dengan data berisi salah satu:
 *        a. `content` / `data` / `base64`  → konten inline base64.
 *           INI jalur utama: lintas kontainer, tidak butuh filesystem bersama
 *           (produksi menjalankan gateway di kontainer terpisah — HERMES_BASE_URL
 *           wajib host jaringan Docker, jadi path gateway tidak terbaca server).
 *        b. `path` / `file` / `file_path` / `output_path` → hanya dipakai bila
 *           server benar-benar bisa membaca berkasnya (mock lokal / volume
 *           bersama). Tidak terbaca = ditolak + diaudit, TIDAK diaku sukses.
 *      opsional: `name`/`filename`, `mime`/`content_type`, `size`.
 *      `url` http(s) DITOLAK sengaja (SSRF) dan dicatat audit.
 *
 * D2 — teks run: event ∈ {run.completed, tool.completed, run.failed}; teks pada
 *      field `output` / `preview` / `result` / `text` dipindai untuk token yang
 *      diakhiri ekstensi yang diizinkan (.png .jpg .jpeg .webp .gif .mp4 .webm
 *      .pdf). Token hanya menjadi kandidat; artefak baru tercatat BILA berkasnya
 *      ada, berupa file biasa, berada di dalam ARTIFACT_SOURCE_DIRS, dan ukurannya
 *      di bapat batas. Token yang tidak ada di disk → tidak terdaftar (stat murah,
 *      false positive tidak berbahaya).
 *
 * ---------------------------------------------------------------------------
 * KEAMANAN (nama berkas dari stream TIDAK PERNAH dipercaya)
 * ---------------------------------------------------------------------------
 *  - nama disanitasi: null byte / karakter kontrol → tolak; sisanya dipotong ke
 *    basename saja (buang traversal `../`, path absolut, backslash);
 *  - ekstensi/mime hanya dari allow-list yang sama dengan penyimpanan Tahap 12
 *    (`safeExtensionFor` di services/media.ts), dan ekstensi disimpan SELALU
 *    berasal dari mime — nama berkas tidak pernah menentukan ekstensi di disk;
 *  - ukuran dibatasi `MEDIA_UPLOAD_MAX_MB` (env yang sama dengan unggahan Tahap 12);
 *  - sumber path dibatasi ke daftar direktori (ARTIFACT_SOURCE_DIRS / cwd / tmp);
 *  - baris disimpan lewat saveMedia() → berkasnya berada di MEDIA_DIR/artifacts,
 *    sehingga pembersih retensi Tahap 12 mengelolanya; tidak ada file yatim;
 *  - audit: `media.artifact_register` saat sukses, `media.artifact_rejected`
 *    saat ditolak, `media.artifact_download` saat diunduh (routes/media.ts).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { TaskArtifactSchema, type TaskArtifact } from '@hermes-office/shared';
import { AuditRepository } from '../db/repositories/audit.js';
import { config } from '../config.js';
import {
  mediaSettings,
  safeExtensionFor,
  saveMedia,
  type MediaRow,
  type MediaSettings,
} from './media.js';

/* ------------------------------------------------------------------ allow-list */

/**
 * Ekstensi yang boleh keluar dari run. Kunci = ekstensi kanonik yang benar-benar
 * ditulis media.ts (`safeExtensionFor`), jadi `.jpeg` dinormalkan ke `.jpg`.
 * Konsistensi peta ini dengan media.ts dikunci oleh artefak.test.ts.
 */
export const ARTIFACT_MIME_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
});

const ALLOWED_MIME = new Set(Object.values(ARTIFACT_MIME_BY_EXT));

/** Acara yang memang membawa berkas (D1). */
export const ARTIFACT_EVENT_NAMES: ReadonlySet<string> = new Set([
  'artifact.created',
  'artifact.stored',
  'file.output',
  'output.file',
]);

/** Acara yang membawa teks run (D2) — field yang benar-benar ada di sampel. */
export const RUN_TEXT_EVENT_NAMES: ReadonlySet<string> = new Set([
  'run.completed',
  'tool.completed',
  'run.failed',
]);

const RUN_TEXT_FIELDS = ['output', 'preview', 'result', 'text'] as const;

/* ------------------------------------------------------------------ sanitasi */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
/** Karakter yang tidak boleh ada pada nama berkas tampilan. */
const UNSAFE_NAME_CHARS = /[/\\:*?"<>|]/g;
/** Nama yang seluruhnya titik (`.` `..` `...`) selalu ditolak. */
const DOTS_ONLY = /^\.+$/;
/** Pemisah token pada teks run. `:` tidak dipisah supaya huruf drive Windows utuh. */
const TOKEN_BREAK = new Set([
  ' ', '\t', '\r', '\n', '\v', '\f',
  '"', "'", '`', '<', '>', '|', '*', '?',
  ',', ';', '(', ')', '[', ']', '{', '}', '=', '&', '#', '!',
]);
/** Tanda baca ujung kalimat yang harus dibuang dari token path. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

const EXT_TOKEN_RE = /\.(?:png|jpe?g|webp|gif|mp4|webm|pdf)(?![A-Za-z0-9_-])/gi;

/**
 * Sanitasi nama berkas yang DISEBUTKAN oleh stream (bukan dari path disk).
 * Kembalikan null = tolak mentah-mentah (pemanggil wajib mencatat penolakan).
 *
 *  - null byte / karakter kontrol apa pun → null (bukan sekadar dibersihkan);
 *  - hanya basename yang dipertahankan: `../../etc/passwd` → `passwd`,
 *    `C:\x\y.png` → `y.png` — traversal dan path absolut tidak pernah tersimpan;
 *  - hasil kosong / `.` / `..` → null.
 *
 * Catatan: nama ini HANYA untuk header Content-Disposition. Berkas di disk
 * selalu `<uuid><ekstensi-dari-mime>`, jadi nama berkas tidak pernah
 * menentukan lokasi penulisan.
 */
export function sanitizeArtifactFilename(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (CONTROL_CHARS.test(raw)) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Buang semua komponen direktori (POSIX & Windows) lalu sisakan basename.
  const base = path.posix.basename(trimmed.replace(/\\/g, '/'));
  if (!base || DOTS_ONLY.test(base)) return null;

  const cleaned = base.replace(UNSAFE_NAME_CHARS, '').replace(/\s+/g, ' ').trim();
  // `.` / `..` / `...` (rentetan titik apa pun) tidak pernah jadi nama berkas.
  if (!cleaned || DOTS_ONLY.test(cleaned)) return null;
  return cleaned.length > 150 ? `${cleaned.slice(0, 140)}${path.posix.extname(cleaned)}` : cleaned;
}

/** Ekstensi kanonik sebuah nama (`.jpeg` → `.jpg`), huruf kecil. */
export function canonicalExtension(name: string): string {
  const ext = path.posix.extname(name.toLowerCase());
  return ext === '.jpeg' ? '.jpg' : ext;
}

/* ------------------------------------------------------------------ deteksi */

export type ArtifactRejectionReason =
  | 'filename_unsafe'
  | 'extension_not_allowed'
  | 'mime_not_allowed'
  | 'mime_mismatch'
  | 'remote_url_unsupported'
  | 'source_outside_roots'
  | 'source_unreadable'
  | 'not_a_regular_file'
  | 'empty_content'
  | 'size_over_cap'
  | 'save_failed';

export interface ArtifactRejection {
  event: string;
  reason: ArtifactRejectionReason;
  detail: string;
}

export interface ArtifactCandidate {
  /** Nama acara yang membawa kandidat ini. */
  event: string;
  /** Nama berkas yang disebut stream — belum disanitasi, jangan dipakai apa pun selain sanitasi. */
  rawName: string | null;
  declaredMime: string | null;
  /** Konten inline base64 (jalur lintas kontainer) atau null. */
  inline: Buffer | null;
  /** Path yang disebut stream — belum divalidasi. */
  sourcePath: string | null;
  /** Dari mana kandidat berasal, untuk audit. */
  origin: 'explicit' | 'text';
}

export interface DetectionResult {
  candidates: ArtifactCandidate[];
  rejections: ArtifactRejection[];
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Decode base64 inline. Kembalikan `Buffer` bila valid, `'too_large'` bila
 * melebihi cap (dilaporkan sebagai `size_over_cap`, bukan `empty_content` —
 * alasan penolakan harus jujur), atau null bila tidak terbaca.
 */
function decodeInline(raw: string, maxBytes: number): Buffer | 'too_large' | null {
  const payload = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const maxChars = Math.ceil((maxBytes * 4) / 3) + 8;
  if (payload.length > maxChars) return 'too_large';
  const compact = payload.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
  const buf = Buffer.from(compact, 'base64');
  return buf.length > 0 ? buf : null;
}

/**
 * Pindai teks run untuk token path ber-ekstensi yang diizinkan (D2).
 * Token dipotong pada pemisah teks lalu tanda baca ujung dibuang, sehingga
 * `Hasil: D:\out\laporan.png.` menjadi `D:\out\laporan.png` (tetap memuat
 * huruf drive karena `:` bukan pemisah).
 */
function pathTokensWithAllowedExtension(text: string): string[] {
  const tokens: string[] = [];
  EXT_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXT_TOKEN_RE.exec(text)) !== null) {
    let start = match.index;
    while (start > 0 && !TOKEN_BREAK.has(text[start - 1])) start -= 1;
    let end = EXT_TOKEN_RE.lastIndex;
    while (end < text.length && !TOKEN_BREAK.has(text[end])) end += 1;
    const token = text.slice(start, end).replace(TRAILING_PUNCTUATION, '');
    if (token) tokens.push(token);
    EXT_TOKEN_RE.lastIndex = Math.max(end, EXT_TOKEN_RE.lastIndex);
  }
  return tokens;
}

/**
 * Deteksi kandidat artefak dari satu event run. Murni (tanpa disk, tanpa DB),
 * tidak pernah melempar — input stream bisa apa pun.
 */
export function detectArtifactCandidates(
  event: string,
  rawData: unknown,
  options: { maxInlineBytes?: number } = {}
): DetectionResult {
  const result: DetectionResult = { candidates: [], rejections: [] };
  if (typeof event !== 'string' || !event) return result;
  const maxInlineBytes = options.maxInlineBytes ?? mediaSettings().uploadMaxBytes;
  const data = (rawData && typeof rawData === 'object' ? rawData : {}) as Record<string, unknown>;

  // D1 — acara eksplisit pembawa berkas.
  if (ARTIFACT_EVENT_NAMES.has(event)) {
    const rawName = firstString(data.name, data.filename, data.file_name, data.title);
    const declaredMime = firstString(data.mime, data.mimetype, data.content_type);
    const rawUrl = firstString(data.url, data.href, data.download_url);
    const inlineRaw = firstString(data.content, data.data, data.base64, data.bytes);
    const sourcePath = firstString(data.path, data.file, data.file_path, data.output_path, data.artifact_path);

    if (inlineRaw) {
      const decoded = decodeInline(inlineRaw, maxInlineBytes);
      if (decoded === 'too_large') {
        result.rejections.push({
          event,
          reason: 'size_over_cap',
          detail: `konten inline melebihi ${maxInlineBytes} byte`,
        });
      } else if (!decoded) {
        result.rejections.push({
          event,
          reason: 'empty_content',
          detail: 'konten base64 tidak valid / kosong',
        });
      } else {
        result.candidates.push({
          event,
          rawName,
          declaredMime,
          inline: decoded,
          sourcePath: null,
          origin: 'explicit',
        });
      }
    } else if (sourcePath) {
      result.candidates.push({
        event,
        rawName: rawName ?? path.basename(sourcePath),
        declaredMime,
        inline: null,
        sourcePath,
        origin: 'explicit',
      });
    } else {
      result.rejections.push({
        event,
        reason: 'empty_content',
        detail: 'acara artefak tanpa content maupun path',
      });
    }

    // URL jarak jauh ditolak sengaja: mengikuti tautan dari stream = SSRF.
    if (rawUrl) {
      result.rejections.push({
        event,
        reason: 'remote_url_unsupported',
        detail: rawUrl.slice(0, 120),
      });
    }
    return result;
  }

  // D2 — teks run.
  if (RUN_TEXT_EVENT_NAMES.has(event)) {
    for (const field of RUN_TEXT_FIELDS) {
      const text = data[field];
      if (typeof text !== 'string' || !text) continue;
      for (const token of pathTokensWithAllowedExtension(text)) {
        result.candidates.push({
          event,
          rawName: path.basename(token),
          declaredMime: null,
          inline: null,
          sourcePath: token,
          origin: 'text',
        });
      }
    }
  }

  return result;
}

/* ------------------------------------------------------------------ sumber path */

/**
 * Daftar direktori yang boleh jadi sumber artefak. Env `ARTIFACT_SOURCE_DIRS`
 * (dipisah `;` atau `,`) mengalahkan default supaya operasional bisa memperluas
 * tanpa rebuild. Default: cwd (workspace repo), TMPDIR (temp run), dan direktori DB
 * — pola env-first yang sama dengan mediaSettings().
 */
export function artifactSourceRoots(
  env: Record<string, string | undefined> = process.env
): string[] {
  const raw = (env.ARTIFACT_SOURCE_DIRS || '').trim();
  const explicit = raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
  const candidates = explicit.length > 0
    ? explicit
    : [process.cwd(), env.TMPDIR, env.TEMP, env.TMP, os.tmpdir(), path.dirname(path.resolve(config.DB_PATH))]
        .filter((p): p is string => Boolean(p))
        .map((p) => path.resolve(p));
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const p of candidates) {
    if (!seen.has(p)) {
      seen.add(p);
      roots.push(p);
    }
  }
  return roots;
}

function isInsideRoots(abs: string, roots: string[]): boolean {
  return roots.some((root) => abs === root || abs.startsWith(root + path.sep));
}

/* ------------------------------------------------------------------ registrasi */

export interface ArtifactDownload {
  buffer: Buffer;
  mime: string;
  filename: string;
}

type BuildResult = { ok: ArtifactDownload } | { rejection: ArtifactRejection };

/**
 * Ubah satu kandidat menjadi berkas yang boleh disimpan, atau tolak dengan alasan.
 * Setiap keputusan keamanan ada di sini: sanitasi nama → isi → ukuran → allow-list.
 */
function buildArtifact(
  candidate: ArtifactCandidate,
  settings: MediaSettings,
  rootsOverride?: string[]
): BuildResult {
  const reject = (reason: ArtifactRejectionReason, detail: string): BuildResult => ({
    rejection: { event: candidate.event, reason, detail },
  });

  // 1) Nama dari stream SELALU disanitasi dulu — tidak pernah dipercaya.
  const rawName = candidate.rawName || '';
  const filename = sanitizeArtifactFilename(rawName);
  if (!filename) {
    return reject('filename_unsafe', JSON.stringify(String(rawName).slice(0, 120)));
  }

  // 2) Isi: inline, atau berkas lokal yang benar-benar bisa dibaca server.
  let buffer: Buffer;
  if (candidate.inline) {
    buffer = candidate.inline;
  } else {
    const source = candidate.sourcePath;
    if (!source) return reject('empty_content', 'tanpa konten maupun path');

    // URL ditolak (SSRF) — server tidak pernah menarik berkas dari jaringan.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source) || source.startsWith('//')) {
      return reject('remote_url_unsupported', source.slice(0, 120));
    }

    const abs = path.resolve(source);
    const roots = rootsOverride ?? artifactSourceRoots();
    if (!isInsideRoots(abs, roots)) {
      return reject('source_outside_roots', abs.slice(0, 160));
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      return reject('source_unreadable', path.basename(abs));
    }
    if (!stat.isFile()) return reject('not_a_regular_file', path.basename(abs));
    if (stat.size <= 0) return reject('empty_content', path.basename(abs));
    if (stat.size > settings.uploadMaxBytes) {
      return reject('size_over_cap', `${stat.size} > ${settings.uploadMaxBytes}`);
    }
    try {
      buffer = fs.readFileSync(abs);
    } catch {
      return reject('source_unreadable', path.basename(abs));
    }
  }

  // 3) Ukuran (jalur inline baru dicek di sini) — batas env yang sama dengan unggahan Tahap 12.
  if (buffer.length <= 0) return reject('empty_content', 'konten kosong');
  if (buffer.length > settings.uploadMaxBytes) {
    return reject('size_over_cap', `${buffer.length} > ${settings.uploadMaxBytes}`);
  }

  // 4) Allow-list ekstensi/mime — konsisten dengan penyimpanan Tahap 12.
  const ext = canonicalExtension(filename);
  const extMime = ext ? ARTIFACT_MIME_BY_EXT[ext] : undefined;
  const declared = candidate.declaredMime ? candidate.declaredMime.toLowerCase() : null;

  let mime: string;
  if (extMime) {
    if (declared) {
      if (!ALLOWED_MIME.has(declared)) return reject('mime_not_allowed', declared);
      // Nama dan tipe harus sepakat: `laporan.png` + `video/mp4` = penolakan.
      if (safeExtensionFor(declared) !== ext) {
        return reject('mime_mismatch', `${ext} vs ${declared}`);
      }
    }
    mime = extMime;
  } else if (declared) {
    // Tanpa ekstensi yang diizinkan, ekstensi disimpulkan dari mime —
    // persis aturan media.ts: ekstensi SELALU berasal dari mime, bukan nama.
    if (!ALLOWED_MIME.has(declared)) return reject('mime_not_allowed', declared);
    mime = declared;
  } else {
    return reject('extension_not_allowed', ext || path.posix.basename(filename));
  }

  return { ok: { buffer, mime, filename } };
}

export interface RegisterRunArtifactsInput {
  db: Database.Database;
  agentId: string;
  taskId?: string | null;
  runId?: string | null;
  event: string;
  data: unknown;
  /** user audit; 0 = sistem (jalur otomatis, bukan tangan pemilik). */
  auditUserId?: number;
  settings?: Partial<MediaSettings>;
  /** Override direktori sumber yang boleh dibaca (test / konfigurasi ketat). */
  sourceRoots?: string[];
}

export interface RegisterRunArtifactsResult {
  registered: TaskArtifact[];
  rejections: ArtifactRejection[];
}

/**
 * Satu pintu: deteksi + validasi + simpan lewat saveMedia() Tahap 12.
 *
 * Berkas DISALIN (bukan dipindah) ke MEDIA_DIR/artifacts/<uuid><ext> supaya
 * pembersih retensi Tahap 12 ikut mengelolanya — tidak ada berkas di luar
 * jangkauan cleaner. Berkas sumber gateway tidak disentuh.
 *
 * Tidak pernah melempar: kegagalan per kandidat dicatat sebagai penolakan dan
 * diaudit `media.artifact_rejected`, sehingga run tidak pernah rusak karena ini.
 */
export function registerRunArtifacts(input: RegisterRunArtifactsInput): RegisterRunArtifactsResult {
  const settings = mediaSettings(input.settings ?? {});
  const audit = new AuditRepository(input.db);
  const auditUserId = input.auditUserId ?? 0;
  const { candidates, rejections } = detectArtifactCandidates(input.event, input.data, {
    maxInlineBytes: settings.uploadMaxBytes,
  });

  const registered: TaskArtifact[] = [];

  for (const candidate of candidates) {
    const built = buildArtifact(candidate, settings, input.sourceRoots);
    if ('rejection' in built) {
      rejections.push(built.rejection);
      continue;
    }
    try {
      const row: MediaRow = saveMedia(input.db, {
        agentId: input.agentId,
        kind: 'artifact',
        mime: built.ok.mime,
        originalName: built.ok.filename,
        taskId: input.taskId ?? null,
        buffer: built.ok.buffer,
      });
      registered.push(toTaskArtifact(row));
      audit.logAction(
        auditUserId,
        'media.artifact_register',
        row.id,
        JSON.stringify({
          agent_id: row.agent_id,
          task_id: row.task_id,
          run_id: input.runId ?? null,
          event: candidate.event,
          origin: candidate.origin,
          mime: row.mime,
          size: row.size,
          filename: row.original_name,
        })
      );
    } catch (err) {
      rejections.push({
        event: candidate.event,
        reason: 'save_failed',
        detail: String((err as Error)?.message || err).slice(0, 160),
      });
    }
  }

  if (rejections.length > 0) {
    audit.logAction(
      auditUserId,
      'media.artifact_rejected',
      input.taskId ?? input.agentId,
      JSON.stringify({
        agent_id: input.agentId,
        run_id: input.runId ?? null,
        event: input.event,
        rejections: rejections.map((r) => ({ reason: r.reason, detail: r.detail })),
      })
    );
  }

  return { registered, rejections };
}

/* ------------------------------------------------------------------ kontrak API */

/** Rute unduhan autentikasi yang sama dengan unggahan manual Tahap 12. */
export function artifactDownloadUrl(id: string): string {
  return `/api/artifacts/${encodeURIComponent(id)}/download`;
}

/**
 * Bentuk publik satu artefak untuk konsumen web (GET /api/tasks dan SSE
 * `task_update`). Path fisik TIDAK PERNAH ikut (Rule F-08); klien cukup
 * memakai `download_url` (GET, butuh auth `tma …` yang sama dengan /api/*).
 */
export function toTaskArtifact(row: MediaRow): TaskArtifact {
  return TaskArtifactSchema.parse({
    id: row.id,
    task_id: row.task_id,
    agent_id: row.agent_id,
    filename: row.original_name,
    mime: row.mime,
    size: row.size,
    created_at: row.created_at,
    download_url: artifactDownloadUrl(row.id),
  });
}

/**
 * Artefak per task dalam SATU query (bukan N query) — dipakai GET /api/tasks
 * dan broadcast task_update. Id dibagi ke potongan 400 untuk menghormati batas
 * parameter SQLite (999).
 */
export function listTaskArtifacts(
  db: Database.Database,
  taskIds: string[]
): Map<string, TaskArtifact[]> {
  const grouped = new Map<string, TaskArtifact[]>();
  const ids = [...new Set(taskIds.filter(Boolean))];
  if (ids.length === 0) return grouped;

  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT * FROM media
         WHERE kind = 'artifact' AND task_id IN (${placeholders})
         ORDER BY created_at ASC, rowid ASC`
      )
      .all(...chunk) as MediaRow[];
    for (const row of rows) {
      const key = row.task_id as string;
      const list = grouped.get(key) ?? [];
      list.push(toTaskArtifact(row));
      grouped.set(key, list);
    }
  }
  return grouped;
}
