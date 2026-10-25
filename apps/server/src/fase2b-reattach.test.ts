/**
 * Fase 2b (route level) — sambung ulang ke run yang masih berjalan.
 *
 * Kebenaran yang dijaga:
 *  - Run milik agen lain tidak pernah terlihat (404, bukan bocor data).
 *  - Riwayat diputar ulang dari papan; `?seq=` tidak mengulang yang sudah
 *    dikirim klien.
 *  - Run yang sudah selesai langsung ditutup `[DONE]`, tanpa menggantung.
 *  - Run yang belum dikenal juga 404 — bukan stream kosong yang menggantung.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';
import { chatRunHub } from './services/agent-chat/run-hub.js';
import { agentChatQueue } from './services/agent-chat/queue.js';

const { mockClient } = vi.hoisted(() => {
  return {
    mockClient: {
      capabilities: async () => ({
        object: 'hermes.api_server.capabilities',
        platform: 'hermes-agent',
        model: 'hermes-agent',
        features: {},
      }),
      startRun: async () => ({ run_id: 'run_unused', status: 'started' }),
      getRunStatus: async () => ({ object: 'hermes.run', run_id: 'run_unused', status: 'completed' }),
      resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
      stopRun: async () => ({ status: 'stopping' }),
      streamEvents: async () => () => {},
      runChatStream: async (
        _params: any,
        handlers: {
          onRunId?: (runId: string) => void;
          onDelta: (delta: string) => void;
          onDone: () => void;
          onError?: (message: string) => void;
        }
      ) => {
        handlers.onRunId?.('run_chat_test_1');
        handlers.onDelta('Halo ');
        handlers.onDelta('dunia');
        handlers.onDone();
      },
      chatStream: async () => {},
      listModels: async () => ['hermes-agent'],
      createSession: async () => 'sess_x',
      getSessionMessages: async () => [],
      sessionChatStream: async (
        _sessionId: string,
        _message: any,
        onDelta: (delta: string) => void
      ) => {
        onDelta('Halo dari fallback session');
      },
      listSkills: async () => [],
    },
  };
});

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();
  return {
    ...actual,
    getHermesClientForAgent: () => mockClient,
  };
});

let app: FastifyInstance;
let db: BetterSqlite3.Database;
const botToken = 'mock_telegram_bot_token';
const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
const auth = 'tma ' + createTelegramInitData(ownerUser, botToken);
let agentId: string;
let otherAgentId: string;

beforeAll(async () => {
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  app = buildServer({ db, chatHeartbeatMs: 20 });
  await app.ready();

  const mk = (id: string, name: string) =>
    db
      .prepare(
        // Kolom disesuaikan dengan skema 001..004 — `agents` tidak punya
        // kolom `status` (itu milik tabel tasks/approvals).
        `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
         hermes_profile, model, active, hired_at, created_at)
         VALUES (?, ?, 'anggota', 'Tech', 'bot', '{}', 'ringkas', 'default', NULL, 1, ?, ?)`
      )
      .run(id, name, Date.now(), Date.now());

  mk('agent_a', 'Bagas');
  mk('agent_b', 'Sinta');
  agentId = 'agent_a';
  otherAgentId = 'agent_b';
});

afterAll(async () => {
  await app.close();
  db.close();
});

beforeEach(() => {
  chatRunHub.prune(Date.now() + 60 * 60 * 1000); // papan bersih tiap uji
});

async function get(path: string) {
  return app.inject({
    method: 'GET',
    url: path,
    headers: { authorization: auth },
  });
}

describe('Fase 2b — GET /api/agents/:id/runs/:runId/stream', () => {
  it('run milik agen lain tidak terlihat (404)', async () => {
    chatRunHub.start('run_other', otherAgentId);
    chatRunHub.append('run_other', 'message.delta', { delta: 'rahasia Sinta' });
    chatRunHub.finish('run_other');

    const res = await get(`/api/agents/${agentId}/runs/run_other/stream`);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('rahasia');
  });

  it('run yang tidak dikenal tidak menggantung: 404', async () => {
    const res = await get(`/api/agents/${agentId}/runs/run_hantu/stream`);
    expect(res.statusCode).toBe(404);
  });

  it('riwayat diputar ulang untuk run yang sudah selesai, ditutup [DONE]', async () => {
    chatRunHub.start('run_done', agentId);
    chatRunHub.append('run_done', 'message.delta', { delta: 'Halo ' });
    chatRunHub.append('run_done', 'message.delta', { delta: 'dunia' });
    chatRunHub.append('run_done', 'run.completed', {});
    chatRunHub.finish('run_done');

    const res = await get(`/api/agents/${agentId}/runs/run_done/stream`);
    expect(res.statusCode).toBe(200);
    const text = res.payload;
    expect(text).toContain('Halo ');
    expect(text).toContain('dunia');
    expect(text).toContain('[DONE]');
  });

  it('?seq= tidak mengulang potongan yang sudah dikirim klien', async () => {
    chatRunHub.start('run_seq', agentId);
    chatRunHub.append('run_seq', 'message.delta', { delta: 'pertama' });
    chatRunHub.append('run_seq', 'message.delta', { delta: 'kedua' });
    chatRunHub.append('run_seq', 'run.completed', {});
    chatRunHub.finish('run_seq');

    const res = await get(`/api/agents/${agentId}/runs/run_seq/stream?seq=1`);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('kedua');
    expect(res.payload).not.toContain('pertama');
  });

  it('run gagal diputar ulang sebagai frame galat yang jelas', async () => {
    chatRunHub.start('run_bad', agentId);
    chatRunHub.append('run_bad', 'run.failed', { error: 'provider meledak' });
    chatRunHub.finish('run_bad');

    const res = await get(`/api/agents/${agentId}/runs/run_bad/stream`);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('provider meledak');
    // Bukan penutup diam-diam: klien diberi tahu ini kegagalan.
    expect(res.payload).toContain('error');
  });

  it('tanpa auth ditolak sebelum apa pun ditulis', async () => {
    chatRunHub.start('run_auth', agentId);
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/runs/run_auth/stream`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Fase 2b — POST /api/agents/:id/chat & Restart-Tolerant Reattach (E2E Route Level)', () => {
  it('POST chat memanggil runChatStream, mengirim run_id di frame pertama, daftar ke hub, dan simpan ke DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/chat`,
      headers: {
        authorization: auth,
        'content-type': 'application/json',
      },
      payload: {
        client_message_id: 'msg_f2b_1',
        messages: [{ role: 'user', content: 'Halo Bagas' }],
      },
    });

    expect(res.statusCode).toBe(200);
    const lines = res.payload.split('\n\n').filter(Boolean);
    // Frame pertama HARUS run_id
    expect(lines[0]).toContain('{"run_id":"run_chat_test_1"}');
    // Frame berikutnya adalah delta
    expect(res.payload).toContain('Halo ');
    expect(res.payload).toContain('dunia');
    // Diakhiri [DONE]
    expect(res.payload).toContain('[DONE]');

    // Terdaftar di chatRunHub
    expect(chatRunHub.has('run_chat_test_1')).toBe(true);
    expect(chatRunHub.agentOf('run_chat_test_1')).toBe(agentId);

    // Tersimpan di tabel run_events SQLite
    const saved = db
      .prepare('SELECT type, payload_json FROM run_events WHERE run_id = ? ORDER BY id ASC')
      .all('run_chat_test_1') as { type: string; payload_json: string }[];
    expect(saved.length).toBeGreaterThanOrEqual(3);
    expect(saved.some((r) => r.type === 'message.delta')).toBe(true);
    expect(saved.some((r) => r.type === 'run.completed')).toBe(true);
  });

  it('Reattach membaca run_events dari DB setelah restart (papan memori bersih)', async () => {
    // Simulasikan server restart: buang semua data dari memori chatRunHub
    chatRunHub.prune(Date.now() + 1000 * 60 * 60 * 24);
    expect(chatRunHub.has('run_chat_test_1')).toBe(false);
    expect(chatRunHub.agentOf('run_chat_test_1')).toBeNull();

    // Klien menyambung ulang ke run yang sudah ada di DB
    const res = await get(`/api/agents/${agentId}/runs/run_chat_test_1/stream`);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('Halo ');
    expect(res.payload).toContain('dunia');
    expect(res.payload).toContain('[DONE]');
  });

  it('Reattach dari DB dengan ?seq=1 tidak mengulang frame yang sudah diterima klien', async () => {
    // Pastikan memori hub tetap bersih (kondisi restart)
    chatRunHub.prune(Date.now() + 1000 * 60 * 60 * 24);

    const res = await get(`/api/agents/${agentId}/runs/run_chat_test_1/stream?seq=1`);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('dunia');
    expect(res.payload).not.toContain('Halo ');
  });

  it('POST chat fallback ke sessionChatStream bila runChatStream gagal di awal', async () => {
    const origRunChatStream = mockClient.runChatStream;
    mockClient.runChatStream = async () => {
      throw new Error('Gateway 404 Runs API not supported');
    };

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: {
          authorization: auth,
          'content-type': 'application/json',
        },
        payload: {
          client_message_id: 'msg_f2b_2',
          messages: [{ role: 'user', content: 'Halo Bagas via session' }],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.payload).toContain('Halo dari fallback session');
      expect(res.payload).toContain('[DONE]');
    } finally {
      mockClient.runChatStream = origRunChatStream;
    }
  });

  it('POST chat dengan X-Run-Id menyambung ke run yang masih hidup tanpa membuat giliran baru', async () => {
    chatRunHub.start('run_live_reconnect', agentId);
    chatRunHub.append('run_live_reconnect', 'message.delta', { delta: 'sedang jalan' });
    chatRunHub.finish('run_live_reconnect');

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/chat`,
      headers: {
        authorization: auth,
        'content-type': 'application/json',
        'x-run-id': 'run_live_reconnect',
      },
      payload: {
        messages: [{ role: 'user', content: 'Pertanyaan sama' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('sedang jalan');
  });
});

describe('Fase 2c — Antrian Chat per Agen (Route Level)', () => {
  /** Sinyal "run pertama sudah mulai" — diisi per tes, dipakai mock gateway. */
  let queueFirstStarted: (() => void) | null = null;

  beforeEach(() => {
    // Sinyal flake-guard tidak boleh bocor antar tes: promise yang sudah
    // resolve dari tes sebelumnya akan membuat tes berikutnya "langsung lolos"
    // tanpa benar-benar menunggu apa pun.
    queueFirstStarted = null;
  });

  it('3 pesan beruntun ke POST /api/agents/:id/chat diproses berurutan (FIFO)', async () => {
    const executedOrder: string[] = [];
    // Fix flake: menunggu 20 ms lalu BERASUMSI request pertama sudah masuk
    // antrian. Saat event loop sibuk, urutan bisa berubah dan assertion FIFO
    // gagal tanpa ada yang rusak. Sinyal nyata dipakai sebagai gantinya.
    const firstStarted = new Promise<void>((resolve) => {
      queueFirstStarted = resolve;
    });
    const origRunChatStream = mockClient.runChatStream;

    mockClient.runChatStream = async (params: any, handlers: any) => {
      // Fix identitas: pesan keluar kini berprefiks blok identitas, jadi yang
      // dibandingkan adalah pesan pemilik di BELAKANG blok — bukan seluruh
      // string. Yang diuji di sini tetap urutan FIFO, bukan isi blok.
      const input = String(params.input).replace(/^\[IDENTITAS AGEN:[^\]]*\]\s*/, '');
      executedOrder.push(`start:${input}`);
      queueFirstStarted?.();
      await new Promise((r) => setTimeout(r, 20));
      handlers.onRunId?.(`run_${input}`);
      handlers.onDelta(`jawaban untuk ${input}`);
      handlers.onDone();
      executedOrder.push(`done:${input}`);
    };

    try {
      const p1 = app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: { client_message_id: 'msg_fifo_1', messages: [{ role: 'user', content: 'pesan_1' }] },
      });
      const p2 = app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: { client_message_id: 'msg_fifo_2', messages: [{ role: 'user', content: 'pesan_2' }] },
      });
      const p3 = app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: { client_message_id: 'msg_fifo_3', messages: [{ role: 'user', content: 'pesan_3' }] },
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      expect(r3.statusCode).toBe(200);

      expect(r1.payload).toContain('jawaban untuk pesan_1');
      expect(r2.payload).toContain('jawaban untuk pesan_2');
      expect(r3.payload).toContain('jawaban untuk pesan_3');

      // Memastikan eksekusi benar-benar sekuensial FIFO: start 1 -> done 1 -> start 2 -> done 2 -> start 3 -> done 3
      expect(executedOrder).toEqual([
        'start:pesan_1',
        'done:pesan_1',
        'start:pesan_2',
        'done:pesan_2',
        'start:pesan_3',
        'done:pesan_3',
      ]);
    } finally {
      mockClient.runChatStream = origRunChatStream;
    }
  });

  it('menolak HTTP 429 jika antrian pesan melebihi batas maksimal 5', async () => {
    let releaseActive: () => void;
    const blockActive = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });

    // Fix flake: sinyal nyata bahwa request pertama sudah benar-benar aktif.
    const firstStarted = new Promise<void>((resolve) => {
      queueFirstStarted = resolve;
    });

    const origRunChatStream = mockClient.runChatStream;
    mockClient.runChatStream = async (_params: any, handlers: any) => {
      handlers.onRunId?.('run_blocking');
      queueFirstStarted?.();
      await blockActive;
      handlers.onDelta('selesai');
      handlers.onDone();
    };

    try {
      // 1 aktif
      const activeP = app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: { client_message_id: 'msg_block_active', messages: [{ role: 'user', content: 'blocking_run' }] },
      });

      // Fix flake: tunggu request pertama BENAR-BENAR aktif (sinyal dari mock
      // gateway), bukan sekian milidetik lewat. Tanpa ini, saat event loop
      // sibuk kelima pesan bisa masuk sebelum yang pertama mulai, dan hitungan
      // antrian jadi salah — tes 429 gagal tanpa ada yang rusak.
      await firstStarted;

      // 5 menunggu di antrian
      const pendingPs = [];
      for (let i = 1; i <= 5; i++) {
        pendingPs.push(
          app.inject({
            method: 'POST',
            url: `/api/agents/${agentId}/chat`,
            headers: { authorization: auth, 'content-type': 'application/json' },
            payload: { client_message_id: `msg_queue_${i}`, messages: [{ role: 'user', content: `queue_${i}` }] },
          })
        );
      }

      // Antrian dihitung dari pemanggil yang SUDAH terdaftar. Menunggu sinyal
      // yang sama tidak cukup (sudah resolve), jadi pakai kondisi nyata:
      // jumlah pesan tertunda untuk agen ini sudah 5.
      const queueDeadline = Date.now() + 5000;
      while (
        agentChatQueue.getPendingCount(agentId) < 5 &&
        Date.now() < queueDeadline
      ) {
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(agentChatQueue.getPendingCount(agentId)).toBe(5);

      // Request ke-7 (antrian ke-6) harus ditolak 429
      const overflowRes = await app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth, 'content-type': 'application/json' },
        payload: { client_message_id: 'msg_overflow', messages: [{ role: 'user', content: 'overflow' }] },
      });

      expect(overflowRes.statusCode).toBe(429);
      expect(overflowRes.json().error).toBe('queue_full');

      // Lepaskan blokir agar semua yang mengantri selesai
      releaseActive!();
      await activeP;
      await Promise.all(pendingPs);
    } finally {
      mockClient.runChatStream = origRunChatStream;
    }
  });
});

