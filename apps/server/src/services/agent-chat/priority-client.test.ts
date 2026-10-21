import { describe, it, expect } from 'vitest';
import { withModelPriority } from './priority-client.js';
import { RealHermesClient } from '../hermes/real.client.js';
import { vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { getHermesClientForAgent } from '../hermes/index.js';
import { AgentRepository } from '../../db/repositories/agents.js';
import { runMigrations } from '../../db/migrator.js';

/** Actual transport + fake fetch responses, not mock retry implementations. */
describe('per-agent ordered fallback transport', () => {
  it('loads persisted settings through the production resolver and audits each switch without changing primary', async () => {
    const db = new BetterSqlite3(':memory:'); runMigrations(db);
    db.prepare("INSERT INTO agents(id,name,role,department,hermes_base_url,model,hired_at,created_at) VALUES('priority','Raka','staff','sales','https://gateway.test','main',0,0)").run();
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('agent_model_priority:priority', JSON.stringify(['main','backup']));
    const attempted: string[] = [];
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const model = JSON.parse(String(init?.body)).model; attempted.push(model);
      return model === 'backup' ? new Response('data: ok\n\n') : new Response('model not found', { status: 404 });
    });
    try {
      const agent = new AgentRepository(db).getById('priority')!;
      await getHermesClientForAgent(agent, db).chatStream([], () => {}, agent.model!);
      expect(attempted).toEqual(['main','backup']);
      expect(new AgentRepository(db).getById('priority')!.model).toBe('main');
      const audit = db.prepare("SELECT detail_json FROM audit_log WHERE action='agent.model_fallback' AND target='priority'").all() as {detail_json:string}[];
      expect(audit.map((row) => JSON.parse(row.detail_json))).toEqual([{from:'main',to:'backup'}]);
    } finally { fetcher.mockRestore(); db.close(); }
  });
  it.each([400, 401, 403, 404, 429, 500])('does not retry generic HTTP %s without a model rejection', async (status) => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('route or request failure', { status }));
    try {
      const client = withModelPriority(new RealHermesClient('https://gateway.test', 'test'), ['main', 'backup'], '', () => {});
      await expect(client.chatStream([], () => {}, 'main')).rejects.toThrow(String(status));
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { fetcher.mockRestore(); }
  });

  it('passes the fallback model to session chat instead of silently ignoring it', async () => {
    const attempted: unknown[] = [];
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)); attempted.push(body.model);
      return body.model === 'backup'
        ? new Response('event: assistant.delta\ndata: {"delta":"ok"}\n\n')
        : new Response('model unavailable', { status: 404 });
    });
    try {
      const client = withModelPriority(new RealHermesClient('https://gateway.test', 'test'), ['main', 'backup'], '', () => {});
      await client.sessionChatStream('session', 'hi', () => {}, 'main');
      expect(attempted).toEqual(['main', 'backup']);
    } finally { fetcher.mockRestore(); }
  });

  it('never replays accepted runs or partially delivered answers', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/v1/runs') ? Response.json({ run_id: 'r1' })
        : new Response('data: {"event":"run.failed","error":"404 model unavailable"}\n\n'));
    try {
      const client = withModelPriority(new RealHermesClient('https://gateway.test', 'test'), ['main', 'backup'], '', () => {});
      await expect(client.runChatStream({ input: 'hi', model: 'main' }, { onDelta: () => {}, onDone: () => {} })).rejects.toThrow('model unavailable');
      expect(fetcher).toHaveBeenCalledTimes(2); // one run start + its event stream only
    } finally { fetcher.mockRestore(); }
  });

  it.each([400, 402])('uses the next model for explicit model HTTP %s rejection', async (status) => {
    const attempted: string[] = [];
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const model = JSON.parse(String(init?.body)).model; attempted.push(model);
      return model === 'backup' ? new Response('data: ok\n\n') : new Response('model unavailable', { status });
    });
    try {
      const client = withModelPriority(new RealHermesClient('https://gateway.test', 'test'), ['main', 'backup'], '', () => {});
      await client.chatStream([], () => {}, 'main');
      expect(attempted).toEqual(['main', 'backup']);
    } finally { fetcher.mockRestore(); }
  });

  it('does not concatenate a new model after a partial response', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: partial\n\n')); },
      pull(controller) { controller.error(new Error('404 model unavailable')); },
    })));
    const chunks: string[] = [];
    try {
      const client = withModelPriority(new RealHermesClient('https://gateway.test', 'test'), ['main', 'backup'], '', () => {});
      await expect(client.chatStream([], (chunk) => chunks.push(chunk), 'main')).rejects.toThrow('model unavailable');
      expect(chunks.join('')).toContain('partial');
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { fetcher.mockRestore(); }
  });

  it('does not confuse an HTTP 401 body mentioning model 404 with a retryable status', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('model 404 unavailable, key unauthorized', {status:401}));
    try {
      const client = withModelPriority(new RealHermesClient('https://gateway.test', 'test'), ['main','backup'], '', () => {});
      await expect(client.chatStream([], () => {}, 'main')).rejects.toThrow('401');
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { fetcher.mockRestore(); }
  });

  it('does not retry timeouts', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('request timed out: model 404'));
    try {
      const client = withModelPriority(new RealHermesClient('https://gateway.test', 'test'), ['main', 'backup'], '', () => {});
      await expect(client.chatStream([], () => {}, 'main')).rejects.toThrow('timed out');
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { fetcher.mockRestore(); }
  });
  it('tries ordered models then global safety net exactly once, preserving the primary', async () => {
    const attempted: string[] = [];
    const audit: unknown[] = [];
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      attempted.push(body.model);
      return body.model === 'safety'
        ? new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n')
        : new Response(JSON.stringify({ error: { message: 'model unavailable' } }), { status: 404 });
    });
    try {
      const client = withModelPriority(new RealHermesClient('https://gateway.test', 'test'), ['main', 'backup'], 'safety', (event) => { audit.push(event); });
      const chunks: string[] = [];
      await client.chatStream([{ role: 'user', content: 'hello' }], (chunk) => chunks.push(chunk), 'main');
      expect(attempted).toEqual(['main', 'backup', 'safety']);
      expect(chunks.join('')).toContain('ok');
      expect(audit).toEqual([{ from: 'main', to: 'backup' }, { from: 'backup', to: 'safety' }]);
    } finally { fetcher.mockRestore(); }
  });
});
