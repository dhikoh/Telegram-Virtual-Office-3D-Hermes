/**
 * Fase 2a (route level) — stream chat memancarkan detak, dan detaknya berhenti.
 *
 * Kebenaran yang dijaga:
 *  - Selama gateway belum menjawab, klien tetap menerima frame `: hb` sehingga
 *    Cloudflare tidak memutus koneksi idle di ~100 detik.
 *  - Setelah stream selesai, tidak ada frame tambahan (interval dibersihkan).
 *  - Frame heartbeat ditulis SEBELUM data apa pun, jadi klien tahu koneksi hidup
 *    bahkan sebelum token pertama sampai.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

const gateway = vi.hoisted(() => ({
  /** Berapa lama "gateway" berdiam diri sebelum menjawab (ms). */
  delayMs: 0,
  sessionSystem: [] as (string | undefined)[],
  makeSession: true,
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
    startRun: async () => ({ run_id: 'run_hb', status: 'started' }),
    getRunStatus: async () => ({ object: 'hermes.run', run_id: 'run_hb', status: 'completed' }),
    resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
    stopRun: async () => ({ status: 'stopping' }),
    streamEvents: async () => () => {},
    chatStream: async () => {
      // Jalur stateless juga harus membuktikan detaknya: stub ikut menunda.
      if (gateway.delayMs > 0) await new Promise((r) => setTimeout(r, gateway.delayMs));
    },
    listModels: async () => ['hermes-agent'],
    createSession: async () => (gateway.makeSession ? 'sess_hb' : null),
    getSessionMessages: async () => [],
    sessionChatStream: async (
      _sid: string,
      _message: unknown,
      onDelta: (d: string) => void,
      _model?: unknown,
      systemPrompt?: string
    ) => {
      gateway.sessionSystem.push(systemPrompt);
      if (gateway.delayMs > 0) await new Promise((r) => setTimeout(r, gateway.delayMs));
      onDelta('jawaban');
    },
    listSkills: async () => [],
  } as unknown as import('./services/hermes/client.interface.js').HermesClient;

  return { ...actual, getServerHermesClient: () => stub, getHermesClientForAgent: () => stub };
});

describe('Fase 2a — detak stream chat', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
  };

  const AGENT_ID = 'agent_hb';

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    // Interval 25 ms: cukup pendek untuk diuji, cukup nyata untuk membuktikan
    // timer benar-benar berdetak.
    app = buildServer({ db, chatHeartbeatMs: 25 });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  beforeEach(() => {
    gateway.delayMs = 0;
    gateway.sessionSystem = [];
    gateway.makeSession = true;
    db.prepare('DELETE FROM agent_sessions WHERE agent_id = ?').run(AGENT_ID);
    db.prepare('DELETE FROM agents WHERE id = ?').run(AGENT_ID);
    db.prepare(
      `INSERT OR REPLACE INTO agents
         (id, name, role, department, avatar, soul_summary, hermes_base_url,
          api_key_env, hermes_profile, active, hired_at, created_at, is_system, avatar_style)
       VALUES (?, 'Bagas', 'Distributor', 'marketing', '🧢', '', '', 'HERMES_KEY_DEFAULT',
               'default', 1, 1, 1, 0, NULL)`
    ).run(AGENT_ID);
  });

  const chat = () =>
    app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'siapa kamu?' }] }),
    });

  it('menunggu tool yang lama tetap mengirim detak, lalu menutup dengan bersih', async () => {
    gateway.delayMs = 110; // > 4 interval
    const res = await chat();
    expect(res.statusCode).toBe(200);

    const beats = res.body.split(': hb').length - 1;
    expect(beats).toBeGreaterThanOrEqual(3);
    expect(res.body).toContain('jawaban');
    expect(res.body).toContain('[DONE]');
  });

  it('stream cepat pun mendapat setidaknya satu detak sebelum data', async () => {
    const res = await chat();
    expect(res.statusCode).toBe(200);
    expect(res.body.indexOf(': hb')).toBeLessThan(res.body.indexOf('jawaban'));
  });

  it('jumlah detak tiap stream dibatasi oleh durasi streamnya sendiri', async () => {
    gateway.delayMs = 60; // ~2-3 detak pada interval 25 ms
    const res = await chat();
    const beats = res.body.split(': hb').length - 1;
    // Bila interval bocor antar-permintaan, angka ini akan tumbuh tanpa batas.
    // Batas atasnya sengaja longgar: yang dijaga bukan presisi timing, tapi
    // ketiadaan akumulasi. Pembersihan timer sendiri diuji di unit test
    // heartbeat.test.ts (stop() melepaskan interval).
    expect(beats).toBeGreaterThanOrEqual(1);
    expect(beats).toBeLessThanOrEqual(5);
  });

  it('jalur stateless juga hidup — heartbeat bukan milik jalur sesi saja', async () => {
    gateway.makeSession = false;
    gateway.delayMs = 110;
    const res = await chat();
    expect(res.statusCode).toBe(200);
    expect(res.body.split(': hb').length - 1).toBeGreaterThanOrEqual(3);
  });
});
