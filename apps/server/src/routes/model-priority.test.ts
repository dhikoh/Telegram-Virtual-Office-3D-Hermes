import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';

/** ST-6: real Fastify + SQLite, no provider network needed. */
describe('ordered model priority', () => {
  let db: BetterSqlite3.Database;
  let app: FastifyInstance;
  const id = 'priority-agent';
  const headers = {
    authorization: 'tma ' + createTelegramInitData({ id: 123456789, first_name: 'CEO' }, 'mock_telegram_bot_token'),
  };
  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    db.prepare(`INSERT INTO agents (id,name,role,department,hermes_base_url,model,hired_at,created_at)
      VALUES (?, 'Raka','Staff','sales','','old-model',0,0)`).run(id);
    app = buildServer({ db });
    await app.ready();
  });
  afterAll(async () => { await app.close(); db.close(); });

  it('persists an ordered list and its primary atomically without a migration', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/api/agents/${id}/model-priority`, headers,
      payload: { models: ['primary', 'backup', 'last'] } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ models: ['primary', 'backup', 'last'], current_model: 'primary', max_models: 5 });
    expect(db.prepare('SELECT value FROM settings WHERE key=?').get(`agent_model_priority:${id}`))
      .toEqual({ value: JSON.stringify(['primary', 'backup', 'last']) });
    expect(db.prepare('SELECT model FROM agents WHERE id=?').get(id)).toEqual({ model: 'primary' });
    const read = await app.inject({ method: 'GET', url: `/api/agents/${id}/model-priority`, headers });
    expect(read.json()).toEqual(res.json());
  });

  it('rejects empty, duplicate, oversized, and non-string lists without writes', async () => {
    for (const models of [[], ['x', 'x'], ['x', ' x '], [''], [42], ['a','b','c','d','e','f']]) {
      const res = await app.inject({ method: 'PATCH', url: `/api/agents/${id}/model-priority`, headers, payload: { models } });
      expect(res.statusCode).toBe(400);
    }
    expect(db.prepare('SELECT model FROM agents WHERE id=?').get(id)).toEqual({ model: 'primary' });
  });

  it('enforces auth and missing-agent checks', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/agents/${id}/model-priority` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PATCH', url: `/api/agents/${id}/model-priority`, payload: { models: ['x'] } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/agents/missing/model-priority', headers })).statusCode).toBe(404);
  });

  it('keeps persisted priority[0] aligned when the old model picker updates the primary', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/api/agents/${id}`, headers, payload: { model: 'backup' } });
    expect(res.statusCode).toBe(200);
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(`agent_model_priority:${id}`) as { value: string };
    expect(JSON.parse(row.value)).toEqual(['backup', 'primary', 'last']);
  });

  it('rolls back primary update if the settings write fails', async () => {
    db.exec("CREATE TRIGGER reject_priority BEFORE UPDATE ON settings WHEN NEW.key LIKE 'agent_model_priority:%' BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    try {
      const res = await app.inject({ method: 'PATCH', url: `/api/agents/${id}/model-priority`, headers, payload: { models: ['other'] } });
      expect(res.statusCode).toBe(500);
      expect(db.prepare('SELECT model FROM agents WHERE id=?').get(id)).toEqual({ model: 'backup' });
    } finally { db.exec('DROP TRIGGER reject_priority'); }
  });

  it('removes settings when the agent is deleted', async () => {
    expect((await app.inject({ method: 'DELETE', url: `/api/agents/${id}`, headers })).statusCode).toBe(200);
    expect(db.prepare('SELECT value FROM settings WHERE key=?').get(`agent_model_priority:${id}`)).toBeUndefined();
  });
});
