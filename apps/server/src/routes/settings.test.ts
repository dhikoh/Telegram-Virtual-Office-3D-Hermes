import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import { telegramNotifications } from '../services/notifications.js';

describe('Settings Routes (Task 5.0 — Telegram Notification Preferences)', () => {
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

  it('GET /api/settings/notifications returns default preferences when none stored', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/notifications',
      headers: authHeader,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    });
  });

  it('PATCH /api/settings/notifications updates preferences and persists in SQLite', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/notifications',
      headers: jsonHeaders,
      body: JSON.stringify({
        notify_task_completed: false,
        daily_briefing_enabled: false,
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.notify_task_completed).toBe(false);
    expect(body.daily_briefing_enabled).toBe(false);
    expect(body.notify_task_failed).toBe(true);
    expect(body.notify_approval_pending).toBe(true);

    // Verify GET retrieves updated preferences
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/settings/notifications',
      headers: authHeader,
    });
    expect(JSON.parse(getRes.body).notify_task_completed).toBe(false);

    // Verify audit log
    const auditRow = db
      .prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT 1')
      .get('settings.notifications_update') as { telegram_user_id: number; target: string } | undefined;
    expect(auditRow).toBeDefined();
    expect(auditRow?.telegram_user_id).toBe(ownerUser.id);
  });

  it('PATCH /api/settings/notifications rejects invalid payload with 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/notifications',
      headers: jsonHeaders,
      body: JSON.stringify({
        notify_task_completed: 'not-a-boolean',
      }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_input');
  });

  it('POST /api/settings/notifications/test sends test notification and returns ok', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/notifications/test',
      headers: authHeader,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.sent_count).toBeGreaterThan(0);
    expect(body.target_chat_ids).toContain(123456789);

    const sent = telegramNotifications.getSentNotifications();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].text).toContain('Uji Notifikasi Telegram');
    expect(sent[0].buttonText).toBe('Buka Virtual Office');
  });

  it('proactively silences notifications when preference is turned off in DB', async () => {
    // Turn off task completed notifications
    await app.inject({
      method: 'PATCH',
      url: '/api/settings/notifications',
      headers: jsonHeaders,
      body: JSON.stringify({
        notify_task_completed: false,
      }),
    });

    telegramNotifications.clearSentNotificationsForTest();

    // Trigger notifyTaskCompleted
    const result = await telegramNotifications.notifyTaskCompleted(
      { id: 'task_muted', title: 'Tugas Senyap' },
      'Raka Sales'
    );

    expect(result).toBe(false);
    expect(telegramNotifications.getSentNotifications().length).toBe(0);
  });
});
