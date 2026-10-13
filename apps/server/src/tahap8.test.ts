/**
 * Tahap 8 — route-level test: riwayat chat dari sesi, hapus agen, skills.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { ENDPOINTS } from '@hermes-office/shared';
import { createTelegramInitData } from './auth.test.js';

describe('Tahap 8 — chat history, agent deletion, skills', () => {
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

  async function createAgent(id: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: authHeader,
      body: JSON.stringify({
        id,
        name: 'Tahap Eight',
        role: 'QA',
        department: 'support',
        avatar: '🧪',
        soul_summary: 'Agent uji Tahap 8',
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

  it('GET /api/agents/:id/chat returns an empty transcript for a fresh agent (no invented history)', async () => {
    const agent = await createAgent('agent_t8_fresh');
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agent.id}/chat`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { messages: unknown[]; session_id: string | null };
    expect(body.messages).toEqual([]);
    expect(body.session_id).toBeNull();
  });

  it('GET /api/agents/:id/chat 404s for an unknown agent', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/no_such_agent/chat',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/agents/:id removes the agent, its tasks and its stored key', async () => {
    const agent = await createAgent('agent_t8_victim');
    db.prepare(
      `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'normal', 'backlog', NULL, NULL, NULL, ?, ?, ?)`
    ).run('task_t8_1', 'Tugas agen sementara', '', agent.id, 123456789, Date.now(), Date.now());
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      `agent_key:${agent.id}`,
      'sk-test-never-echoed'
    );

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/agents/${agent.id}`,
      headers: authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; tasks_removed: number };
    expect(body.success).toBe(true);
    expect(body.tasks_removed).toBe(1);

    expect(db.prepare('SELECT id FROM agents WHERE id = ?').get(agent.id)).toBeUndefined();
    expect(db.prepare('SELECT id FROM tasks WHERE agent_id = ?').all(agent.id)).toEqual([]);
    expect(
      db.prepare('SELECT value FROM settings WHERE key = ?').get(`agent_key:${agent.id}`)
    ).toBeUndefined();

    // S4: response must never echo the stored key value
    expect(res.body).not.toContain('sk-test-never-echoed');

    // audit trail recorded the deletion
    const auditRow = db
      .prepare("SELECT detail_json FROM audit_log WHERE action = 'agent.delete' AND target = ?")
      .get(agent.id) as { detail_json: string } | undefined;
    expect(auditRow).toBeDefined();
    expect(JSON.parse(auditRow!.detail_json).tasks_removed).toBe(1);

    const again = await app.inject({
      method: 'DELETE',
      url: `/api/agents/${agent.id}`,
      headers: authHeader,
    });
    expect(again.statusCode).toBe(404);
  });

  it('DELETE /api/agents/:id 404s for an unknown agent', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/agents/never_existed',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/skills reports honestly (available flag + gateway address, never fabricated skills)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/skills', headers: authHeader });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      available: boolean;
      skills: unknown[];
      gateway: string;
      error: string | null;
      capabilities: unknown;
    };
    expect(typeof body.available).toBe('boolean');
    expect(Array.isArray(body.skills)).toBe(true);
    expect(typeof body.gateway).toBe('string');
    if (!body.available) {
      expect(body.error).toBeTruthy();
      expect(body.skills).toEqual([]);
    }
  });

  it('endpoints manifest lists the Tahap 8 routes', () => {
    const has = (method: string, path: string) =>
      ENDPOINTS.some((e) => e.method === method && e.path === path);
    expect(has('GET', '/api/agents/:id/chat')).toBe(true);
    expect(has('DELETE', '/api/agents/:id')).toBe(true);
    expect(has('GET', '/api/skills')).toBe(true);
  });

  it('migration 003 added the agents.session_id column', () => {
    const cols = db.prepare('PRAGMA table_info(agents)').all() as { name: string }[];
    expect(cols.some((c) => c.name === 'session_id')).toBe(true);
  });
});
