import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations, pruneOldRunEvents } from './db/migrator.js';
import { validateInitData } from './plugins/auth.js';
import { loadConfig } from './config.js';
import { MockHermesServer } from '@hermes-office/mock-hermes';

function createTelegramInitData(
  user: { id: number; first_name: string; username?: string },
  botToken: string,
  authDate = Math.floor(Date.now() / 1000)
): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(user),
  });
  const sorted = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.append('hash', hash);
  return params.toString();
}

describe('Server Core, Auth & Lifecycle (Phase 2)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;
  let mockHermes: MockHermesServer;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const nonOwnerUser = { id: 999999999, first_name: 'Intruder', username: 'stranger' };

  beforeAll(async () => {
    mockHermes = new MockHermesServer(8642);
    await mockHermes.start();

    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
    await mockHermes.stop();
  });

  describe('Security & Telegram Auth (Section 5, Rules S1-S3)', () => {
    it('validates correct Telegram initData HMAC', () => {
      const initData = createTelegramInitData(ownerUser, botToken);
      const res = validateInitData(initData, botToken);
      expect(res.valid).toBe(true);
      expect(res.user?.id).toBe(ownerUser.id);
    });

    it('rejects tampered hash with 401', () => {
      const initData = createTelegramInitData(ownerUser, botToken);
      const params = new URLSearchParams(initData);
      const originalHash = params.get('hash') || '';
      const tamperedHash = originalHash.slice(0, -1) + (originalHash.endsWith('0') ? '1' : '0');
      params.set('hash', tamperedHash);
      const res = validateInitData(params.toString(), botToken);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Tampered or invalid hash');
    });

    it('rejects expired auth_date (>3600 seconds) with 401', () => {
      const expiredDate = Math.floor(Date.now() / 1000) - 4000;
      const initData = createTelegramInitData(ownerUser, botToken, expiredDate);
      const res = validateInitData(initData, botToken);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('expired');
    });

    it('allows public access to /api/health without auth (S1)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe('ok');
    });

    it('rejects protected route /api/me without auth header with 401 (S1)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects non-owner Telegram ID with 403 Forbidden (S2c)', async () => {
      const initData = createTelegramInitData(nonOwnerUser, botToken);
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { authorization: `tma ${initData}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows authorized owner Telegram ID on /api/me (S2)', async () => {
      const initData = createTelegramInitData(ownerUser, botToken);
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { authorization: `tma ${initData}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.id).toBe(ownerUser.id);
      expect(body.role).toBe('owner');
    });

    it('Rule S3: Config refuses to start in production if DEV_AUTH_BYPASS=1', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          DEV_AUTH_BYPASS: '1',
          HERMES_MODE: 'real',
        });
      }).toThrow(/SECURITY VIOLATION \(Rule S3\)/);
    });

    it('Rule C3f: Config refuses to start in production if HERMES_MODE=mock', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          DEV_AUTH_BYPASS: '0',
          HERMES_MODE: 'mock',
        });
      }).toThrow(/SECURITY VIOLATION \(Rule C3f\)/);
    });
  });

  describe('Database Tables & Maintenance (Section 6)', () => {
    it('executes 14-day pruning routine for run_events', () => {
      const pruned = pruneOldRunEvents(db);
      expect(typeof pruned).toBe('number');
    });
  });

  describe('End-to-End Agent & Task Lifecycle Dispatcher', () => {
    const authHeader = {
      authorization: `tma ${createTelegramInitData(ownerUser, botToken)}`,
    };
    const jsonHeaders = {
      ...authHeader,
      'content-type': 'application/json',
    };

    it('creates an agent, registers in DB, and checks health', async () => {
      const agentRes = await app.inject({
        method: 'POST',
        url: '/api/agents',
        headers: jsonHeaders,
        body: JSON.stringify({
          id: 'agent_finance_01',
          name: 'Felix Finance',
          role: 'Finance Controller',
          department: 'finance',
          avatar: '💰',
          soul_summary: 'Prudent auditor',
          hermes_base_url: 'http://127.0.0.1:8642',
          api_key_env: 'HERMES_KEY_DEFAULT',
          hermes_profile: 'finance',
          active: 1,
          hired_at: Date.now(),
          created_at: Date.now(),
        }),
      });
      expect(agentRes.statusCode).toBe(201);

      const healthRes = await app.inject({
        method: 'GET',
        url: '/api/agents/agent_finance_01/health',
        headers: authHeader,
      });
      expect(healthRes.statusCode).toBe(200);
      expect(JSON.parse(healthRes.body).capabilities.features.run_submission).toBe(true);
    });

    it('creates a task, runs it with mock, handles approval, and completes', async () => {
      const taskRes = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({
          title: 'Approve critical budget allocation transfer',
          description: 'Transfer $5,000 for cloud servers',
          agent_id: 'agent_finance_01',
          priority: 'urgent',
        }),
      });
      expect(taskRes.statusCode).toBe(201);
      const task = JSON.parse(taskRes.body);

      const runRes = await app.inject({
        method: 'POST',
        url: `/api/tasks/${task.id}/run`,
        headers: authHeader,
      });
      expect(runRes.statusCode).toBe(200);
      const { run_id } = JSON.parse(runRes.body);
      expect(run_id).toBeDefined();

      // Allow event stream to process and generate approval request
      await new Promise((r) => setTimeout(r, 800));

      const approvalsRes = await app.inject({
        method: 'GET',
        url: '/api/approvals',
        headers: authHeader,
      });
      expect(approvalsRes.statusCode).toBe(200);
      const approvals = JSON.parse(approvalsRes.body);
      expect(approvals.length).toBeGreaterThan(0);

      const pendingApproval = approvals.find((a: { run_id: string; id: string }) => a.run_id === run_id);
      expect(pendingApproval).toBeDefined();

      // Resolve approval
      const resolveRes = await app.inject({
        method: 'POST',
        url: `/api/approvals/${pendingApproval.id}/resolve`,
        headers: jsonHeaders,
        body: JSON.stringify({ decision: 'approve' }),
      });
      expect(resolveRes.statusCode).toBe(200);

      // Wait for task completion
      await new Promise((r) => setTimeout(r, 600));

      const updatedTaskRes = await app.inject({
        method: 'GET',
        url: '/api/tasks',
        headers: authHeader,
      });
      const tasks = JSON.parse(updatedTaskRes.body);
      const finishedTask = tasks.find((t: { id: string; status: string; result_md: string }) => t.id === task.id);
      expect(finishedTask.status).toBe('done');
      expect(finishedTask.result_md).toBeDefined();
    });

    it('creates and retrieves KPIs and audit log entries', async () => {
      const kpiRes = await app.inject({
        method: 'POST',
        url: '/api/kpis',
        headers: jsonHeaders,
        body: JSON.stringify({
          department: 'finance',
          key: 'mrr',
          label: 'Monthly Recurring Revenue',
          value: 125000,
          unit: 'USD',
          period: '2026-Q3',
          source: 'manual',
        }),
      });
      expect(kpiRes.statusCode).toBe(201);

      const auditRes = await app.inject({
        method: 'GET',
        url: '/api/audit',
        headers: authHeader,
      });
      expect(auditRes.statusCode).toBe(200);
      const logs = JSON.parse(auditRes.body);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].telegram_user_id).toBe(ownerUser.id);
    });
  });
});
