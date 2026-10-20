import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { AgentRepository } from './db/repositories/agents.js';
import { HiringRepository } from './db/repositories/hiring.js';
import { AuditRepository } from './db/repositories/audit.js';
import { createTelegramInitData } from './auth.test.js';

describe('Fase 3 — Integrasi Profil Hermes & Provisioning Endpoints', () => {
  let db: BetterSqlite3.Database;
  let server: ReturnType<typeof buildServer>;
  let agentRepo: AgentRepository;
  let hiringRepo: HiringRepository;
  let auditRepo: AuditRepository;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'Owner', username: 'owner_virtual' };
  const auth = 'tma ' + createTelegramInitData(ownerUser, botToken);

  beforeEach(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    agentRepo = new AgentRepository(db);
    hiringRepo = new HiringRepository(db);
    auditRepo = new AuditRepository(db);

    server = buildServer({ db });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  describe('POST /api/agents/:id/provision', () => {
    it('returns 404 if agent does not exist', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/agents/agent_non_existent/provision',
        headers: { authorization: auth },
        payload: {},
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('not_found');
    });

    it('provisions unprovisioned agent into ready state and returns 200', async () => {
      const now = Date.now();
      agentRepo.create({
        id: 'agent_test_prov',
        name: 'Aria Social',
        role: 'Social Lead',
        department: 'social',
        avatar: '📱',
        soul_summary: 'Mengelola kanal sosial resmi.',
        hermes_base_url: '',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: now,
        created_at: now,
      });

      const initial = agentRepo.getById('agent_test_prov');
      expect(initial?.provision_state).toBe('unprovisioned');

      const res = await server.inject({
        method: 'POST',
        url: '/api/agents/agent_test_prov/provision',
        headers: { authorization: auth },
        payload: {
          custom_soul_md: '# SOUL: Aria Social\n\nCustom Soul for testing provisioning.',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('ready');
      expect(body.result.profile_name).toBe('aria-social');
      expect(body.result.provision_state).toBe('ready');
      expect(body.agent.provision_state).toBe('ready');

      // Verify DB record updated
      const updated = agentRepo.getById('agent_test_prov');
      expect(updated?.provision_state).toBe('ready');
      expect(updated?.provision_error).toBeNull();
      expect(typeof updated?.provisioned_at).toBe('number');

      // Verify audit log
      const logs = auditRepo.getAll(10);
      const provisionLog = logs.find((l) => l.action === 'agent.provision');
      expect(provisionLog).toBeDefined();
      expect(provisionLog?.target).toBe('agent_test_prov');
    });

    it('re-provisioning is idempotent and returns 200', async () => {
      const now = Date.now();
      agentRepo.create({
        id: 'agent_idempotent',
        name: 'Idempotent Agent',
        role: 'Tester',
        department: 'analytics',
        avatar: '📊',
        soul_summary: 'Uji idempotensi.',
        hermes_base_url: '',
        api_key_env: 'KEY',
        hermes_profile: 'idempotent-agent',
        active: 1,
        hired_at: now,
        created_at: now,
      });

      // First call
      const res1 = await server.inject({
        method: 'POST',
        url: '/api/agents/agent_idempotent/provision',
        headers: { authorization: auth },
        payload: {},
      });
      expect(res1.statusCode).toBe(200);

      // Second call (idempotent re-provision)
      const res2 = await server.inject({
        method: 'POST',
        url: '/api/agents/agent_idempotent/provision',
        headers: { authorization: auth },
        payload: {},
      });
      expect(res2.statusCode).toBe(200);
      const body2 = JSON.parse(res2.payload);
      expect(body2.status).toBe('ready');
      expect(body2.result.provision_state).toBe('ready');
    });
  });

  describe('Hiring Auto-Provisioning (POST /api/hiring/:id/mark-hired)', () => {
    it('automatically provisions newly hired agent to ready state', async () => {
      const draftId = `draft_${Date.now()}`;
      hiringRepo.createDraft({
        id: draftId,
        form_json: JSON.stringify({ name: 'Kalam Writer', role: 'Content Writer' }),
        soul_md: '# SOUL: Kalam Writer\n\nPenulis konten terpercaya.',
        commands_md: '# VPS Setup\n',
        status: 'draft',
        created_at: Date.now(),
      });

      const res = await server.inject({
        method: 'POST',
        url: `/api/hiring/${draftId}/mark-hired`,
        headers: { authorization: auth },
        payload: {
          agent: {
            id: 'agent_kalam_hired',
            name: 'Kalam Writer',
            role: 'Content Writer',
            department: 'marketing',
            avatar: '✍️',
            soul_summary: 'Penulis konten terpercaya.',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('hired');

      // Verify agent was created AND automatically provisioned to ready
      const hiredAgent = agentRepo.getById('agent_kalam_hired');
      expect(hiredAgent).not.toBeNull();
      expect(hiredAgent?.provision_state).toBe('ready');
      expect(hiredAgent?.hermes_profile).toBe('kalam-writer');
      expect(typeof hiredAgent?.provisioned_at).toBe('number');

      // Verify audit logs
      const logs = auditRepo.getAll(10);
      expect(logs.some((l) => l.action === 'hiring.mark_hired')).toBe(true);
      expect(logs.some((l) => l.action === 'agent.provision')).toBe(true);
    });
  });
});
