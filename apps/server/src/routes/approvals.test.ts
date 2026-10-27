import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import { telegramNotifications } from '../services/notifications.js';

describe('Approvals Routes & Proactive Notification (Task 3.0)', () => {
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

  const AGENT_ID = 'agent_guard_01';

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);

    const now = Date.now();
    db.prepare(`
      INSERT INTO agents (id, name, role, department, avatar, soul_summary, hermes_base_url, api_key_env, hermes_profile, active, hired_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      AGENT_ID,
      'Guardian Bot',
      'Security Officer',
      'operations',
      '🛡️',
      'Security & Access Control',
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

  beforeEach(() => {
    telegramNotifications.clearSentNotificationsForTest();
  });

  it('GET /api/approvals returns list of approval requests', async () => {
    const apprId = `appr_${Date.now()}_test`;
    const now = Date.now();
    db.prepare(`
      INSERT INTO approvals (id, run_id, agent_id, summary, payload_json, status, created_at)
      VALUES (?, 'run_appr_1', ?, 'Transfer dana senilai $5000', '{}', 'pending', ?)
    `).run(apprId, AGENT_ID, now);

    const res = await app.inject({
      method: 'GET',
      url: '/api/approvals',
      headers: authHeader,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((a: { id: string }) => a.id === apprId)).toBe(true);
  });

  it('POST /api/approvals/:id/resolve resolves pending approval and logs audit', async () => {
    const apprId = `appr_${Date.now()}_resolve`;
    const now = Date.now();
    db.prepare(`
      INSERT INTO approvals (id, run_id, agent_id, summary, payload_json, status, created_at)
      VALUES (?, 'run_appr_resolve', ?, 'Persetujuan eksekusi migrasi schema', '{}', 'pending', ?)
    `).run(apprId, AGENT_ID, now);

    // Mock dispatcher.resolveApproval to isolate unit test from external Hermes gateway
    app.dispatcher.resolveApproval = async (approvalId: string, decision: 'approve' | 'deny', userId: number) => {
      db.prepare('UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
        .run(decision === 'approve' ? 'approved' : 'denied', userId, Date.now(), approvalId);
    };

    const res = await app.inject({
      method: 'POST',
      url: `/api/approvals/${apprId}/resolve`,
      headers: jsonHeaders,
      body: JSON.stringify({ decision: 'approve' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('resolved');
    expect(body.decision).toBe('approve');

    const updated = db.prepare('SELECT status, decided_by FROM approvals WHERE id = ?').get(apprId) as {
      status: string;
      decided_by: number;
    };
    expect(updated.status).toBe('approved');
    expect(updated.decided_by).toBe(ownerUser.id);
  });

  it('POST /api/approvals/:id/resolve rejects non-existent approval with 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/approvals/non_existent_id/resolve',
      headers: jsonHeaders,
      body: JSON.stringify({ decision: 'approve' }),
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /api/approvals/:id/resolve rejects already resolved approval with 400', async () => {
    const apprId = `appr_${Date.now()}_done`;
    const now = Date.now();
    db.prepare(`
      INSERT INTO approvals (id, run_id, agent_id, summary, payload_json, status, decided_by, decided_at, created_at)
      VALUES (?, 'run_appr_done', ?, 'Aksi sensitif', '{}', 'approved', 123456789, ?, ?)
    `).run(apprId, AGENT_ID, now, now);

    const res = await app.inject({
      method: 'POST',
      url: `/api/approvals/${apprId}/resolve`,
      headers: jsonHeaders,
      body: JSON.stringify({ decision: 'approve' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('already_resolved');
  });

  it('mengirim notifikasi Telegram saat ada permintaan approval pending', async () => {
    telegramNotifications.clearSentNotificationsForTest();

    await telegramNotifications.notifyApprovalPending(
      { id: 'appr_pending_1', run_id: 'run_p1', summary: 'Transfer database production' },
      'Guardian Bot'
    );

    const sent = telegramNotifications.getSentNotifications();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].text).toContain('Persetujuan Diperlukan');
    expect(sent[0].text).toContain('Guardian Bot');
    expect(sent[0].text).toContain('Transfer database production');
    expect(sent[0].buttonText).toBe('Tinjau Persetujuan');
  });
});
