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

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();
  return {
    ...actual,
    getHermesClientForAgent: () => ({
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
      runChatStream: async () => {},
      chatStream: async () => {},
      listModels: async () => ['hermes-agent'],
      createSession: async () => 'sess_x',
      getSessionMessages: async () => [],
      sessionChatStream: async () => {},
      listSkills: async () => [],
    }),
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
