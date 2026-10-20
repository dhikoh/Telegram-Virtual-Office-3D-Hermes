/**
 * Fase 1 — route-level: identitas agen benar-benar sampai ke gateway.
 *
 * Kebenaran yang dijaga test ini:
 *  - Jalur sesi membawa identitas lewat `system_message` (bukan ditempel ke
 *    pesan, supaya riwayat yang dibaca kembali tetap bersih).
 *  - Jalur stateless membawa identitas sebagai pesan `role: 'system'` pertama,
 *    sebelum instruksi cakupan skill.
 *  - Agen tanpa nama (tidak mungkin lewat schema) tidak menghasilkan system
 *    prompt karangan — dipastikan lewat unit test identity.test.ts.
 *  - Riwayat yang dibaca kembali tidak menampilkan teks identitas: identitas
 *    milik gateway, bukan milik pemilik.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

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
    startRun: async () => ({ run_id: 'run_identity', status: 'started' }),
    getRunStatus: async () => ({ object: 'hermes.run', run_id: 'run_identity', status: 'completed' }),
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
        systemPrompt
          ? [{ role: 'system', content: systemPrompt }, ...messages]
          : messages
      );
    },
    listModels: async () => ['hermes-agent'],
    createSession: async () => (gateway.makeSession ? 'sess_identity' : null),
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

describe('Fase 1 — jembatan identitas', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
  };

  const AGENT_ID = 'agent_bagas_fase1';

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
        client_message_id: `msg_fase1_${++msgSeq}`,
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

  it('jalur sesi: identitas dikirim sebagai system_message, pesan tetap bersih', async () => {
    const res = await chat('siapa kamu?');
    expect(res.statusCode).toBe(200);

    expect(gateway.sessionSystem).toHaveLength(1);
    const identity = gateway.sessionSystem[0] as string;
    expect(identity).toContain('Bagas');
    expect(identity).toContain('Distributor Prospecting & Marketing');
    expect(identity).toContain('marketing');
    expect(identity).toContain('Menjual zeolit ke pabrik semen.');

    // Pesan keluar tidak dicemari identitas — stripSkillScope tidak punya
    // apa-apa untuk dibersihkan, dan riwayat tetap milik pemilik.
    expect(gateway.history).toEqual(['siapa kamu?']);
  });

  it('jalur tanpa sesi: identitas menjadi pesan system pertama', async () => {
    gateway.makeSession = false;
    const res = await chat('siapa kamu?');
    expect(res.statusCode).toBe(200);

    expect(gateway.chatCalls).toHaveLength(1);
    const first = gateway.chatCalls[0][0];
    expect(first.role).toBe('system');
    expect(first.content).toContain('Bagas');
    expect(gateway.chatCalls[0][1]).toEqual({ role: 'user', content: 'siapa kamu?' });
  });

  it('identitas giliran berikutnya ikut terkirim (bukan hanya percakapan pertama)', async () => {
    await chat('halo');
    await chat('lagi');
    expect(gateway.sessionSystem).toHaveLength(2);
    expect(gateway.sessionSystem[1]).toContain('Bagas');
  });

  it('identitas tidak pernah muncul di riwayat yang dibaca pemilik', async () => {
    await chat('siapa kamu?');
    const history = await app.inject({
      method: 'GET',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
    });
    const messages = (JSON.parse(history.body) as { messages: { content: string }[] }).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('siapa kamu?');
  });
});
