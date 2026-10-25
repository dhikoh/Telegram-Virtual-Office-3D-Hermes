/**
 * Fix materialisasi task (route level) — regresi.
 *
 * Kebenaran yang dijaga: setiap run yang MENYELESAIKAN giliran menghasilkan
 * tepat satu task. Bukti produksi (25 Okt 2026): 10 run hanya menghasilkan
 * 1 task — karena hanya turn yang memanggil tool yang dibuatkan task.
 *
 * Diuji lewat jalur nyata: satu giliran chat biasa (tanpa tool) ke agen
 * bersoul → tabel tasks bertambah tepat satu baris dengan source 'chat'.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    capabilities: async () => ({
      object: 'hermes.api_server.capabilities',
      platform: 'hermes-agent',
      model: 'hermes-agent',
      features: {},
    }),
    startRun: async () => ({ run_id: 'run_task_mat', status: 'started' }),
    getRunStatus: async () => ({
      object: 'hermes.run',
      run_id: 'run_task_mat',
      status: 'completed',
    }),
    resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
    stopRun: async () => ({ status: 'stopping' }),
    streamEvents: async () => () => {},
    runChatStream: async (
      _params: unknown,
      handlers: {
        onRunId?: (runId: string) => void;
        onDelta: (delta: string) => void;
        onDone: () => void;
      }
    ) => {
      handlers.onRunId?.('run_task_mat');
      handlers.onDelta('Saya Bagas, distributor prospek & marketing.');
      handlers.onDone();
    },
    chatStream: async () => {},
    listModels: async () => ['hermes-agent'],
    createSession: async () => 'sess_task_mat',
    getSessionMessages: async () => [],
    sessionChatStream: async () => {},
    listSkills: async () => [],
  },
}));

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();
  return {
    ...actual,
    getHermesClientForAgent: () => mockClient,
  };
});

describe('Fix materialisasi — satu run selesai = satu task', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const auth = 'tma ' + createTelegramInitData(ownerUser, botToken);
  const AGENT_ID = 'agent_task_mat';

  const tasks = () =>
    db
      .prepare('SELECT id, title, status, source, run_id, result_md, tool_calls_count FROM tasks')
      .all() as {
      id: string;
      title: string;
      status: string;
      source: string;
      run_id: string | null;
      result_md: string | null;
      tool_calls_count: number;
    }[];

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    db.prepare(
      `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
         hermes_profile, active, hired_at, created_at)
       VALUES (?, 'Bagas', 'Distributor Prospecting & Marketing', 'marketing', 'bot', '{}',
               'Menjual zeolit ke pabrik semen.', 'default', 1, ?, ?)`
    ).run(AGENT_ID, Date.now(), Date.now());
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it('giliran obrolan biasa (tanpa tool) tetap menghasilkan tepat satu task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: { authorization: auth, 'content-type': 'application/json' },
      payload: {
        client_message_id: 'msg_task_mat_1',
        messages: [{ role: 'user', content: 'Siapa namamu, perkenalkan dirimu' }],
      },
    });
    expect(res.statusCode).toBe(200);

    const rows = tasks();
    expect(rows).toHaveLength(1);
    expect(rows[0].run_id).toBe('run_task_mat');
    expect(rows[0].source).toBe('chat');
    expect(rows[0].status).toBe('done');
    expect(rows[0].title).toBe('Siapa namamu, perkenalkan dirimu');
    expect(rows[0].result_md).toBe('Saya Bagas, distributor prospek & marketing.');
    expect(rows[0].tool_calls_count).toBe(0);
  });

  it('run_events tetap terisi (materialisasi tidak menggantikan jejak peristiwa)', async () => {
    const events = db
      .prepare('SELECT type FROM run_events WHERE run_id = ? ORDER BY id ASC')
      .all('run_task_mat') as { type: string }[];
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'run.started')).toBe(true);
    expect(events.some((e) => e.type === 'message.delta')).toBe(true);
    expect(events.some((e) => e.type === 'run.completed')).toBe(true);
  });
});
