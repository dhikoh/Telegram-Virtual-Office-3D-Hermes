/**
 * Fix identitas (route level) — identitas benar-benar menang.
 *
 * Kebenaran yang dijaga:
 *  - Jalur sesi: pesan yang dikirim ke gateway MENGANDUNG blok
 *    `[IDENTITAS AGEN: ...]` di paling depan (bukan cuma system_message).
 *    Relay menaruh system prompt sendiri di belakang instruksi aplikasi,
 *    jadi hanya teks di dalam pesan yang menang.
 *  - Lapisan kedua (system_message / `instructions`) TIDAK dihapus.
 *  - Jalur tanpa sesi: identitas jadi system pertama DAN blok identitas
 *    menempel di pesan user terakhir.
 *  - Riwayat yang dibaca pemilik tidak memuat marker apa pun.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';
import { IDENTITY_MARKER } from './services/hermes/identity-scope.js';

const gateway = vi.hoisted(() => ({
  history: [] as string[],
  sessionSystem: [] as (string | undefined)[],
  chatCalls: [] as { role: string; content: string }[][],
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
    startRun: async () => ({ run_id: 'run_identity_scope', status: 'started' }),
    getRunStatus: async () => ({
      object: 'hermes.run',
      run_id: 'run_identity_scope',
      status: 'completed',
    }),
    resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
    stopRun: async () => ({ status: 'stopping' }),
    streamEvents: async () => () => {},
    chatStream: async (
      messages: { role: string; content: string }[],
      _onChunk?: unknown,
      _model?: unknown,
      systemPrompt?: string
    ) => {
      gateway.chatCalls.push(
        systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages
      );
    },
    listModels: async () => ['hermes-agent'],
    createSession: async () => (gateway.makeSession ? 'sess_identity_scope' : null),
    getSessionMessages: async () =>
      gateway.history.map((content, i) => ({
        id: i + 1,
        role: 'user',
        content,
        timestamp: Date.now(),
      })),
    sessionChatStream: async (
      _sid: string,
      message: unknown,
      _onDelta?: unknown,
      _model?: unknown,
      systemPrompt?: string
    ) => {
      gateway.sessionSystem.push(systemPrompt);
      gateway.history.push(typeof message === 'string' ? message : JSON.stringify(message));
    },
    listSkills: async () => [],
  } as unknown as import('./services/hermes/client.interface.js').HermesClient;

  return { ...actual, getServerHermesClient: () => stub, getHermesClientForAgent: () => stub };
});

describe('Fix identitas — blok identitas di pesan user', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
  };

  const AGENT_ID = 'agent_bagas_identity_scope';

  const seedAgent = () => {
    db.prepare(
      `INSERT OR REPLACE INTO agents
         (id, name, role, department, avatar, soul_summary, hermes_base_url,
          api_key_env, hermes_profile, active, hired_at, created_at, is_system, avatar_style)
       VALUES (?, 'Bagas', 'Distributor Prospecting & Marketing', 'marketing', '🧢',
               'Menjual zeolit ke pabrik semen.', '', 'HERMES_KEY_DEFAULT',
               'default', 1, 1, 1, 0, NULL)`
    ).run(AGENT_ID);
  };

  let msgSeq = 0;
  const chat = (content: string) =>
    app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
      body: JSON.stringify({
        client_message_id: `msg_identity_scope_${++msgSeq}`,
        messages: [{ role: 'user', content }],
      }),
    });

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  beforeEach(() => {
    gateway.history = [];
    gateway.sessionSystem = [];
    gateway.chatCalls = [];
    gateway.makeSession = true;
    db.prepare('DELETE FROM agent_sessions WHERE agent_id = ?').run(AGENT_ID);
    db.prepare('DELETE FROM agents WHERE id = ?').run(AGENT_ID);
    seedAgent();
  });

  it('jalur sesi: blok identitas ada di PALING DEPAN pesan user', async () => {
    const res = await chat('Siapa namamu, perkenalkan dirimu');
    expect(res.statusCode).toBe(200);

    expect(gateway.history).toHaveLength(1);
    const sent = gateway.history[0];
    // Blok identitas paling depan — inilah teks yang tidak bisa ditimpa relay.
    expect(sent.startsWith(IDENTITY_MARKER)).toBe(true);
    expect(sent).toContain('Bagas');
    expect(sent).toContain('Distributor Prospecting & Marketing');
    expect(sent).toContain('marketing');
    expect(sent).toContain('Menjual zeolit ke pabrik semen.');
    // Pesan pemilik tetap utuh di belakang blok.
    expect(sent).toContain('Siapa namamu, perkenalkan dirimu');
    expect(sent.indexOf('Siapa namamu')).toBeGreaterThan(sent.indexOf(IDENTITY_MARKER));
  });

  it('lapisan kedua system_message TIDAK dihapus', async () => {
    await chat('Siapa namamu?');
    expect(gateway.sessionSystem).toHaveLength(1);
    expect(gateway.sessionSystem[0]).toContain('Bagas');
    expect(gateway.sessionSystem[0]).toContain('Distributor Prospecting & Marketing');
  });

  it('blok identitas tidak menggandakan pada giliran berikutnya', async () => {
    await chat('halo');
    await chat('lagi');
    expect(gateway.history).toHaveLength(2);
    for (const sent of gateway.history) {
      expect(sent.split(IDENTITY_MARKER).length - 1).toBe(1);
    }
  });

  it('jalur tanpa sesi: system pertama identitas DAN blok menempel di pesan user', async () => {
    gateway.makeSession = false;
    const res = await chat('Siapa namamu?');
    expect(res.statusCode).toBe(200);

    expect(gateway.chatCalls).toHaveLength(1);
    const first = gateway.chatCalls[0][0];
    expect(first.role).toBe('system');
    expect(first.content).toContain('Bagas');

    const userMsg = gateway.chatCalls[0].find((m) => m.role === 'user');
    expect(userMsg?.content.startsWith(IDENTITY_MARKER)).toBe(true);
    expect(userMsg?.content).toContain('Siapa namamu?');
  });

  it('riwayat yang dibaca pemilik tidak memuat marker identitas maupun cakupan skill', async () => {
    await chat('Siapa namamu, perkenalkan dirimu');
    const history = await app.inject({
      method: 'GET',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
    });
    const messages = (JSON.parse(history.body) as { messages: { content: string }[] }).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Siapa namamu, perkenalkan dirimu');
    expect(messages[0].content).not.toContain(IDENTITY_MARKER);
    expect(messages[0].content).not.toContain('[CAKUPAN SKILL AGEN:');
  });

  it('riwayat lokal (tanpa sesi) juga bersih dari marker', async () => {
    gateway.makeSession = false;
    await chat('Siapa namamu?');
    const history = await app.inject({
      method: 'GET',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
    });
    const messages = (JSON.parse(history.body) as { messages: { content: string }[] }).messages;
    const userMessages = messages.filter((m) => m.content.includes('Siapa namamu'));
    expect(userMessages.length).toBeGreaterThan(0);
    for (const m of userMessages) {
      expect(m.content).not.toContain(IDENTITY_MARKER);
    }
  });
});
