import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

let streamFailAfterChunks = 0;
let chunkCounter = 0;

const mockClient = vi.hoisted(() => {
  return {
    capabilities: async () => ({
      object: 'hermes.api_server.capabilities',
      platform: 'hermes-agent',
      model: 'hermes-agent',
      features: {},
    }),
    createSession: async () => 'sess_fase2e',
    listModels: async () => ['hermes-agent', 'hermes-fallback'],
    stopRun: async () => ({ status: 'stopping' }),
    runChatStream: async (
      params: any,
      handlers: {
        onRunId?: (runId: string) => void;
        onDelta: (delta: string) => void;
        onDone: () => void;
        onError: (why: string) => void;
      }
    ) => {
      handlers.onRunId?.('run_fase2e_test');
      chunkCounter++;
      handlers.onDelta('Bagian awal respons. ');

      if (streamFailAfterChunks > 0 && chunkCounter >= streamFailAfterChunks) {
        handlers.onError('Koneksi gateway terputus di tengah streaming');
        return;
      }

      handlers.onDelta('Bagian lanjutan respons.');
      handlers.onDone();
    },
    getSessionMessages: async (_sid: string) => [
      { id: 1, role: 'user', content: 'Halo Bagas', timestamp: 1000 },
      { id: 2, role: 'assistant', content: 'Halo kawan', timestamp: 1001 },
    ],
    sessionChatStream: async (
      _sessionId: string,
      _message: any,
      onDelta: (delta: string) => void
    ) => {
      onDelta('Halo dari fallback session');
    },
    listSkills: async () => [],
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
const agentId = 'agent_fase2e';

beforeAll(async () => {
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);

  app = buildServer({
    db,
    chatHeartbeatMs: 20,
    chatStallMs: 200,
  });
  await app.ready();

  db.prepare(
    `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
     hermes_profile, model, active, hired_at, created_at)
     VALUES (?, 'Bagas', 'Staff', 'Tech', 'bot', '{}', 'summary', 'default', 'hermes-agent', 1, ?, ?)`
  ).run(agentId, Date.now(), Date.now());
});

describe('Fase 2e — Persist Parsial & Ketahanan Obrolan (agent_runs & agent_messages)', () => {
  it('run obrolan sukses menyimpan record agent_runs (completed) dan agent_messages lengkap', async () => {
    streamFailAfterChunks = 0;
    chunkCounter = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/chat`,
      headers: { authorization: auth, 'content-type': 'application/json' },
      payload: {
        client_message_id: 'msg_f2e_success',
        messages: [{ role: 'user', content: 'Jelaskan proyek' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('Bagian awal respons');
    expect(res.payload).toContain('Bagian lanjutan respons');
    expect(res.payload).toContain('[DONE]');

    // Verifikasi agent_runs
    const run = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run_fase2e_test') as any;
    expect(run).toBeDefined();
    expect(run.status).toBe('completed');
    expect(run.client_message_id).toBe('msg_f2e_success');
    expect(run.finished_at).toBeGreaterThan(0);

    // Verifikasi agent_messages
    const messages = db
      .prepare('SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY created_at ASC')
      .all(agentId) as any[];

    expect(messages.length).toBeGreaterThanOrEqual(2);
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg.content).toBe('Jelaskan proyek');
    expect(userMsg.status).toBe('completed');

    const asstMsg = messages.find((m) => m.role === 'assistant');
    expect(asstMsg.content).toBe('Bagian awal respons. Bagian lanjutan respons.');
    expect(asstMsg.status).toBe('completed');
  });

  it('run yang terputus di tengah jalan menyimpan potongan parsial dengan status partial di SQLite', async () => {
    streamFailAfterChunks = 1;
    chunkCounter = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/chat`,
      headers: { authorization: auth, 'content-type': 'application/json' },
      payload: {
        client_message_id: 'msg_f2e_fail',
        messages: [{ role: 'user', content: 'Tuliskan laporan panjang' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('Bagian awal respons');
    expect(res.payload).toContain('run_failed');

    // Verifikasi agent_runs mencatat status failed dan error_reason
    const run = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get('run_fase2e_test') as any;
    expect(run.status).toBe('failed');
    expect(run.error_reason).toContain('Koneksi gateway terputus');

    // Verifikasi pesan asisten parsial TETAP TERSIMPAN di database (tidak hilang!)
    const asstMsg = db
      .prepare(
        "SELECT * FROM agent_messages WHERE agent_id = ? AND role = 'assistant' AND status = 'partial' ORDER BY created_at DESC LIMIT 1"
      )
      .get(agentId) as any;

    expect(asstMsg).toBeDefined();
    expect(asstMsg.content).toBe('Bagian awal respons. ');
    expect(asstMsg.status).toBe('partial');
  });

  it('GET /api/agents/:id/chat mendeteksi pesan parsial dan mengembalikan can_continue: true', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/chat`,
      headers: { authorization: auth },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.can_continue).toBe(true);
    expect(body.incomplete_message_id).toBeDefined();

    // Pesan parsial disertakan di akhir riwayat
    const lastMsg = body.messages[body.messages.length - 1];
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toBe('Bagian awal respons. ');
    expect(lastMsg.status).toBe('partial');
  });

  it('tombol Lanjutkan melanjutkan percakapan dan menyelesaikan status parsial', async () => {
    streamFailAfterChunks = 0;
    chunkCounter = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/chat`,
      headers: { authorization: auth, 'content-type': 'application/json' },
      payload: {
        client_message_id: 'msg_f2e_continue',
        messages: [{ role: 'user', content: 'Lanjutkan jawaban sebelumnya dari bagian terakhir yang terpotong.' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('[DONE]');

    // Setelah turn baru berhasil, can_continue menjadi false
    const checkRes = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/chat`,
      headers: { authorization: auth },
    });

    const checkBody = checkRes.json();
    expect(checkBody.can_continue).toBe(false);
  });

  it('GET chat mengembalikan riwayat lokal saat gateway 502 / unreachable', async () => {
    const origGetSessionMessages = mockClient.getSessionMessages;
    mockClient.getSessionMessages = async () => {
      throw new Error('Gateway Connection Refused');
    };

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/agents/${agentId}/chat`,
        headers: { authorization: auth },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.messages.length).toBeGreaterThan(0);
      expect(body.messages.some((m: any) => m.content === 'Jelaskan proyek')).toBe(true);
    } finally {
      mockClient.getSessionMessages = origGetSessionMessages;
    }
  });
});
