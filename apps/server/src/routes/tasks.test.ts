import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';

describe('Task Visibility & Events Routes (Fase 4)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: `tma ${createTelegramInitData(ownerUser, botToken)}`,
  };
  const jsonHeaders = {
    ...authHeader,
    'content-type': 'application/json',
  };

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);

    const now = Date.now();
    db.prepare(`
      INSERT INTO agents (id, name, role, department, avatar, soul_summary, hermes_base_url, api_key_env, hermes_profile, active, hired_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'agent_finance_01',
      'Finance Agent',
      'Accountant',
      'command',
      '🤖',
      'Handles finance',
      'http://127.0.0.1:8642',
      'KEY',
      'default',
      1,
      now,
      now
    );

    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  describe('GET /api/tasks query filtering (Fase 4c)', () => {
    it('filters tasks by source (chat vs manual)', async () => {
      // Buat 1 task manual
      await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({
          title: 'Manual Task 1',
          agent_id: 'agent_finance_01',
          priority: 'normal',
        }),
      });

      // Insert task chat langsung ke DB untuk verifikasi filter source
      const chatId = 'task_chat_test_01';
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        chatId,
        'Chat Task 1',
        'Auto materialized from chat',
        'agent_finance_01',
        'normal',
        'running',
        'run_chat_999',
        null,
        null,
        123456789,
        Date.now(),
        Date.now(),
        'chat',
        2
      );

      // 1. Filter source=chat
      const chatRes = await app.inject({
        method: 'GET',
        url: '/api/tasks?source=chat',
        headers: authHeader,
      });
      expect(chatRes.statusCode).toBe(200);
      const chatTasks = JSON.parse(chatRes.body);
      expect(chatTasks.some((t: { id: string }) => t.id === chatId)).toBe(true);
      expect(chatTasks.every((t: { source?: string }) => t.source === 'chat')).toBe(true);

      // 2. Filter source=manual
      const manualRes = await app.inject({
        method: 'GET',
        url: '/api/tasks?source=manual',
        headers: authHeader,
      });
      expect(manualRes.statusCode).toBe(200);
      const manualTasks = JSON.parse(manualRes.body);
      expect(manualTasks.some((t: { id: string }) => t.id === chatId)).toBe(false);
      expect(manualTasks.every((t: { source?: string }) => t.source === 'manual')).toBe(true);

      // 3. Filter source=all
      const allRes = await app.inject({
        method: 'GET',
        url: '/api/tasks?source=all',
        headers: authHeader,
      });
      expect(allRes.statusCode).toBe(200);
      const allTasks = JSON.parse(allRes.body);
      expect(allTasks.some((t: { id: string }) => t.id === chatId)).toBe(true);
      expect(allTasks.some((t: { title: string }) => t.title === 'Manual Task 1')).toBe(true);
    });
  });

  describe('GET /api/tasks/:id/events (Fase 4c)', () => {
    it('returns 404 for non-existent task', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks/task_nonexistent_xyz/events',
        headers: authHeader,
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('not_found');
    });

    it('returns empty events array when task has no run_id', async () => {
      const taskRes = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({
          title: 'Task without run',
          agent_id: 'agent_finance_01',
          priority: 'normal',
        }),
      });
      const task = JSON.parse(taskRes.body);

      const res = await app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/events`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({
        task_id: task.id,
        run_id: null,
        events: [],
      });
    });

    it('returns ordered timeline events with parsed payloads when run_id exists', async () => {
      const taskId = 'task_with_run_01';
      const runId = 'run_timeline_test_123';
      const now = Date.now();

      // Insert task dengan run_id
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        taskId,
        'Task With Run Events',
        'Testing timeline endpoint',
        'agent_finance_01',
        'normal',
        'done',
        runId,
        'Success result',
        null,
        123456789,
        now,
        now,
        'chat',
        1
      );

      // Insert run_events
      const insertEvent = db.prepare(
        'INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)'
      );
      insertEvent.run(runId, 'agent_finance_01', 'run.started', JSON.stringify({ status: 'started' }), now);
      insertEvent.run(
        runId,
        'agent_finance_01',
        'tool.started',
        JSON.stringify({ tool: 'web_search', args: { q: 'Hermes' } }),
        now + 100
      );
      insertEvent.run(
        runId,
        'agent_finance_01',
        'tool.completed',
        JSON.stringify({ tool: 'web_search', output: 'Found 10 results' }),
        now + 300
      );
      insertEvent.run(
        runId,
        'agent_finance_01',
        'run.completed',
        JSON.stringify({ finish_reason: 'stop' }),
        now + 400
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/tasks/${taskId}/events`,
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.task_id).toBe(taskId);
      expect(body.run_id).toBe(runId);
      expect(body.events).toHaveLength(4);

      expect(body.events[0].type).toBe('run.started');
      expect(body.events[0].payload).toEqual({ status: 'started' });

      expect(body.events[1].type).toBe('tool.started');
      expect(body.events[1].payload).toEqual({ tool: 'web_search', args: { q: 'Hermes' } });

      expect(body.events[2].type).toBe('tool.completed');
      expect(body.events[2].payload).toEqual({ tool: 'web_search', output: 'Found 10 results' });

      expect(body.events[3].type).toBe('run.completed');
    });
  });
});
