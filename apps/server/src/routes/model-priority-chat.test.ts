import { describe, it, expect, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import { config } from '../config.js';

/** Exercise the real route, resolver, transport and SQLite audit together. */
describe('ordered priority chat route', () => {
  it('records the actual fallback model on a successful run, not the rejected primary', async () => {
    const oldMode = config.HERMES_MODE; config.HERMES_MODE = 'real';
    const db = new BetterSqlite3(':memory:'); runMigrations(db);
    db.prepare("INSERT INTO agents(id,name,role,department,hermes_base_url,model,session_id,hired_at,created_at) VALUES('success-agent','Raka','staff','sales','https://gateway.test','main','s2',0,0)").run();
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('agent_model_priority:success-agent', JSON.stringify(['main','backup']));
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/v1/runs')) {
        return JSON.parse(String(init?.body)).model === 'main'
          ? new Response('model unavailable', { status: 404 }) : Response.json({ run_id: 'priority-success-run' });
      }
      if (String(url).endsWith('/events')) return new Response('data: {"event":"message.delta","delta":"answer"}\n\ndata: {"event":"run.completed"}\n\n');
      return Response.json({ skills: [] });
    });
    const app = buildServer({ db });
    try {
      await app.ready();
      const response = await app.inject({ method: 'POST', url: '/api/agents/success-agent/chat',
        headers: { authorization: 'tma ' + createTelegramInitData({ id:123456789,first_name:'CEO' }, 'mock_telegram_bot_token') },
        payload: { client_message_id:'priority-success', messages:[{role:'user',content:'hello'}] } });
      expect(response.body).toContain('answer');
      expect(response.body).toContain('[DONE]');
      expect(db.prepare('SELECT model FROM agent_runs WHERE id=?').get('priority-success-run')).toEqual({ model:'backup' });
      expect(db.prepare('SELECT model FROM agents WHERE id=?').get('success-agent')).toEqual({ model:'main' });
    } finally { await app.close(); fetcher.mockRestore(); db.close(); config.HERMES_MODE = oldMode; }
  });
  it('does not restart an exhausted priority chain through the session transport', async () => {
    const oldMode = config.HERMES_MODE; config.HERMES_MODE = 'real';
    const db = new BetterSqlite3(':memory:'); runMigrations(db);
    db.prepare("INSERT INTO agents(id,name,role,department,hermes_base_url,model,session_id,hired_at,created_at) VALUES('chain-agent','Raka','staff','sales','https://gateway.test','main','s1',0,0)").run();
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('agent_model_priority:chain-agent', JSON.stringify(['main','backup']));
    const attempts: string[] = [];
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/v1/runs') || String(url).endsWith('/chat/stream')) {
        attempts.push(JSON.parse(String(init?.body)).model);
        return new Response('model unavailable', {status: 404});
      }
      return Response.json({ skills: [] });
    });
    const app = buildServer({db});
    try {
      await app.ready();
      const response = await app.inject({ method: 'POST', url: '/api/agents/chain-agent/chat',
        headers: { authorization: 'tma ' + createTelegramInitData({id:123456789,first_name:'CEO'}, 'mock_telegram_bot_token') },
        payload: {client_message_id:'chain-once',messages:[{role:'user',content:'hello'}]} });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('gateway_error');
      expect(attempts).toEqual(['main','backup']);
    } finally { await app.close(); fetcher.mockRestore(); db.close(); config.HERMES_MODE = oldMode; }
  });
});
