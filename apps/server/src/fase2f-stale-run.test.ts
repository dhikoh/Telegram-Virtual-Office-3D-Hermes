/**
 * Fix run nyangkut (route level) — regresi.
 *
 * Kebenaran yang dijaga: run yang stream-nya putus TIDAK boleh tertinggal
 * 'running' tanpa finished_at. Gejala produksi (25 Okt 2026): 7 run
 * 'running' tanpa finished_at, UI nempel "Bagas sedang mengetik..." selamanya.
 *
 * Diuji lewat jalur nyata: mock gateway membuka run, lalu aliran terputus
 * sebelum event terminal tiba (persis seperti koneksi yang mati). Setelah
 * stream berakhir, baris run wajib 'interrupted' — bukan 'running'.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

const { mockClient, state } = vi.hoisted(() => ({
  mockClient: {
    capabilities: async () => ({
      object: 'hermes.api_server.capabilities',
      platform: 'hermes-agent',
      model: 'hermes-agent',
      features: {},
    }),
    startRun: async () => ({ run_id: 'run_drop_test', status: 'started' }),
    getRunStatus: async () => ({
      object: 'hermes.run',
      run_id: 'run_drop_test',
      status: 'running',
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
        onError?: (message: string) => void;
      }
    ) => {
      handlers.onRunId?.('run_drop_test');
      handlers.onDelta('sedang mengetik...');
      if (state.dropStream) {
        // Koneksi putus di tengah jalan: run sudah terbuka, TIDAK ada event
        // terminal. Ini persis bentuk kegagalan produksi — baris agent_runs
        // tertinggal 'running' tanpa finished_at kalau tidak ada penutup.
        throw new Error('koneksi gateway putus di tengah stream');
      }
      handlers.onDone();
    },
    chatStream: async () => {},
    listModels: async () => ['hermes-agent'],
    createSession: async () => 'sess_drop',
    getSessionMessages: async () => [],
    sessionChatStream: async () => {},
    listSkills: async () => [],
  },
  state: { dropStream: true },
}));

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();
  return {
    ...actual,
    getHermesClientForAgent: () => mockClient,
  };
});

describe('Fix run nyangkut — stream putus tidak meninggalkan run "running"', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const auth = 'tma ' + createTelegramInitData(ownerUser, botToken);
  const AGENT_ID = 'agent_drop_test';

  const readRun = (id: string) =>
    db.prepare('SELECT status, finished_at FROM agent_runs WHERE id = ?').get(id) as
      | { status: string; finished_at: number | null }
      | undefined;

  const runningCount = () =>
    (
      db.prepare("SELECT COUNT(*) AS c FROM agent_runs WHERE status = 'running'").get() as {
        c: number;
      }
    ).c;

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
    app = buildServer({ db, chatHeartbeatMs: 20 });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it('run yang stream-nya putus ditutup menjadi interrupted, bukan running', async () => {
    state.dropStream = true;
    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: { authorization: auth, 'content-type': 'application/json' },
      payload: {
        client_message_id: 'msg_drop_1',
        messages: [{ role: 'user', content: 'Siapa namamu?' }],
      },
    });

    expect(res.statusCode).toBe(200);
    // Potongan yang sudah sampai tetap terkirim ke pemilik.
    expect(res.payload).toContain('sedang mengetik...');

    const run = readRun('run_drop_test');
    expect(run).toBeTruthy();
    // Bukan 'running' tanpa finished_at — itu gejala produksi.
    expect(run!.status).toBe('interrupted');
    expect(run!.finished_at).toBeGreaterThan(0);
  });

  it('tidak ada run "running" yang tertinggal setelah stream berakhir', async () => {
    expect(runningCount()).toBe(0);
  });

  it('giliran yang selesai normal tetap "completed" (penutup tidak merusak jalan normal)', async () => {
    state.dropStream = false;
    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: { authorization: auth, 'content-type': 'application/json' },
      payload: {
        client_message_id: 'msg_drop_2',
        messages: [{ role: 'user', content: 'halo' }],
      },
    });

    expect(res.statusCode).toBe(200);
    const run = readRun('run_drop_test');
    expect(run!.status).toBe('completed');
    expect(runningCount()).toBe(0);
  });
});
