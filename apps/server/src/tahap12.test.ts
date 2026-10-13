/**
 * Tahap 12 — media chat & retensi.
 *
 *  - unggah gambar chat multipart: 201 + baris media + berkas nyata di MEDIA_DIR,
 *    lalu diteruskan ke sesi gateway sebagai content part OpenAI (teks + image_url);
 *  - penolakan gateway TIDAK disembunyikan: unggahan tetap tersimpan, tapi pesan
 *    galat gateway ikut dikirim apa adanya sebagai `gateway_error`;
 *  - mime di luar gambar → 415, berkas kebesaran → 413, tanpa auth → 401;
 *  - artefak: simpan + unduh (200, byte persis, tipe & nama asli) atau 404;
 *  - sweepRetention: umur (7h upload / 30h artefak), cap total MB (yang paling
 *    tua dulu), berkas ikut hilang, dan audit 'media.retention_sweep' tercatat.
 *
 * Gateway di-stub lewat vi.mock (pola tahap11.test.ts) dan MEDIA_DIR menunjuk ke
 * direktori sementara per proses test, jadi tidak ada berkas yang terserak.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { sweepRetention, saveMedia, mediaSettings } from './services/media.js';
import { ENDPOINTS } from '@hermes-office/shared';
import { createTelegramInitData } from './auth.test.js';

/** Kontrol gateway tiruan dari dalam test (vi.hoisted agar aman dari hoisting vi.mock). */
const gateway = vi.hoisted(() => ({
  sent: [] as { via: string; sessionId?: string; content: unknown }[],
  fail: false,
  sessionId: 'sess_t12_1' as string | null,
  failMessage: 'Mock gateway error: 400 model hermes-agent does not accept image_url content parts',
}));

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();

  const stub = {
    capabilities: async () => ({
      object: 'hermes.api_server.capabilities',
      platform: 'hermes-agent',
      model: 'hermes-agent',
      features: {},
    }),
    startRun: async () => ({ run_id: 'run_t12', status: 'started' }),
    getRunStatus: async () => ({
      object: 'hermes.run',
      run_id: 'run_t12',
      status: 'completed',
      output: 'ok',
    }),
    resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
    stopRun: async () => ({ status: 'stopping' }),
    streamEvents: async (): Promise<() => void> => () => {},
    chatStream: async (messages: { role: string; content: unknown }[]) => {
      if (gateway.fail) throw new Error(gateway.failMessage);
      gateway.sent.push({ via: 'chat', content: messages });
    },
    listModels: async () => ['hermes-agent'],
    createSession: async () => gateway.sessionId,
    getSessionMessages: async () => [],
    sessionChatStream: async (sessionId: string, message: unknown) => {
      if (gateway.fail) throw new Error(gateway.failMessage);
      gateway.sent.push({ via: 'session', sessionId, content: message });
    },
    listSkills: async () => [],
  } as unknown as import('./services/hermes/client.interface.js').HermesClient;

  return {
    ...actual,
    getServerHermesClient: () => stub,
    getHermesClientForAgent: () => stub,
  };
});

const MEDIA_DIR = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'hermes-media-'));
process.env.MEDIA_DIR = MEDIA_DIR;
// Batas kecil supaya test 413 tidak perlu mengirim puluhan MB.
process.env.MEDIA_UPLOAD_MAX_MB = '1';

/** PNG palsu yang tetap valid secara struktur (magic number + isi acak terkontrol). */
function pngBytes(size = 64): Buffer {
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([magic, Buffer.alloc(Math.max(0, size - 8), 0x41)]);
}

interface UploadOptions {
  filename?: string;
  contentType?: string;
  data?: Buffer;
  boundary?: string;
}

function multipartUpload({ filename = 'chart.png', contentType = 'image/png', data = pngBytes(), boundary = '----tahap12boundary' }: UploadOptions = {}) {
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

describe('Tahap 12 — media chat & retensi', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = { authorization: 'tma ' + createTelegramInitData(ownerUser, botToken) };

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    gateway.sent = [];
    gateway.fail = false;
    gateway.sessionId = 'sess_t12_1';
  });

  async function createAgent(id: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { ...authHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Tahap Twelve',
        role: 'Desainer',
        department: 'marketing',
        avatar: '🎨',
        soul_summary: 'Agent uji Tahap 12',
        hermes_base_url: null,
        api_key_env: 'HERMES_KEY_DEFAULT',
        hermes_profile: 'default',
        active: 1,
        hired_at: Date.now(),
        created_at: Date.now(),
      }),
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body) as { id: string };
  }

  async function upload(
    agentId: string,
    options: UploadOptions = {},
    auth: Record<string, string | undefined> = authHeader
  ) {
    const { payload, headers } = multipartUpload(options);
    return app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/media`,
      headers: { ...headers, ...auth },
      payload,
    });
  }

  const mediaRows = (agentId: string) =>
    db.prepare('SELECT * FROM media WHERE agent_id = ? ORDER BY created_at ASC').all(agentId) as {
      id: string;
      kind: string;
      mime: string;
      size: number;
      path: string;
      created_at: number;
    }[];

  const auditRows = (action: string) =>
    db
      .prepare('SELECT target, detail_json FROM audit_log WHERE action = ?')
      .all(action) as { target: string; detail_json: string }[];

  it('mengunggah gambar PNG: 201, baris media, berkas nyata di MEDIA_DIR, dan diteruskan ke sesi gateway', async () => {
    const agent = await createAgent('agent_t12_upload');
    const data = pngBytes(96);

    const res = await upload(agent.id, { filename: 'laporan.png', data });
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body) as {
      id: string;
      agent_id: string;
      kind: string;
      mime: string;
      size: number;
      original_name: string;
      created_at: number;
      path?: string;
      gateway_error?: string;
    };
    expect(body.agent_id).toBe(agent.id);
    expect(body.kind).toBe('upload');
    expect(body.mime).toBe('image/png');
    expect(body.size).toBe(data.length);
    expect(body.original_name).toBe('laporan.png');
    // Rule F-08 — path fisik tidak pernah bocor ke klien.
    expect(body.path).toBeUndefined();
    expect(body.gateway_error).toBeUndefined();

    const rows = mediaRows(agent.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(body.id);
    // path di DB relatif terhadap MEDIA_DIR, dan berkasnya benar-benar ada.
    expect(rows[0].path.startsWith('uploads/')).toBe(true);
    const stored = path.join(MEDIA_DIR, rows[0].path);
    expect(fs.existsSync(stored)).toBe(true);
    expect(fs.readFileSync(stored).equals(data)).toBe(true);

    // Gambar diteruskan sebagai content part OpenAI-compatible lewat sesi gateway.
    expect(gateway.sent).toHaveLength(1);
    expect(gateway.sent[0].via).toBe('session');
    expect(gateway.sent[0].sessionId).toBe('sess_t12_1');
    const parts = gateway.sent[0].content as {
      type: string;
      text?: string;
      image_url?: { url: string };
    }[];
    expect(parts.map((p) => p.type)).toEqual(['text', 'image_url']);
    expect(parts[0].text).toBe('[gambar terlampir]');
    expect(parts[1].image_url?.url).toBe(`data:image/png;base64,${data.toString('base64')}`);

    const audit = auditRows('media.upload');
    expect(audit).toHaveLength(1);
    expect(audit[0].target).toBe(body.id);
    expect(JSON.parse(audit[0].detail_json).gateway_error).toBeNull();
  });

  it('meneruskan lewat /v1/chat/completions saat agen belum punya sesi gateway', async () => {
    gateway.sessionId = null;
    const agent = await createAgent('agent_t12_nosession');

    const res = await upload(agent.id);
    expect(res.statusCode).toBe(201);
    expect(gateway.sent).toHaveLength(1);
    expect(gateway.sent[0].via).toBe('chat');
    const messages = gateway.sent[0].content as { role: string; content: unknown }[];
    expect(messages[0].role).toBe('user');
    expect(Array.isArray(messages[0].content)).toBe(true);
  });

  it('menampilkan pesan galat gateway apa adanya lewat gateway_error (tidak mengaku sukses)', async () => {
    gateway.fail = true;
    const agent = await createAgent('agent_t12_gatewayfail');

    const res = await upload(agent.id);
    // Unggahan tetap tersimpan, tapi pengiriman ke model GAGAL dan itu diakui.
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: string; gateway_error?: string };
    expect(body.gateway_error).toContain('does not accept image_url content parts');
    expect(mediaRows(agent.id)).toHaveLength(1);
    const failedAudit = db
      .prepare("SELECT detail_json FROM audit_log WHERE action = 'media.upload' AND target = ?")
      .get(body.id) as { detail_json: string } | undefined;
    expect(failedAudit).toBeDefined();
    expect(JSON.parse(failedAudit!.detail_json).gateway_error).toContain('does not accept image_url');
  });

  it('menolak mime di luar gambar dengan 415 dan tidak menyimpan apa pun', async () => {
    const agent = await createAgent('agent_t12_badmime');
    const before = mediaRows(agent.id).length;

    const res = await upload(agent.id, { filename: 'catatan.txt', contentType: 'text/plain' });
    expect(res.statusCode).toBe(415);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('unsupported_media_type');
    expect(mediaRows(agent.id)).toHaveLength(before);
    expect(gateway.sent).toHaveLength(0);
  });

  it('menolak berkas di atas batas dengan 413', async () => {
    const agent = await createAgent('agent_t12_toolarge');
    // MEDIA_UPLOAD_MAX_MB=1 untuk test ini.
    const oversized = Buffer.concat([pngBytes(1024), Buffer.alloc(2 * 1024 * 1024, 0x42)]);

    const res = await upload(agent.id, { filename: 'besar.png', data: oversized });
    expect(res.statusCode).toBe(413);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('payload_too_large');
    expect(mediaRows(agent.id)).toHaveLength(0);
  });

  it('menolak konten non-multipart dengan 415 dan unggahan tanpa autentikasi dengan 401', async () => {
    const agent = await createAgent('agent_t12_guard');

    const notMultipart = await app.inject({
      method: 'POST',
      url: `/api/agents/${agent.id}/media`,
      headers: { ...authHeader, 'content-type': 'application/json' },
      payload: JSON.stringify({ file: 'nope' }),
    });
    expect(notMultipart.statusCode).toBe(415);

    const noAuth = await upload(agent.id, {}, {});
    expect([401, 403]).toContain(noAuth.statusCode);
    expect(mediaRows(agent.id)).toHaveLength(0);
  });

  it('menerima artefak (kind=artifact) dan mengunduhnya dengan byte persis + tipe & nama asli', async () => {
    const agent = await createAgent('agent_t12_artifact');
    const artifactBytes = pngBytes(128);

    const up = await app.inject({
      method: 'POST',
      url: `/api/agents/${agent.id}/artifacts?task_id=task_12`,
      headers: {
        ...authHeader,
        'content-type': multipartUpload().headers['content-type'],
      },
      payload: multipartUpload({ filename: 'hasil-analisis.png', data: artifactBytes }).payload,
    });
    expect(up.statusCode).toBe(201);
    const created = JSON.parse(up.body) as { id: string; kind: string; task_id: string };
    expect(created.kind).toBe('artifact');
    expect(created.task_id).toBe('task_12');
    expect(auditRows('media.artifact_upload')).toHaveLength(1);

    const down = await app.inject({
      method: 'GET',
      url: `/api/artifacts/${created.id}/download`,
      headers: authHeader,
    });
    expect(down.statusCode).toBe(200);
    expect(down.headers['content-type']).toBe('image/png');
    expect(down.headers['content-disposition']).toContain('attachment');
    expect(down.headers['content-disposition']).toContain('hasil-analisis.png');
    expect(down.rawPayload.equals(artifactBytes)).toBe(true);
  });

  it('menjawab 404 untuk id yang tidak ada dan untuk media yang bukan artefak', async () => {
    const agent = await createAgent('agent_t12_404');
    const missing = await app.inject({
      method: 'GET',
      url: '/api/artifacts/id-yang-tidak-ada/download',
      headers: authHeader,
    });
    expect(missing.statusCode).toBe(404);

    const uploadRes = await upload(agent.id);
    const uploadId = (JSON.parse(uploadRes.body) as { id: string }).id;
    const wrongKind = await app.inject({
      method: 'GET',
      url: `/api/artifacts/${uploadId}/download`,
      headers: authHeader,
    });
    expect(wrongKind.statusCode).toBe(404);
  });

  it('mendaftar media per agen tanpa membocorkan path fisik', async () => {
    const agent = await createAgent('agent_t12_list');
    await upload(agent.id, { filename: 'satu.png' });
    await app.inject({
      method: 'POST',
      url: `/api/agents/${agent.id}/artifacts`,
      headers: { ...authHeader, 'content-type': multipartUpload().headers['content-type'] },
      payload: multipartUpload({ filename: 'dua.mp4', contentType: 'video/mp4', data: Buffer.alloc(32, 1) })
        .payload,
    });

    const res = await app.inject({ method: 'GET', url: `/api/media?agent_id=${agent.id}`, headers: authHeader });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { media: Record<string, unknown>[] };
    expect(body.media).toHaveLength(2);
    for (const row of body.media) {
      expect(row.path).toBeUndefined();
      expect(Object.keys(row).sort()).toEqual(
        ['agent_id', 'created_at', 'id', 'kind', 'mime', 'original_name', 'size', 'task_id'].sort()
      );
    }

    const missingAgent = await app.inject({ method: 'GET', url: '/api/media', headers: authHeader });
    expect(missingAgent.statusCode).toBe(400);
  });

  describe('sweepRetention', () => {
    it('menghapus upload >7 hari dan artefak >30 hari beserta berkasnya, dan mencatat audit', () => {
      const sweepDb = new BetterSqlite3(':memory:');
      runMigrations(sweepDb);
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      const oldUpload = saveMedia(sweepDb, {
        agentId: 'agent_sweep',
        kind: 'upload',
        mime: 'image/png',
        buffer: pngBytes(40),
        createdAt: now - 8 * day,
      });
      const oldArtifact = saveMedia(sweepDb, {
        agentId: 'agent_sweep',
        kind: 'artifact',
        mime: 'image/png',
        buffer: pngBytes(50),
        createdAt: now - 31 * day,
      });
      const fresh = saveMedia(sweepDb, {
        agentId: 'agent_sweep',
        kind: 'upload',
        mime: 'image/png',
        buffer: pngBytes(60),
        createdAt: now,
      });
      const settings = { dir: MEDIA_DIR };
      const files = [oldUpload, oldArtifact, fresh].map((row) =>
        path.join(MEDIA_DIR, row.path)
      );
      expect(files.every((f) => fs.existsSync(f))).toBe(true);

      const result = sweepRetention(sweepDb, settings);

      expect(result.removed).toBe(2);
      expect(result.expired).toBe(2);
      expect(result.over_cap).toBe(0);
      expect(result.freed_bytes).toBe(oldUpload.size + oldArtifact.size);
      expect(result.removed_ids.sort()).toEqual([oldUpload.id, oldArtifact.id].sort());

      const remaining = sweepDb.prepare('SELECT id FROM media').all() as { id: string }[];
      expect(remaining.map((r) => r.id)).toEqual([fresh.id]);
      expect(fs.existsSync(files[0])).toBe(false);
      expect(fs.existsSync(files[1])).toBe(false);
      expect(fs.existsSync(files[2])).toBe(true);

      const audit = sweepDb
        .prepare("SELECT action, detail_json FROM audit_log WHERE action = 'media.retention_sweep'")
        .all() as { detail_json: string }[];
      expect(audit).toHaveLength(1);
      expect(JSON.parse(audit[0].detail_json)).toEqual({
        removed: 2,
        freed_bytes: oldUpload.size + oldArtifact.size,
      });
      sweepDb.close();
    });

    it('menurunkan total di bawah cap dengan menghapus media paling tua lebih dulu', () => {
      const sweepDb = new BetterSqlite3(':memory:');
      runMigrations(sweepDb);
      const now = Date.now();
      const sizes = [400, 400, 400];
      const rows = sizes.map((size, index) =>
        saveMedia(sweepDb, {
          agentId: 'agent_cap',
          kind: 'upload',
          mime: 'image/png',
          buffer: Buffer.alloc(size, 0x43),
          createdAt: now - (10 - index) * 60 * 1000,
        })
      );

      // Cap 1000 byte: 1200 byte harus turun dengan membuang yang paling tua.
      const result = sweepRetention(sweepDb, {
        dir: MEDIA_DIR,
        capBytes: 1000,
        imageRetentionDays: 0,
        artifactRetentionDays: 0,
      });

      expect(result.removed).toBe(1);
      expect(result.over_cap).toBe(1);
      expect(result.expired).toBe(0);
      const remaining = sweepDb.prepare('SELECT id FROM media ORDER BY created_at').all() as {
        id: string;
      }[];
      expect(remaining.map((r) => r.id)).toEqual([rows[1].id, rows[2].id]);
      expect(fs.existsSync(path.join(MEDIA_DIR, rows[0].path))).toBe(false);
      expect(fs.existsSync(path.join(MEDIA_DIR, rows[1].path))).toBe(true);
      sweepDb.close();
    });

    it('tidak menghapus apa pun ketika semua masih di dalam umur dan cap', () => {
      const sweepDb = new BetterSqlite3(':memory:');
      runMigrations(sweepDb);
      saveMedia(sweepDb, {
        agentId: 'agent_clean',
        kind: 'artifact',
        mime: 'image/png',
        buffer: pngBytes(20),
      });

      const result = sweepRetention(sweepDb, { dir: MEDIA_DIR });
      expect(result.removed).toBe(0);
      expect(result.freed_bytes).toBe(0);
      expect(
        sweepDb
          .prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'media.retention_sweep'")
          .get()
      ).toEqual({ c: 0 });
      sweepDb.close();
    });
  });

  it('memakai default retensi yang disepakati pemilik (7h gambar, 30h artefak, 500MB, 8MB unggahan)', () => {
    const settings = mediaSettings({ dir: MEDIA_DIR });
    expect(settings.imageRetentionDays).toBe(7);
    expect(settings.artifactRetentionDays).toBe(30);
    expect(settings.capBytes).toBe(500 * 1024 * 1024);
    // Test memaksa 1 MB lewat env; default schema tetap 8 MB.
    expect(settings.uploadMaxBytes).toBe(1024 * 1024);
    expect(settings.sweepIntervalMin).toBe(60);
  });

  it('endpoints manifest mencatat keempat rute Tahap 12', () => {
    const has = (method: string, p: string) =>
      ENDPOINTS.some((e) => e.method === method && e.path === p && e.phase === 12);
    expect(has('POST', '/api/agents/:id/media')).toBe(true);
    expect(has('GET', '/api/media')).toBe(true);
    expect(has('POST', '/api/agents/:id/artifacts')).toBe(true);
    expect(has('GET', '/api/artifacts/:id/download')).toBe(true);
  });
});
