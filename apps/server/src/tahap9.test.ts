/**
 * Tahap 9 — route-level test: orkestrator sistem, sesi baru + arsip, avatar style.
 *
 *  - orkestrator di-seed sebagai agen sistem: tidak bisa dihapus/nonaktif,
 *    PATCH hanya menerima whitelist field, is_system tidak bisa dimatikan;
 *  - "Sesi baru" menandai sesi lama terarsip di agent_sessions, riwayat arsip
 *    bisa dibaca kembali, sesi agen lain tidak pernah bisa dibaca lintas agen;
 *  - avatar_style tervalidasi (warna hex + aksesori whitelist) sebelum tersimpan.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

describe('Tahap 9 — orchestrator, sessions, avatar style', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
  };

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  async function createAgent(id: string, department = 'support') {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authHeader,
      body: JSON.stringify({
        id,
        name: 'Tahap Nine',
        role: 'QA',
        department,
        avatar: '🧪',
        soul_summary: 'Agent uji Tahap 9',
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

  const listAgents = async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agents', headers: authHeader });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as {
      id: string;
      is_system: boolean;
      name: string;
      active: number;
      avatar_style: { shirt?: string; accessory?: string } | null;
    }[];
  };

  it('seeds exactly one system orchestrator that survives every listing', async () => {
    const agents = await listAgents();
    const system = agents.filter((a) => a.is_system);
    expect(system).toHaveLength(1);
    expect(system[0].id).toBe('agent_orchestrator');
    expect(system[0].active).toBe(1);
  });

  it('refuses DELETE on the system orchestrator with 403', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/agents/agent_orchestrator',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(403);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('system_agent');
    const agents = await listAgents();
    expect(agents.some((a) => a.id === 'agent_orchestrator')).toBe(true);
  });

  it('refuses to disable the orchestrator but allows renaming it', async () => {
    const disable = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent_orchestrator',
      headers: authHeader,
      body: JSON.stringify({ active: 0 }),
    });
    expect(disable.statusCode).toBe(403);

    const rename = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent_orchestrator',
      headers: authHeader,
      body: JSON.stringify({ name: 'Orion Prime' }),
    });
    expect(rename.statusCode).toBe(200);
    const body = JSON.parse(rename.body) as { name: string; is_system: boolean };
    expect(body.name).toBe('Orion Prime');
    expect(body.is_system).toBe(true);
  });

  it('never lets is_system or session_id through the PATCH whitelist', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent_orchestrator',
      headers: authHeader,
      body: JSON.stringify({ is_system: 0, session_id: 'hijacked', api_key: 'sk-x' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { is_system: boolean; session_id: string | null };
    expect(body.is_system).toBe(true);
    // The hijack never lands: session_id stays out of the public shape.
    expect(body.session_id ?? null).toBeNull();
  });

  it('validates avatar_style: hex colours and whitelisted accessories only', async () => {
    const good = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent_orchestrator',
      headers: authHeader,
      body: JSON.stringify({ avatar_style: { shirt: '#38BDF8', accessory: 'cap' } }),
    });
    expect(good.statusCode).toBe(200);
    expect((JSON.parse(good.body) as { avatar_style: unknown }).avatar_style).toEqual({
      shirt: '#38BDF8',
      accessory: 'cap',
    });

    const bad = await app.inject({
      method: 'PATCH',
      url: '/api/agents/agent_orchestrator',
      headers: authHeader,
      body: JSON.stringify({ avatar_style: { shirt: 'javascript:alert(1)', accessory: 'wings' } }),
    });
    expect(bad.statusCode).toBe(200);
    expect((JSON.parse(bad.body) as { avatar_style: unknown }).avatar_style).toBeNull();
  });

  it('archives the current session on "Sesi baru" and reads archived history back', async () => {
    const agent = await createAgent('agent_t9_session');
    // Simulate a live gateway session (mock client returns null sessions).
    db.prepare('UPDATE agents SET session_id = ? WHERE id = ?').run('sid_old', agent.id);
    db.prepare('INSERT INTO agent_sessions (agent_id, session_id, created_at, archived_at) VALUES (?, ?, ?, NULL)').run(
      agent.id,
      'sid_old',
      Date.now() - 60_000
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agent.id}/session`,
      headers: authHeader,
      body: '{}',
    });
    expect(res.statusCode).toBe(200);
    // Mock gateway has no real sessions, so the pointer clears; the old one is archived.
    expect((JSON.parse(res.body) as { session_id: string | null }).session_id).toBeNull();
    const row = db
      .prepare('SELECT archived_at FROM agent_sessions WHERE agent_id = ? AND session_id = ?')
      .get(agent.id, 'sid_old') as { archived_at: number | null };
    expect(row.archived_at).not.toBeNull();

    const list = await app.inject({
      method: 'GET',
      url: `/api/agents/${agent.id}/sessions`,
      headers: authHeader,
    });
    expect(list.statusCode).toBe(200);
    const sessions = (JSON.parse(list.body) as { sessions: { session_id: string }[] }).sessions;
    expect(sessions.map((s) => s.session_id)).toContain('sid_old');

    const archived = await app.inject({
      method: 'GET',
      url: `/api/agents/${agent.id}/chat?session=sid_old`,
      headers: authHeader,
    });
    expect(archived.statusCode).toBe(200);
    expect((JSON.parse(archived.body) as { is_archived: boolean }).is_archived).toBe(true);
  });

  it('rejects reading an archived session that belongs to another agent', async () => {
    const a = await createAgent('agent_t9_own');
    const b = await createAgent('agent_t9_other', 'sales');
    db.prepare('INSERT INTO agent_sessions (agent_id, session_id, created_at, archived_at) VALUES (?, ?, ?, ?)').run(
      b.id,
      'sid_foreign',
      Date.now(),
      Date.now()
    );
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${a.id}/chat?session=sid_foreign`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(403);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('invalid_input');
  });
});
