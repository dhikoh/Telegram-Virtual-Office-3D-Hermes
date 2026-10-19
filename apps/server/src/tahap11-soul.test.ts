/**
 * Tahap 11 (bagian 2) — toggle skill aktif per agen (layer SOUL).
 *
 * Kebenaran yang dijaga test ini:
 *  - Tabel `agent_skills` TIDAK di-seed: agen tanpa baris = SELURUH katalog
 *    skill gateway aktif (bawaan), dan skill baru yang terpasang ikut aktif.
 *  - PATCH `{ skills: string[] }` adalah daftar LENGKAP skill aktif; server
 *    menyimpan komplemennya (yang dimatikan) sebagai baris.
 *  - Nama wajib ada di katalog gateway saat ini: nama lain → 400 unknown_skill
 *    yang menyebut pelanggarnya; katalog tidak terbaca → 503 (tanpa katalog
 *    mustahil memvalidasi).
 *  - Agen sistem ditolak 403 system_agent (sama dengan guardrail hapus/nonaktif).
 *  - Aksi sukses meninggalkan baris audit `agent.skills_updated`.
 *  - Gateway TIDAK punya sakelar skill per sesi (lihat services/hermes/
 *    skill-scope.ts): cakupan diterapkan sebagai instruksi yang ikut dalam
 *    giliran chat, dan garis itu dibersihkan lagi saat riwayat dibaca.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { ENDPOINTS } from '@hermes-office/shared';
import { createTelegramInitData } from './auth.test.js';
import { invalidateGatewayCatalogCache } from './services/skill-catalog.js';

const gateway = vi.hoisted(() => ({
  catalog: [] as { name: string; description: string }[],
  failCatalog: false,
  /** Giliran yang benar-benar terkirim ke jalur sesi gateway. */
  history: [] as string[],
  /** Giliran yang terkirim ke jalur stateless (/v1/chat/completions). */
  chatCalls: [] as { role: string; content: string }[][],
  /** Fase 1 — `system_message` yang diteruskan ke jalur sesi per giliran. */
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
    startRun: async () => ({ run_id: 'run_soul_mock', status: 'started' }),
    getRunStatus: async () => ({
      object: 'hermes.run',
      run_id: 'run_soul_mock',
      status: 'completed',
      output: 'Selesai.',
    }),
    resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
    stopRun: async () => ({ status: 'stopping' }),
    streamEvents: async () => () => {},
    chatStream: async (messages: { role: string; content: string }[]) => {
      gateway.chatCalls.push(messages);
    },
    listModels: async () => ['hermes-agent'],
    createSession: async () => (gateway.makeSession ? 'sess_soul_test' : null),
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
    listSkills: async () => {
      if (gateway.failCatalog) throw new Error('gateway 500 saat mendaftar skill');
      return gateway.catalog.map((s) => ({ ...s }));
    },
  } as unknown as import('./services/hermes/client.interface.js').HermesClient;

  return { ...actual, getServerHermesClient: () => stub, getHermesClientForAgent: () => stub };
});

describe('Tahap 11 (bagian 2) — cakupan skill per agen', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
  };

  const AGENT_ID = 'agent_aria_skill';
  const CATALOG = ['codebase-inspection', 'invoice-parser', 'pdf-tools'];

  const seedAgent = (id: string, isSystem = 0) => {
    db.prepare(
      `INSERT OR REPLACE INTO agents
         (id, name, role, department, avatar, soul_summary, hermes_base_url,
          api_key_env, hermes_profile, active, hired_at, created_at, is_system, avatar_style)
       VALUES (?, ?, ?, 'command', '🤖', 'Jiwa uji', '', 'HERMES_KEY_DEFAULT',
               'default', 1, 1, 1, ?, NULL)`
    ).run(id, `Agen ${id}`, 'Peran uji', isSystem);
  };

  const skillRows = (agentId: string) =>
    db
      .prepare('SELECT skill FROM agent_skills WHERE agent_id = ? ORDER BY skill')
      .all(agentId) as { skill: string }[];

  const auditRows = (action: string, target: string) =>
    db
      .prepare('SELECT detail_json FROM audit_log WHERE action = ? AND target = ?')
      .all(action, target) as { detail_json: string }[];

  const get = (url: string, headers = authHeader) => app.inject({ method: 'GET', url, headers });
  const patch = (url: string, body: unknown, headers = authHeader) =>
    app.inject({ method: 'PATCH', url, headers, body: JSON.stringify(body) });

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
    gateway.catalog = CATALOG.map((name) => ({ name, description: `Skill ${name}` }));
    gateway.failCatalog = false;
    gateway.history = [];
    gateway.chatCalls = [];
    gateway.sessionSystem = [];
    gateway.makeSession = true;
    invalidateGatewayCatalogCache();
    // Baris audit & anak-anak agen dibersihkan agar setiap test berdiri sendiri.
    db.prepare('DELETE FROM audit_log').run();
    db.prepare('DELETE FROM agent_skills').run();
    db.prepare('DELETE FROM agent_sessions WHERE agent_id = ?').run(AGENT_ID);
    db.prepare('DELETE FROM tasks WHERE agent_id = ?').run(AGENT_ID);
    db.prepare('DELETE FROM agents WHERE id = ?').run(AGENT_ID);
    seedAgent(AGENT_ID);
  });

  it('agen tanpa baris = seluruh katalog aktif (bawaan, tanpa seeding)', async () => {
    expect(skillRows(AGENT_ID)).toEqual([]);

    const res = await get(`/api/agents/${AGENT_ID}/skills`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      agent_id: string;
      skills: string[];
      disabled: string[];
      mode: string;
      available: boolean;
      catalog: { name: string }[];
    };
    expect(body.agent_id).toBe(AGENT_ID);
    expect(body.skills).toEqual(CATALOG);
    expect(body.disabled).toEqual([]);
    expect(body.mode).toBe('default');
    expect(body.available).toBe(true);
    expect(body.catalog.map((s) => s.name)).toEqual(CATALOG);
    // Skill yang baru terpasang di gateway ikut aktif tanpa menyentuh tabel.
    gateway.catalog.push({ name: 'invoice-scanner', description: 'Baru' });
    const later = JSON.parse((await get(`/api/agents/${AGENT_ID}/skills`)).body) as {
      skills: string[];
    };
    expect(later.skills).toContain('invoice-scanner');
  });

  it('PATCH menyimpan skill yang dimatikan, round-trip lewat GET, dan mencatat audit', async () => {
    const res = await patch(`/api/agents/${AGENT_ID}/skills`, { skills: ['pdf-tools'] });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      skills: string[];
      disabled: string[];
      mode: string;
    };
    expect(body.skills).toEqual(['pdf-tools']);
    expect(body.disabled).toEqual(['codebase-inspection', 'invoice-parser']);
    expect(body.mode).toBe('restricted');

    // Baris = skill yang dimatikan (complement), bukan daftar skill aktif.
    expect(skillRows(AGENT_ID).map((r) => r.skill)).toEqual([
      'codebase-inspection',
      'invoice-parser',
    ]);

    const round = JSON.parse((await get(`/api/agents/${AGENT_ID}/skills`)).body) as {
      skills: string[];
      disabled: string[];
      mode: string;
    };
    expect(round.skills).toEqual(['pdf-tools']);
    expect(round.disabled).toEqual(['codebase-inspection', 'invoice-parser']);
    expect(round.mode).toBe('restricted');

    const audit = auditRows('agent.skills_updated', AGENT_ID);
    expect(audit).toHaveLength(1);
    const detail = JSON.parse(audit[0].detail_json) as {
      mode: string;
      enabled: string[];
      disabled: string[];
      catalog_total: number;
    };
    expect(detail.mode).toBe('restricted');
    expect(detail.enabled).toEqual(['pdf-tools']);
    expect(detail.disabled).toEqual(['codebase-inspection', 'invoice-parser']);
    expect(detail.catalog_total).toBe(3);
  });

  it('mengaktifkan seluruh katalog mengembalikan keadaan bawaan (tanpa baris)', async () => {
    await patch(`/api/agents/${AGENT_ID}/skills`, { skills: ['pdf-tools'] });
    const res = await patch(`/api/agents/${AGENT_ID}/skills`, { skills: CATALOG });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.body) as { mode: string }).mode).toBe('default');
    expect(skillRows(AGENT_ID)).toEqual([]);
    expect(auditRows('agent.skills_updated', AGENT_ID)).toHaveLength(2);
  });

  it('menolak nama di luar katalog dengan 400 unknown_skill dan menyebut pelanggarnya', async () => {
    const res = await patch(`/api/agents/${AGENT_ID}/skills`, {
      skills: ['pdf-tools', 'rm-rf', 'skill-karangan'],
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: string; unknown: string[]; message: string };
    expect(body.error).toBe('unknown_skill');
    expect(body.unknown).toEqual(['rm-rf', 'skill-karangan']);
    expect(body.message).toContain('rm-rf');
    expect(body.message).toContain('skill-karangan');
    // Tidak ada yang tertulis dan tidak ada audit untuk permintaan yang ditolak.
    expect(skillRows(AGENT_ID)).toEqual([]);
    expect(auditRows('agent.skills_updated', AGENT_ID)).toEqual([]);
  });

  it('menolak tubuh yang bukan { skills: string[] } dengan 400 invalid_input', async () => {
    for (const bad of [{}, { skills: 'pdf-tools' }, { skills: [1, 2] }, { skills: [''] }]) {
      const res = await patch(`/api/agents/${AGENT_ID}/skills`, bad);
      expect(res.statusCode).toBe(400);
      expect((JSON.parse(res.body) as { error: string }).error).toBe('invalid_input');
    }
    expect(skillRows(AGENT_ID)).toEqual([]);
  });

  it('katalog tidak terbaca: GET tetap 200 apa adanya, PATCH menolak 503', async () => {
    gateway.failCatalog = true;
    const res = await get(`/api/agents/${AGENT_ID}/skills`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      available: boolean;
      error: string | null;
      catalog: unknown[];
    };
    expect(body.available).toBe(false);
    expect(body.error).toContain('gateway 500');
    expect(body.catalog).toEqual([]);

    const patchRes = await patch(`/api/agents/${AGENT_ID}/skills`, { skills: ['pdf-tools'] });
    expect(patchRes.statusCode).toBe(503);
    expect((JSON.parse(patchRes.body) as { error: string }).error).toBe('catalog_unavailable');
    expect(skillRows(AGENT_ID)).toEqual([]);
    expect(auditRows('agent.skills_updated', AGENT_ID)).toEqual([]);
  });

  it('agen sistem ditolak 403 system_agent, tapi GET-nya tetap terbaca', async () => {
    const getRes = await get('/api/agents/agent_orchestrator/skills');
    expect(getRes.statusCode).toBe(200);
    expect((JSON.parse(getRes.body) as { agent_id: string }).agent_id).toBe('agent_orchestrator');

    const res = await patch('/api/agents/agent_orchestrator/skills', { skills: [] });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { error: string; message: string };
    expect(body.error).toBe('system_agent');
    expect(body.message).toContain('orkestrator');
    expect(skillRows('agent_orchestrator')).toEqual([]);
    expect(auditRows('agent.skills_updated', 'agent_orchestrator')).toEqual([]);
  });

  it('agen tidak dikenal membalas 404 di kedua rute', async () => {
    const getRes = await get('/api/agents/agent_hilang/skills');
    expect(getRes.statusCode).toBe(404);
    const patchRes = await patch('/api/agents/agent_hilang/skills', { skills: [] });
    expect(patchRes.statusCode).toBe(404);
  });

  it('kedua rute butuh autentikasi pemilik', async () => {
    const noAuth = await app.inject({
      method: 'GET',
      url: `/api/agents/${AGENT_ID}/skills`,
      headers: { 'content-type': 'application/json' },
    });
    expect([401, 403]).toContain(noAuth.statusCode);

    const intruderHeader = {
      authorization: 'tma ' + createTelegramInitData({ id: 555555, first_name: 'Tamu' }, botToken),
      'content-type': 'application/json',
    };
    const intruder = await app.inject({
      method: 'PATCH',
      url: `/api/agents/${AGENT_ID}/skills`,
      headers: intruderHeader,
      body: JSON.stringify({ skills: [] }),
    });
    expect(intruder.statusCode).toBe(403);
    expect(skillRows(AGENT_ID)).toEqual([]);
  });

  it('layer SOUL: giliran chat membawa cakupan skill, riwayat dibaca tanpa garis aplikasi', async () => {
    await patch(`/api/agents/${AGENT_ID}/skills`, { skills: ['pdf-tools'] });

    const chat = await app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Halo, laporan invoice' }] }),
    });
    expect(chat.statusCode).toBe(200);
    expect(gateway.history).toHaveLength(1);
    const sent = gateway.history[0];
    expect(sent.startsWith('[CAKUPAN SKILL AGEN:')).toBe(true);
    // Daftar skill AKTIF yang dikirim, dan skill yang dimatikan tidak ikut.
    expect(sent).toContain('pdf-tools');
    expect(sent).not.toContain('invoice-parser');
    expect(sent).toContain('Halo, laporan invoice');

    // Riwayat yang dibaca kembali menampilkan pesan milik pemilik apa adanya.
    const history = await get(`/api/agents/${AGENT_ID}/chat`);
    expect(history.statusCode).toBe(200);
    const messages = (JSON.parse(history.body) as { messages: { content: string }[] }).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Halo, laporan invoice');
  });

  it('jalur tanpa sesi memakai role system asli; agen tanpa pembatasan tidak dikirim garis', async () => {
    gateway.makeSession = false;
    await patch(`/api/agents/${AGENT_ID}/skills`, { skills: ['pdf-tools'] });

    const restricted = await app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Buat ringkasan' }] }),
    });
    expect(restricted.statusCode).toBe(200);
    expect(gateway.chatCalls).toHaveLength(1);
    const [identity, scope, ...rest] = gateway.chatCalls[0];
    // Fase 1 — identitas kini system PERTAMA, instruksi cakupan menyusul.
    expect(identity.role).toBe('system');
    expect(identity.content).toContain('Agen agent_aria_skill');
    expect(scope.role).toBe('system');
    expect(scope.content).toContain('pdf-tools');
    expect(rest).toEqual([{ role: 'user', content: 'Buat ringkasan' }]);

    // Bawaan (tanpa baris): cakupan skill tidak dikirim, hanya identitas Fase 1.
    await patch(`/api/agents/${AGENT_ID}/skills`, { skills: CATALOG });
    const plain = await app.inject({
      method: 'POST',
      url: `/api/agents/${AGENT_ID}/chat`,
      headers: authHeader,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Halo lagi' }] }),
    });
    expect(plain.statusCode).toBe(200);
    expect(gateway.chatCalls[1]).toEqual([
      { role: 'system', content: expect.stringContaining('Agen agent_aria_skill') },
      { role: 'user', content: 'Halo lagi' },
    ]);
    expect(gateway.chatCalls[1][0].content).not.toContain('[CAKUPAN SKILL AGEN:');
  });

  it('hapus agen ikut membersihkan baris cakupan skill-nya', async () => {
    await patch(`/api/agents/${AGENT_ID}/skills`, { skills: ['pdf-tools'] });
    expect(skillRows(AGENT_ID)).toHaveLength(2);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/agents/${AGENT_ID}`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    expect(skillRows(AGENT_ID)).toEqual([]);
  });

  it('endpoints manifest mencatat kedua rute Tahap 11', () => {
    const has = (method: string, path: string) =>
      ENDPOINTS.some((e) => e.method === method && e.path === path);
    expect(has('GET', '/api/agents/:id/skills')).toBe(true);
    expect(has('PATCH', '/api/agents/:id/skills')).toBe(true);
  });
});
