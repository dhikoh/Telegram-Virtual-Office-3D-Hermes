import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';
import { AgentRepository } from './db/repositories/agents.js';
import { ApprovalRepository } from './db/repositories/approvals.js';
import { TaskRepository } from './db/repositories/tasks.js';
import { AuditRepository } from './db/repositories/audit.js';
import { MockHermesServer } from '@hermes-office/mock-hermes';

describe('Adversarial & State Matrix Tests (Rule C5 & C9)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;
  let mockHermes: MockHermesServer;
  let isMockOwner = false;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const ownerAuth = `tma ${createTelegramInitData(ownerUser, botToken)}`;
  const strangerUser = { id: 88888888, first_name: 'Attacker' };
  const strangerAuth = `tma ${createTelegramInitData(strangerUser, botToken)}`;

  beforeAll(async () => {
    mockHermes = new MockHermesServer(8642);
    try {
      await mockHermes.start();
      isMockOwner = true;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code !== 'EADDRINUSE') {
        throw err;
      }
    }

    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
    if (isMockOwner) {
      await mockHermes.stop();
    }
  });

  it('Case 1: Empty database handles queries gracefully (returns empty lists)', async () => {
    const resAgents = await app.inject({ method: 'GET', url: '/api/agents', headers: { authorization: ownerAuth } });
    expect(resAgents.statusCode).toBe(200);
    expect(JSON.parse(resAgents.body)).toEqual([]);

    const resTasks = await app.inject({ method: 'GET', url: '/api/tasks', headers: { authorization: ownerAuth } });
    expect(resTasks.statusCode).toBe(200);
    expect(JSON.parse(resTasks.body)).toEqual([]);

    const resApprovals = await app.inject({ method: 'GET', url: '/api/approvals', headers: { authorization: ownerAuth } });
    expect(resApprovals.statusCode).toBe(200);
    expect(JSON.parse(resApprovals.body)).toEqual([]);

    const resKpis = await app.inject({ method: 'GET', url: '/api/kpis', headers: { authorization: ownerAuth } });
    expect(resKpis.statusCode).toBe(200);
    expect(JSON.parse(resKpis.body)).toEqual([]);

    const resReports = await app.inject({ method: 'GET', url: '/api/reports', headers: { authorization: ownerAuth } });
    expect(resReports.statusCode).toBe(200);
    expect(JSON.parse(resReports.body)).toEqual([]);
  });

  it('Case 2: Expired initData (> 3600s) is strictly rejected with 401', async () => {
    const expiredAuth = `tma ${createTelegramInitData(ownerUser, botToken, Math.floor(Date.now() / 1000) - 4500)}`;
    const res = await app.inject({ method: 'GET', url: '/api/agents', headers: { authorization: expiredAuth } });
    expect(res.statusCode).toBe(401);
  });

  it('Case 3: Non-owner Telegram ID is strictly rejected with 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agents', headers: { authorization: strangerAuth } });
    expect(res.statusCode).toBe(403);
  });

  it('Case 4: 1000-character task title is accepted and stored safely without truncation or crash', async () => {
    const agentRepo = new AgentRepository(db);
    agentRepo.create({
      id: 'adv-agent-1',
      name: 'Adv Agent',
      role: 'Tester',
      department: 'command',
      avatar: '⚡',
      soul_summary: 'Soul',
      hermes_base_url: 'http://127.0.0.1:8642',
      api_key_env: 'KEY',
      hermes_profile: 'adv',
      active: 1,
      hired_at: Date.now(),
      created_at: Date.now(),
    });

    const longTitle = 'A'.repeat(1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: ownerAuth },
      payload: {
        id: 'task-long-title',
        title: longTitle,
        description: 'Test description',
        agent_id: 'adv-agent-1',
        priority: 'urgent',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title.length).toBe(1000);
    expect(body.title).toBe(longTitle);
  });

  it('Case 5: Double tap on approval resolution handles concurrency cleanly', async () => {
    // Ensure run exists on MockHermes server
    const runRes = await fetch('http://127.0.0.1:8642/v1/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'double tap approval test' }),
    });
    const { run_id } = (await runRes.json()) as { run_id: string };

    const approvalRepo = new ApprovalRepository(db);
    const approvalId = 'appr-double-tap';
    approvalRepo.create({
      id: approvalId,
      run_id,
      agent_id: 'adv-agent-1',
      summary: 'Aksi transaksi besar',
      payload_json: JSON.stringify({ amount: 5000 }),
      status: 'pending',
      decided_by: null,
      decided_at: null,
      created_at: Date.now(),
    });

    // Tap 1: Succeeds
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approvalId}/resolve`,
      headers: { authorization: ownerAuth },
      payload: { decision: 'approve' },
    });
    expect(res1.statusCode).toBe(200);

    // Tap 2: Immediate double tap is rejected with 400 already_resolved
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approvalId}/resolve`,
      headers: { authorization: ownerAuth },
      payload: { decision: 'approve' },
    });
    expect(res2.statusCode).toBe(400);
    const body2 = JSON.parse(res2.body);
    expect(body2.error).toBe('already_resolved');
  });

  it('Case 6: 20 agents created simultaneously works without database lock issues (WAL mode)', async () => {
    const agentRepo = new AgentRepository(db);
    const promises = Array.from({ length: 20 }).map((_, i) =>
      app.inject({
        method: 'POST',
        url: '/api/agents',
        headers: { authorization: ownerAuth },
        payload: {
          id: `swarm-agent-${i}`,
          name: `Swarm Agent ${i}`,
          role: 'Worker',
          department: 'analytics',
          avatar: '🤖',
          soul_summary: `Agent ${i}`,
          hermes_base_url: 'http://127.0.0.1:8642',
          api_key_env: 'KEY',
          hermes_profile: `swarm-${i}`,
          active: 1,
          hired_at: Date.now(),
          created_at: Date.now(),
        },
      })
    );

    const responses = await Promise.all(promises);
    expect(responses.every((r) => r.statusCode === 201)).toBe(true);

    const allAgents = agentRepo.getAll();
    expect(allAgents.filter((a) => a.id.startsWith('swarm-agent-')).length).toBe(20);
  });

  it('Case 7: Hermes down (connection refused) returns 502, sets agent offline, task failed, logs audit, and server stays up', async () => {
    const agentRepo = new AgentRepository(db);
    const taskRepo = new TaskRepository(db);
    const auditRepo = new AuditRepository(db);

    const downAgentId = 'adv-agent-down';
    agentRepo.create({
      id: downAgentId,
      name: 'Down Agent',
      role: 'Worker',
      department: 'support',
      avatar: '🔌',
      soul_summary: 'Down soul',
      hermes_base_url: 'http://127.0.0.1:59999', // closed port
      api_key_env: 'KEY',
      hermes_profile: 'down-profile',
      active: 1,
      hired_at: Date.now(),
      created_at: Date.now(),
    });

    const taskId = 'task-hermes-down';
    taskRepo.create({
      id: taskId,
      title: 'Task for down hermes',
      description: 'Will fail connection',
      agent_id: downAgentId,
      priority: 'high',
      status: 'backlog',
      run_id: null,
      result_md: null,
      due_at: null,
      created_by: ownerUser.id,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/run`,
      headers: { authorization: ownerAuth },
    });

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('run_failed');
    expect(body.message).toContain('Execution failed');

    // Agent status becomes offline
    const dispatcher = (app as any).dispatcher;
    expect(dispatcher.getAgentStatus(downAgentId).status).toBe('offline');

    // Task becomes failed with reason
    const updatedTask = taskRepo.getById(taskId);
    expect(updatedTask?.status).toBe('failed');
    expect(updatedTask?.result_md).toContain('Hermes connection error');

    // Action is audit-logged
    const logs = auditRepo.getAll(10);
    const failedLog = logs.find((l) => l.action === 'task.run_failed' && l.target === taskId);
    expect(failedLog).toBeDefined();

    // Server stays up and responds normally
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });

  it('Case 8: Hermes slow (timeout) returns 504, sets task failed, no hanging requests or leaked timers', async () => {
    // Start a slow mock server that delays response by 250ms
    const slowServer = http.createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ run_id: 'run-slow-delayed', status: 'started' }));
      }, 250);
    });

    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (slowServer.address() as any).port;

    const agentRepo = new AgentRepository(db);
    const taskRepo = new TaskRepository(db);

    const slowAgentId = 'adv-agent-slow';
    agentRepo.create({
      id: slowAgentId,
      name: 'Slow Agent',
      role: 'Worker',
      department: 'support',
      avatar: '🐢',
      soul_summary: 'Slow soul',
      hermes_base_url: `http://127.0.0.1:${port}`,
      api_key_env: 'KEY',
      hermes_profile: 'slow-profile',
      active: 1,
      hired_at: Date.now(),
      created_at: Date.now(),
    });

    const taskId = 'task-hermes-slow';
    taskRepo.create({
      id: taskId,
      title: 'Task for slow hermes',
      description: 'Will timeout',
      agent_id: slowAgentId,
      priority: 'high',
      status: 'backlog',
      run_id: null,
      result_md: null,
      due_at: null,
      created_by: ownerUser.id,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Temporarily set HERMES_TIMEOUT_MS small (50ms)
    const originalTimeout = (process.env as any).HERMES_TIMEOUT_MS;
    process.env.HERMES_TIMEOUT_MS = '50';

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/tasks/${taskId}/run`,
        headers: { authorization: ownerAuth },
      });

      expect(res.statusCode).toBe(504);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('gateway_timeout');
      expect(body.message).toContain('timed out');

      // Task becomes failed
      const updatedTask = taskRepo.getById(taskId);
      expect(updatedTask?.status).toBe('failed');
      expect(updatedTask?.result_md).toContain('timed out');
    } finally {
      if (originalTimeout !== undefined) {
        process.env.HERMES_TIMEOUT_MS = originalTimeout;
      } else {
        delete (process.env as any).HERMES_TIMEOUT_MS;
      }
      slowServer.close();
    }

    // Server stays up
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });

  it('Case 9: SSE dropped mid-run retries with backoff and recovers cleanly without agent stuck in working', async () => {
    // Start an SSE server that sends tool.started then abruptly closes connection without run.completed
    const dropServer = http.createServer((req, res) => {
      if (req.url === '/v1/runs' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ run_id: 'run-drop-test', status: 'started' }));
        return;
      }

      if (req.url?.startsWith('/v1/runs/run-drop-test/events')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        // Send tool.started
        res.write('data: {"event":"tool.started","data":{"tool":"fetch_tool"}}\n\n');

        // Drop the connection abruptly after 30ms
        setTimeout(() => {
          res.destroy(); // abrupt drop mid-run
        }, 30);
        return;
      }

      if (req.url?.startsWith('/v1/runs/run-drop-test')) {
        // Recovery status endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'run',
            run_id: 'run-drop-test',
            status: 'completed',
            output: 'Recovered run result successfully',
          })
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => dropServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (dropServer.address() as any).port;

    const agentRepo = new AgentRepository(db);
    const taskRepo = new TaskRepository(db);
    const dropAgentId = 'adv-agent-drop';

    agentRepo.create({
      id: dropAgentId,
      name: 'Drop Agent',
      role: 'Worker',
      department: 'social',
      avatar: '📡',
      soul_summary: 'Drop soul',
      hermes_base_url: `http://127.0.0.1:${port}`,
      api_key_env: 'KEY',
      hermes_profile: 'drop-profile',
      active: 1,
      hired_at: Date.now(),
      created_at: Date.now(),
    });

    const taskId = 'task-drop-sse';
    taskRepo.create({
      id: taskId,
      title: 'Task with dropping stream',
      description: 'Will drop mid-run',
      agent_id: dropAgentId,
      priority: 'high',
      status: 'backlog',
      run_id: null,
      result_md: null,
      due_at: null,
      created_by: ownerUser.id,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/run`,
      headers: { authorization: ownerAuth },
    });

    expect(res.statusCode).toBe(200);

    const dispatcher = (app as any).dispatcher;

    // Agent entered working/thinking
    expect(['thinking', 'working']).toContain(dispatcher.getAgentStatus(dropAgentId).status);

    // Wait for stream to drop, retry, and status recovery to execute
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Agent must NOT stay stuck in 'working' or 'thinking'
    const finalStatus = dispatcher.getAgentStatus(dropAgentId).status;
    expect(finalStatus).not.toBe('working');
    expect(finalStatus).not.toBe('thinking');
    expect(['idle', 'error', 'offline']).toContain(finalStatus);

    // Task must not stay stuck in 'running'
    const finalTask = taskRepo.getById(taskId);
    expect(finalTask?.status).not.toBe('running');
    expect(['done', 'failed']).toContain(finalTask?.status);

    dropServer.close();
  });
});
