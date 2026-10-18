import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations, pruneOldRunEvents } from './db/migrator.js';
import { MockHermesServer } from '@hermes-office/mock-hermes';
import { AgentPublicSchema } from '@hermes-office/shared';
import { createTelegramInitData } from './auth.test.js';

describe('Server Core, Routes & Lifecycle (Phase 2 & 5)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;
  let mockHermes: MockHermesServer;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };

  let isMockHermesOwner = false;
  beforeAll(async () => {
    mockHermes = new MockHermesServer(8642);
    try {
      await mockHermes.start();
      isMockHermesOwner = true;
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
    if (isMockHermesOwner) {
      await mockHermes.stop();
    }
  });

  /**
   * Rule 9.4 + the Tahap 17 texture regression. The character GLBs embed their
   * texture as `data:image/png`, and three.js loads it through
   * ImageBitmapLoader, which uses `fetch()` — a connect-src request. With
   * `data:` missing from connect-src the loader's catch() swaps in a default
   * white texture and every agent renders as an untextured grey blob. Nothing
   * in the suite caught that, so the policy is pinned here.
   */
  describe('CSP (Rule 9.4 + texture loading)', () => {
    const policyOf = async (): Promise<string> => {
      const res = await app.inject({ method: 'GET', url: '/api/health' });
      const header = res.headers['content-security-policy'];
      return Array.isArray(header) ? header.join('; ') : String(header ?? '');
    };

    it('allows data: in connect-src so GLB textures can load', async () => {
      const csp = await policyOf();
      expect(csp).toContain('connect-src');
      // Parse the directive rather than substring-matching, so 'data:' in some
      // other directive cannot satisfy this.
      const connect = csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('connect-src'));
      expect(connect).toBeDefined();
      expect(connect!.split(/\s+/)).toContain('data:');
    });

    it('stays locked down everywhere else', async () => {
      const csp = await policyOf();
      const directive = (name: string) =>
        csp
          .split(';')
          .map((d) => d.trim())
          .find((d) => d.startsWith(name));

      // No wildcard default, no remote scripts, no remote frames.
      expect(directive('default-src')).toBe("default-src 'self'");
      expect(directive('script-src')).not.toContain('*');
      expect(directive('frame-ancestors')).not.toContain('*');
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('grants no remote origin through connect-src (rule 9.4)', async () => {
      const csp = await policyOf();
      const connect = csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('connect-src'))!;
      const remote = connect
        .split(/\s+/)
        .slice(1)
        .filter((src) => src.startsWith('http') || src.startsWith('ws'));
      // Only the analytics beacon may be remote — no asset host, no CDN.
      expect(remote).toEqual(['https://cloudflareinsights.com']);
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

    it('F-08 contract: GET /api/agents and PATCH /api/agents/:id parse with AgentPublicSchema and contain no server-only fields', async () => {
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/agents',
        headers: authHeader,
      });
      expect(listRes.statusCode).toBe(200);
      const list = JSON.parse(listRes.body);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      for (const agent of list) {
        const parsed = AgentPublicSchema.safeParse(agent);
        expect(parsed.success).toBe(true);
        expect(agent).not.toHaveProperty('hermes_base_url');
        expect(agent).not.toHaveProperty('api_key_env');
        expect(typeof agent.endpoint_configured).toBe('boolean');
      }

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/agents/${list[0].id}`,
        headers: jsonHeaders,
        body: JSON.stringify({ role: 'Updated Role' }),
      });
      expect(patchRes.statusCode).toBe(200);
      const patched = JSON.parse(patchRes.body);
      const parsedPatched = AgentPublicSchema.safeParse(patched);
      expect(parsedPatched.success).toBe(true);
      expect(patched).not.toHaveProperty('hermes_base_url');
      expect(patched).not.toHaveProperty('api_key_env');
      expect(typeof patched.endpoint_configured).toBe('boolean');
      expect(patched.name).toBe(list[0].name);
    });

    it('PATCH /api/tasks/:id updates only specified fields and keeps existing agent_id (C4)', async () => {
      const taskRes = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({
          title: 'Task for patch test',
          description: 'Desc',
          agent_id: 'agent_finance_01',
          priority: 'normal',
        }),
      });
      const task = JSON.parse(taskRes.body);

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/tasks/${task.id}`,
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'done' }),
      });
      expect(patchRes.statusCode).toBe(200);
      const patched = JSON.parse(patchRes.body);
      expect(patched.status).toBe('done');
      expect(patched.agent_id).toBe('agent_finance_01');
      expect(patched.title).toBe('Task for patch test');
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

      // Add agent-sourced KPI to verify unverified source labeling (REQ-078/REQ-079)
      const agentKpiRes = await app.inject({
        method: 'POST',
        url: '/api/kpis',
        headers: jsonHeaders,
        body: JSON.stringify({
          department: 'finance',
          key: 'burn_rate_est',
          label: 'Proyeksi Burn Rate',
          value: 18500,
          unit: 'USD',
          period: '2026-Q3',
          source: 'agent',
          source_note: 'Estimasi agen finance',
        }),
      });
      expect(agentKpiRes.statusCode).toBe(201);
      const agentKpi = JSON.parse(agentKpiRes.body);
      expect(agentKpi.source).toBe('agent');

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

    it('generates anti-hallucination report from verified KPIs (Phase 5 Acceptance)', async () => {
      const genRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        headers: jsonHeaders,
        body: JSON.stringify({
          agent_id: 'agent_finance_01',
          template: 'monthly_finance',
          period: '2026-Q3',
        }),
      });
      expect(genRes.statusCode).toBe(201);
      const report = JSON.parse(genRes.body);
      expect(report.id).toBeDefined();
      expect(report.department).toBe('finance');
      expect(report.body_md).toContain('Ringkasan Eksekutif');
      expect(report.body_md).toContain('Insights');
      expect(report.body_md).toContain('Risks');
      expect(report.body_md).toContain('Actions');

      const metrics = JSON.parse(report.metrics_json);
      expect(metrics.summary_md).toBeDefined();
      expect(Array.isArray(metrics.insights)).toBe(true);
      expect(Array.isArray(metrics.risks)).toBe(true);
      expect(Array.isArray(metrics.actions)).toBe(true);
    });

    it('rejects and retries on invalid agent JSON and returns 422 if unvalidated (Phase 5 Acceptance)', async () => {
      // Create a temporary agent that triggers simulated invalid JSON in mock-hermes
      await app.inject({
        method: 'POST',
        url: '/api/agents',
        headers: jsonHeaders,
        body: JSON.stringify({
          id: 'agent_corrupt_kpi',
          name: 'SIMULATE_INVALID_JSON Agent',
          role: 'Malfunctioning Analyst',
          department: 'marketing',
          avatar: '💥',
          soul_summary: 'Agen simulasi kegagalan JSON anti-halusinasi',
          hermes_base_url: 'http://127.0.0.1:8642',
          api_key_env: 'HERMES_KEY_DEFAULT',
          hermes_profile: 'marketing',
          active: 1,
          hired_at: Date.now(),
          created_at: Date.now(),
        }),
      });

      const failedGenRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        headers: jsonHeaders,
        body: JSON.stringify({
          agent_id: 'agent_corrupt_kpi',
          template: 'campaign_roi',
          period: '2026-Q3',
        }),
      });

      // Must be rejected with 422 validation_failed per anti-hallucination rules
      expect(failedGenRes.statusCode).toBe(422);
      const failedData = JSON.parse(failedGenRes.body);
      expect(failedData.error).toBe('validation_failed');
      expect(failedData.message).toContain('failed anti-hallucination validation');
      expect(failedData.report.body_md).toContain('Gagal membuat laporan');
    });
  });
});
