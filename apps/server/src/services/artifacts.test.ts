/**
 * Artefak otomatis dari stream run — wiring Tahap 12 ↔ dispatcher.
 *
 * SUMBER (Rule R3): dua sampel di docs/samples TIDAK berisi satu pun frame yang
 * membawa berkas. Karena itu test ini:
 *   1. menjalankan aturan deteksi terhadap SAMPEL NYATA dan mengunci hasilnya
 *      "nol artefak" (bukti frame non-file tidak menghasilkan apa pun);
 *   2. menguji frame pembawa berkas yang DISINTESIS dan dilabeli CONSTRUCTED —
 *      bukan diklaim sebagai data tangkapan produksi;
 *   3. menguji keamanan (nama berkas jahat, cap ukuran, allow-list), API
 *      (`GET /api/tasks` + download), dan retensi masih menyapunya.
 *
 * MEDIA_DIR menunjuk ke direktori sementara per proses test (pola tahap12.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MEDIA_DIR = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'hermes-artifact-'));
process.env.MEDIA_DIR = MEDIA_DIR;
/** Direktori sumber yang diizinkan (di luar default) — untuk tes keamanan path. */
const SOURCE_DIR = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'hermes-source-'));

import {
  ARTIFACT_MIME_BY_EXT,
  artifactDownloadUrl,
  artifactSourceRoots,
  detectArtifactCandidates,
  listTaskArtifacts,
  registerRunArtifacts,
  sanitizeArtifactFilename,
} from './artifacts.js';
import { safeExtensionFor, sweepRetention } from './media.js';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import { sseFrame } from './stream.js';
import type { NormalizedOfficeEvent } from '@hermes-office/shared';

const botToken = 'mock_telegram_bot_token';
const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
const authHeader = { authorization: 'tma ' + createTelegramInitData(ownerUser, botToken) };

const pngBytes = (size = 64): Buffer => {
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([magic, Buffer.alloc(Math.max(0, size - 8), 0x41)]);
};

/** Sampel nyata (VERIFIED) dan fixture asumsi — keduanya TIDAK membawa berkas. */
const liveFrames = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../../../docs/samples/live_vps_stream_frames.jsonl'),
  'utf8'
)
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as { event: string; data: unknown });

const mockRunEvents = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../../../docs/samples/mock_run_events.jsonl'),
  'utf8'
)
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as { event: string; data: unknown });

describe('Artefak otomatis dari stream run', () => {
  let db: BetterSqlite3.Database;

  beforeAll(() => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
  });

  afterAll(() => {
    db.close();
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
    fs.rmSync(SOURCE_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.prepare('DELETE FROM media').run();
    db.prepare('DELETE FROM audit_log').run();
  });

  const mediaRows = () =>
    db.prepare('SELECT * FROM media ORDER BY created_at ASC').all() as {
      id: string;
      kind: string;
      mime: string;
      size: number;
      original_name: string | null;
      path: string;
      task_id: string | null;
      created_at: number;
    }[];

  const auditRows = (action: string) =>
    db
      .prepare('SELECT target, detail_json FROM audit_log WHERE action = ?')
      .all(action) as { target: string; detail_json: string }[];

  const register = (
    event: string,
    data: unknown,
    extra: Partial<Parameters<typeof registerRunArtifacts>[0]> = {}
  ) =>
    registerRunArtifacts({
      db,
      agentId: 'agent_art',
      taskId: 'task_art',
      runId: 'run_art',
      event,
      data,
      ...extra,
    });

  /* ------------------------------------------------------------------ sampel nyata */

  describe('sampel nyata (Rule R3)', () => {
    it('live_vps_stream_frames.jsonl TIDAK memuat frame berkas — nol kandidat, nol artefak', () => {
      let candidates = 0;
      for (const frame of liveFrames) {
        const det = detectArtifactCandidates(frame.event, frame.data);
        candidates += det.candidates.length;
        register(frame.event, frame.data);
      }
      expect(liveFrames.length).toBeGreaterThanOrEqual(10);
      expect(candidates).toBe(0);
      expect(mediaRows()).toHaveLength(0);
      expect(auditRows('media.artifact_register')).toHaveLength(0);
    });

    it('mock_run_events.jsonl (run.completed.output & tool.completed.preview) juga nol artefak', () => {
      let textCarriers = 0;
      for (const frame of mockRunEvents) {
        const det = detectArtifactCandidates(frame.event, frame.data);
        const data = frame.data as Record<string, unknown>;
        if (typeof data.output === 'string' || typeof data.preview === 'string') {
          textCarriers += 1;
          // Kedua pembawa teks itu memang ada — hanya saja tidak memuat path berkas.
          expect(det.candidates).toHaveLength(0);
        }
        register(frame.event, frame.data);
      }
      // Minimal dua: run.completed.output (baris 8) + tool.completed.preview.
      expect(textCarriers).toBeGreaterThanOrEqual(2);
      expect(mediaRows()).toHaveLength(0);
    });
  });

  /* ------------------------------------------------- aturan deteksi (CONSTRUCTED) */

  describe('aturan deteksi (frame CONSTRUCTED — disintesis, bukan sampel produksi)', () => {
    it('D1: artifact.created dengan content base64 inline → 1 kandidat', () => {
      const content = pngBytes(32).toString('base64');
      const det = detectArtifactCandidates('artifact.created', {
        name: 'grafik.png',
        mime: 'image/png',
        content,
      });
      expect(det.candidates).toHaveLength(1);
      expect(det.candidates[0].origin).toBe('explicit');
      expect(det.candidates[0].inline?.length).toBe(32);
      expect(det.rejections).toHaveLength(0);
    });

    it('D1: artifact.created dengan path → 1 kandidat (path belum divalidasi)', () => {
      const det = detectArtifactCandidates('file.output', { path: '/tmp/laporan.mp4' });
      expect(det.candidates).toHaveLength(1);
      expect(det.candidates[0].sourcePath).toBe('/tmp/laporan.mp4');
    });

    it('D1: acara dengan url saja → ditolak remote_url_unsupported (SSRF), tanpa kandidat', () => {
      const det = detectArtifactCandidates('artifact.created', {
        name: 'x.png',
        url: 'http://169.254.169.254/latest/meta-data',
      });
      expect(det.candidates).toHaveLength(0);
      expect(det.rejections.map((r) => r.reason)).toContain('remote_url_unsupported');
    });

    it('D1: acara kosong → ditolak empty_content, bukan dianggap sukses', () => {
      const det = detectArtifactCandidates('artifact.created', {});
      expect(det.candidates).toHaveLength(0);
      expect(det.rejections.map((r) => r.reason)).toContain('empty_content');
    });

    it('D2: teks run.completed yang memuat path ber-ekstensi izinkan → 1 kandidat', () => {
      const det = detectArtifactCandidates('run.completed', {
        output: 'Analisis selesai, hasil tersimpan di /data/out/laporan-akhir.png. Terima kasih.',
      });
      expect(det.candidates).toHaveLength(1);
      expect(det.candidates[0].sourcePath).toBe('/data/out/laporan-akhir.png');
      expect(det.candidates[0].origin).toBe('text');
    });

    it('D2: ekstensi di luar allow-list (.exe, .zip) tidak pernah jadi kandidat', () => {
      for (const ext of ['.exe', '.zip', '.sh', '.sqlite', '.env']) {
        const det = detectArtifactCandidates('run.completed', {
          output: `selesai: /data/out/setup${ext}`,
        });
        expect(det.candidates).toHaveLength(0);
      }
    });

    it('D2: acara di luar daftar (tool.started / heartbeat) tidak dipindai', () => {
      expect(
        detectArtifactCandidates('tool.started', { tool: 'write', path: '/data/x.png' }).candidates
      ).toHaveLength(0);
      expect(
        detectArtifactCandidates('heartbeat', { path: '/data/x.png' }).candidates
      ).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------------------ keamanan */

  describe('keamanan: nama berkas dari stream TIDAK PERNAH dipercaya', () => {
    it('menolak null byte dan karakter kontrol', () => {
      expect(sanitizeArtifactFilename('laporan\u0000.png')).toBeNull();
      expect(sanitizeArtifactFilename('laporan\r\n.png')).toBeNull();
      expect(sanitizeArtifactFilename('laporan\u001f.png')).toBeNull();
    });

    it('mengiris traversal dan path absolut menjadi basename', () => {
      expect(sanitizeArtifactFilename('../../etc/passwd.png')).toBe('passwd.png');
      expect(sanitizeArtifactFilename('..\\..\\windows\\system32\\evil.png')).toBe('evil.png');
      expect(sanitizeArtifactFilename('/etc/shadow.png')).toBe('shadow.png');
      expect(sanitizeArtifactFilename('C:\\Users\\x\\y.png')).toBe('y.png');
      expect(sanitizeArtifactFilename('...')).toBeNull();
      expect(sanitizeArtifactFilename('')).toBeNull();
      expect(sanitizeArtifactFilename(12345 as unknown)).toBeNull();
    });

    it('nama jahat tanpa ekstensi izinkan → ditolak, TIDAK ada baris media', () => {
      const out = register('artifact.created', {
        name: '../../etc/passwd',
        path: writeSource('innocent.png', pngBytes(32)),
      });
      expect(out.registered).toHaveLength(0);
      expect(out.rejections.map((r) => r.reason)).toContain('extension_not_allowed');
      expect(mediaRows()).toHaveLength(0);
      expect(auditRows('media.artifact_rejected')).toHaveLength(1);
    });

    it('nama jahat DENGAN ekstensi izinkan disimpan tanpa jejak direktori', () => {
      const out = register('artifact.created', {
        name: '../../../../etc/cron.d/evil.png',
        path: writeSource('innocent.png', pngBytes(48)),
      });
      expect(out.registered).toHaveLength(1);
      expect(out.registered[0].filename).toBe('evil.png');
      const row = mediaRows()[0];
      expect(row.original_name).toBe('evil.png');
      expect(row.path).not.toContain('..');
      // Berkas di disk selalu <uuid><ext> di bawah MEDIA_DIR/artifacts.
      expect(row.path.startsWith('artifacts/')).toBe(true);
      expect(path.resolve(MEDIA_DIR, row.path).startsWith(path.resolve(MEDIA_DIR))).toBe(true);
    });

    it('ekstensi/mime di luar allow-list ditolak', () => {
      const cases: [string, unknown][] = [
        ['catatan.txt', null],
        ['program.exe', null],
        ['arsip.zip', null],
        ['x.png', 'application/x-msdownload'],
      ];
      for (const [name, mime] of cases) {
        const out = register('artifact.created', {
          name,
          ...(mime ? { mime } : {}),
          path: writeSource('src.bin', pngBytes(16)),
        });
        expect(out.registered, `${name} harus ditolak`).toHaveLength(0);
        expect(out.rejections.length).toBeGreaterThan(0);
      }
      expect(mediaRows()).toHaveLength(0);
    });

    it('mime dan nama yang tidak sepakat → mime_mismatch', () => {
      const out = register('artifact.created', {
        name: 'laporan.png',
        mime: 'video/mp4',
        path: writeSource('src.bin', pngBytes(16)),
      });
      expect(out.registered).toHaveLength(0);
      expect(out.rejections.map((r) => r.reason)).toContain('mime_mismatch');
    });

    it('ukuran di atas cap → size_over_cap, tanpa baris dan tanpa berkas', () => {
      const source = writeSource('besar.png', pngBytes(4096));
      const artifactsDir = path.join(MEDIA_DIR, 'artifacts');
      const countArtifacts = () =>
        fs.existsSync(artifactsDir) ? fs.readdirSync(artifactsDir).length : 0;
      const artifactsBefore = countArtifacts();

      const out = register(
        'artifact.created',
        { name: 'besar.png', path: source },
        { settings: { uploadMaxBytes: 512 } }
      );
      expect(out.registered).toHaveLength(0);
      expect(out.rejections.map((r) => r.reason)).toContain('size_over_cap');
      expect(mediaRows()).toHaveLength(0);
      // Tidak ada berkas baru yang tertinggal di direktori artefak.
      expect(countArtifacts()).toBe(artifactsBefore);
    });

    it('path di luar ARTIFACT_SOURCE_DIRS → source_outside_roots', () => {
      const outside = writeSource('innocent.png', pngBytes(32));
      const out = register(
        'artifact.created',
        { name: 'innocent.png', path: outside },
        { sourceRoots: [path.join(SOURCE_DIR, 'only-this-dir')] }
      );
      expect(out.registered).toHaveLength(0);
      expect(out.rejections.map((r) => r.reason)).toContain('source_outside_roots');
      expect(mediaRows()).toHaveLength(0);
    });

    it('path yang tidak ada / bukan berkas biasa → ditolak, bukan diaku sukses', () => {
      const missing = register('artifact.created', {
        name: 'hilang.png',
        path: path.join(SOURCE_DIR, 'tidak-ada.png'),
      });
      expect(missing.registered).toHaveLength(0);
      expect(missing.rejections.map((r) => r.reason)).toContain('source_unreadable');

      const notFile = register('artifact.created', {
        name: 'direktori.png',
        path: SOURCE_DIR,
      });
      expect(notFile.registered).toHaveLength(0);
      expect(notFile.rejections.map((r) => r.reason)).toContain('not_a_regular_file');
    });

    it('allow-list konsisten dengan penyimpanan Tahap 12 (safeExtensionFor)', () => {
      for (const [ext, mime] of Object.entries(ARTIFACT_MIME_BY_EXT)) {
        expect(safeExtensionFor(mime)).toBe(ext);
      }
      expect(Object.values(ARTIFACT_MIME_BY_EXT)).not.toContain('application/octet-stream');
    });

    it('daftar sumber default membaca env ARTIFACT_SOURCE_DIRS', () => {
      const roots = artifactSourceRoots({ ARTIFACT_SOURCE_DIRS: '/srv/a;/srv/b' });
      expect(roots).toHaveLength(2);
      expect(roots[0].endsWith(path.join('srv', 'a'))).toBe(true);
      expect(artifactSourceRoots({})).toContain(path.resolve(process.cwd()));
    });
  });

  /* ------------------------------------------------------- registrasi & API */

  describe('registrasi + API', () => {
    it('mendaftarkan berkas run sebagai artefak task yang bisa diunduh', () => {
      const bytes = pngBytes(128);
      const source = writeSource('hasil-analisis.png', bytes);
      const out = register('run.completed', {
        output: `Selesai. Berkas tersimpan di ${source}.`,
      });

      expect(out.registered).toHaveLength(1);
      const art = out.registered[0];
      expect(art.task_id).toBe('task_art');
      expect(art.agent_id).toBe('agent_art');
      expect(art.mime).toBe('image/png');
      expect(art.size).toBe(bytes.length);
      expect(art.filename).toBe('hasil-analisis.png');
      expect(art.download_url).toBe(artifactDownloadUrl(art.id));

      const row = mediaRows()[0];
      expect(row.kind).toBe('artifact');
      expect(row.task_id).toBe('task_art');
      // Berkas berada DI DALAM direktori yang dikelola cleaner Tahap 12.
      const stored = path.join(MEDIA_DIR, row.path);
      expect(fs.existsSync(stored)).toBe(true);
      expect(fs.readFileSync(stored).equals(bytes)).toBe(true);
      expect(row.path.startsWith('artifacts/')).toBe(true);

      const audit = auditRows('media.artifact_register');
      expect(audit).toHaveLength(1);
      expect(audit[0].target).toBe(art.id);
      expect(JSON.parse(audit[0].detail_json).run_id).toBe('run_art');
    });

    it('acara tanpa berkas (message.interim / tool.started) tidak mendaftarkan apa pun', () => {
      register('message.interim', { text: 'Sedang menganalisis /data/report.png ...' });
      register('tool.started', { tool: 'read_file', path: '/data/report.png' });
      expect(mediaRows()).toHaveLength(0);
      expect(auditRows('media.artifact_register')).toHaveLength(0);
    });

    it('konten inline base64 terdaftar tanpa bergantung pada filesystem gateway', () => {
      const bytes = pngBytes(96);
      const out = register('artifact.created', {
        name: 'inline-gambar.png',
        mime: 'image/png',
        content: bytes.toString('base64'),
      });
      expect(out.registered).toHaveLength(1);
      const stored = path.join(MEDIA_DIR, mediaRows()[0].path);
      expect(fs.readFileSync(stored).equals(bytes)).toBe(true);
    });

    it('listTaskArtifacts mengembalikan artefak per task tanpa path fisik', () => {
      register('artifact.created', {
        name: 'satu.png',
        path: writeSource('satu.png', pngBytes(32)),
      });
      const grouped = listTaskArtifacts(db, ['task_art', 'task_lain']);
      expect(grouped.get('task_lain')).toBeUndefined();
      const list = grouped.get('task_art')!;
      expect(list).toHaveLength(1);
      // Rule F-08: path fisik tidak pernah ikut — bahkan tidak ada di tipenya.
      expect(Object.hasOwn(list[0], 'path')).toBe(false);
      expect(Object.keys(list[0]).sort()).toEqual(
        ['agent_id', 'created_at', 'download_url', 'filename', 'id', 'mime', 'size', 'task_id'].sort()
      );
      expect(listTaskArtifacts(db, []).size).toBe(0);
    });

    it('frame SSE task_update membawa artefak yang bisa dibaca klien', () => {
      register('artifact.created', {
        name: 'sse.png',
        path: writeSource('sse.png', pngBytes(32)),
      });
      const artifacts = listTaskArtifacts(db, ['task_art']).get('task_art')!;
      const frame = sseFrame({
        type: 'task_update',
        agent_id: 'agent_art',
        task: {
          id: 'task_art',
          status: 'done',
          title: 'Tugas',
          agent_id: 'agent_art',
          artifacts,
        },
        timestamp: Date.now(),
      } as NormalizedOfficeEvent);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))!;
      const parsed = JSON.parse(dataLine.slice(6)) as {
        task: { artifacts?: { id: string; download_url: string }[] };
      };
      expect(parsed.task.artifacts).toHaveLength(1);
      expect(parsed.task.artifacts![0].download_url).toContain('/api/artifacts/');
    });

    it('retensi Tahap 12 tetap menyapunya setelah umur artefak terlampaui', () => {
      register('artifact.created', {
        name: 'tua.png',
        path: writeSource('tua.png', pngBytes(64)),
      });
      const row = mediaRows()[0];
      const stored = path.join(MEDIA_DIR, row.path);
      expect(fs.existsSync(stored)).toBe(true);

      // Umurkan barisnya 31 hari (retensi artefak default 30 hari).
      db.prepare('UPDATE media SET created_at = ? WHERE id = ?').run(
        Date.now() - 31 * 24 * 60 * 60 * 1000,
        row.id
      );

      const result = sweepRetention(db, { dir: MEDIA_DIR });
      expect(result.removed).toBe(1);
      expect(result.expired).toBe(1);
      expect(mediaRows()).toHaveLength(0);
      expect(fs.existsSync(stored)).toBe(false);
      expect(auditRows('media.retention_sweep')).toHaveLength(1);
    });
  });

  /* ------------------------------------------------------------- end-to-end */

  describe('end-to-end lewat dispatcher (POST /api/tasks/:id/run)', () => {
    let app: FastifyInstance;

    const gateway = vi.hoisted(() => ({
      events: [] as { event: string; data: unknown }[],
    }));

    vi.mock('./hermes/index.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./hermes/index.js')>();
      const stub = {
        capabilities: async () => ({
          object: 'hermes.api_server.capabilities',
          platform: 'hermes-agent',
          model: 'hermes-agent',
          features: {},
        }),
        startRun: async () => ({ run_id: 'run_e2e', status: 'started' }),
        getRunStatus: async () => ({
          object: 'hermes.run',
          run_id: 'run_e2e',
          status: 'completed',
          output: 'ok',
        }),
        resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
        stopRun: async () => ({ status: 'stopping' }),
        streamEvents: async (
          _runId: string,
          onEvent: (event: string, data: unknown) => void
        ): Promise<() => void> => {
          for (const item of gateway.events) onEvent(item.event, item.data);
          return () => {};
        },
        chatStream: async () => {},
        listModels: async () => ['hermes-agent'],
        createSession: async () => null,
        getSessionMessages: async () => [],
        sessionChatStream: async () => {},
        listSkills: async () => [],
      } as unknown as import('./hermes/client.interface.js').HermesClient;

      return { ...actual, getServerHermesClient: () => stub, getHermesClientForAgent: () => stub };
    });

    beforeAll(async () => {
      app = buildServer({ db });
      await app.ready();
      await app.inject({
        method: 'POST',
        url: '/api/agents',
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: {
          id: 'agent_e2e',
          name: 'Art E2E',
          role: 'Desainer',
          department: 'marketing',
          avatar: '🎨',
          soul_summary: 'agen uji artefak',
          hermes_base_url: null,
          api_key_env: 'HERMES_KEY_DEFAULT',
          hermes_profile: 'default',
          active: 1,
          hired_at: Date.now(),
          created_at: Date.now(),
        },
      });
      await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: {
          id: 'task_e2e',
          title: 'Buat laporan',
          agent_id: 'agent_e2e',
        },
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('run yang menghasilkan file → terdaftar, tampil di GET /api/tasks, dan bisa diunduh', async () => {
      const bytes = pngBytes(200);
      const source = writeSource('laporan-e2e.png', bytes);
      gateway.events = [
        {
          event: 'run.completed',
          data: { output: `Tugas selesai. Berkas hasil: ${source}` },
        },
      ];
      db.prepare('DELETE FROM media').run();
      db.prepare('DELETE FROM audit_log').run();

      const run = await app.inject({
        method: 'POST',
        url: '/api/tasks/task_e2e/run',
        headers: authHeader,
        payload: {},
      });
      expect(run.statusCode).toBe(200);

      // Event stream memicu handleRunEvent pada microtask berikutnya.
      await new Promise((resolve) => setTimeout(resolve, 30));

      const list = await app.inject({ method: 'GET', url: '/api/tasks', headers: authHeader });
      expect(list.statusCode).toBe(200);
      const tasks = JSON.parse(list.body) as {
        id: string;
        status: string;
        artifacts: { id: string; download_url: string; filename: string; size: number }[];
      }[];
      const task = tasks.find((t) => t.id === 'task_e2e')!;
      expect(task.status).toBe('done');
      expect(task.artifacts).toHaveLength(1);
      expect(task.artifacts[0].filename).toBe('laporan-e2e.png');
      expect(task.artifacts[0].size).toBe(bytes.length);
      expect(task.artifacts[0].download_url).toBe(
        `/api/artifacts/${task.artifacts[0].id}/download`
      );

      // Unduhan: byte persis, dan tetap butuh autentikasi.
      const noAuth = await app.inject({
        method: 'GET',
        url: task.artifacts[0].download_url,
      });
      expect([401, 403]).toContain(noAuth.statusCode);

      const down = await app.inject({
        method: 'GET',
        url: task.artifacts[0].download_url,
        headers: authHeader,
      });
      expect(down.statusCode).toBe(200);
      expect(down.headers['content-type']).toBe('image/png');
      expect(down.rawPayload.equals(bytes)).toBe(true);

      expect(auditRows('media.artifact_register')).toHaveLength(1);
      expect(auditRows('media.artifact_download')).toHaveLength(1);

      // Retensi menyapunya juga untuk jalur otomatis ini.
      const row = mediaRows()[0];
      const stored = path.join(MEDIA_DIR, row.path);
      expect(fs.existsSync(stored)).toBe(true);
      db.prepare('UPDATE media SET created_at = ? WHERE id = ?').run(
        Date.now() - 31 * 24 * 60 * 60 * 1000,
        row.id
      );
      expect(sweepRetention(db, { dir: MEDIA_DIR }).removed).toBe(1);
      expect(fs.existsSync(stored)).toBe(false);
    });

    it('run tanpa keluaran berkas tidak menambahkan artefak apa pun', async () => {
      gateway.events = [
        { event: 'tool.completed', data: { tool: 'search_data', preview: 'Found 12 entries.' } },
        { event: 'run.completed', data: { output: 'Semua data berhasil dirangkum.' } },
      ];
      db.prepare('DELETE FROM media').run();
      db.prepare('DELETE FROM audit_log').run();

      await app.inject({
        method: 'POST',
        url: '/api/tasks/task_e2e/run',
        headers: authHeader,
        payload: {},
      });
      await new Promise((resolve) => setTimeout(resolve, 30));

      const list = await app.inject({ method: 'GET', url: '/api/tasks', headers: authHeader });
      const tasks = JSON.parse(list.body) as { id: string; artifacts: unknown[] }[];
      expect(tasks.find((t) => t.id === 'task_e2e')!.artifacts).toHaveLength(0);
      expect(mediaRows()).toHaveLength(0);
      expect(auditRows('media.artifact_register')).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------------------ helpers */

  /**
   * Tulis berkas sumber palsu di direktori sumber yang diizinkan. Nama persis
   * dipertahankan (subdirektori unik per panggilan) supaya basename yang terdeteksi
   * dari teks run sama dengan `name` — seperti keluaran agen yang sesungguhnya.
   */
  let sourceCounter = 0;
  function writeSource(name: string, bytes: Buffer): string {
    const dir = path.join(SOURCE_DIR, `run_${(sourceCounter += 1)}`);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    fs.writeFileSync(file, bytes);
    return file;
  }
});
