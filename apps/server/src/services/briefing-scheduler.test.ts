import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../db/migrator.js';
import { AgentRepository } from '../db/repositories/agents.js';
import { SettingRepository } from '../db/repositories/settings.js';
import {
  ExecutiveBriefingService,
  getWibDateInfo,
} from './briefing-scheduler.js';
import {
  TelegramNotificationService,
  type DailyBriefingMetrics,
} from './notifications.js';

describe('ExecutiveBriefingService (Task 4.0 — Executive Daily Briefing)', () => {
  let db: BetterSqlite3.Database;
  let agentRepo: AgentRepository;
  let settingRepo: SettingRepository;
  let mockNotifications: TelegramNotificationService;
  let scheduler: ExecutiveBriefingService;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    agentRepo = new AgentRepository(db);
    settingRepo = new SettingRepository(db);

    // Mock notification service target single chat id
    mockNotifications = new TelegramNotificationService('mock_token', [123456789], 'https://office.example.com');
    scheduler = new ExecutiveBriefingService(db, mockNotifications);
  });

  afterEach(() => {
    scheduler.stop();
    db.close();
  });

  describe('getWibDateInfo (Timezone & Date Bracketing)', () => {
    it('accurately computes WIB UTC+7 boundaries and Indonesian date string', () => {
      // 2026-10-27 11:00:00 UTC = 2026-10-27 18:00:00 WIB
      const testMs = Date.UTC(2026, 9, 27, 11, 0, 0); // Month 9 is October (0-indexed)
      const info = getWibDateInfo(testMs);

      expect(info.hour).toBe(18);
      expect(info.key).toBe('2026-10-27');
      expect(info.dateStr).toBe('27 Oktober 2026');

      // Start of WIB day in UTC ms: 2026-10-26 17:00:00 UTC
      expect(info.startMs).toBe(Date.UTC(2026, 9, 26, 17, 0, 0));
      // End of WIB day in UTC ms: 2026-10-27 16:59:59.999 UTC
      expect(info.endMs).toBe(Date.UTC(2026, 9, 27, 16, 59, 59, 999));
    });

    it('correctly shifts day when crossing midnight in WIB', () => {
      // 2026-10-27 17:30:00 UTC = 2026-10-28 00:30:00 WIB
      const testMs = Date.UTC(2026, 9, 27, 17, 30, 0);
      const info = getWibDateInfo(testMs);

      expect(info.hour).toBe(0);
      expect(info.key).toBe('2026-10-28');
      expect(info.dateStr).toBe('28 Oktober 2026');
    });
  });

  describe('getDailyBriefingMetrics (SQLite Metric Aggregation)', () => {
    it('aggregates factual tasks, success rates, approvals, and department breakdown', () => {
      const now = Date.UTC(2026, 9, 27, 11, 0, 0); // 18:00 WIB

      // Seed 3 agents across departments
      agentRepo.create({
        id: 'agent_sales',
        name: 'Budi Sales',
        role: 'Account Executive',
        department: 'sales',
        avatar: '💼',
        soul_summary: '',
        hermes_base_url: 'http://127.0.0.1:8642',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: now,
        created_at: now,
      });

      agentRepo.create({
        id: 'agent_dev',
        name: 'Siti Dev',
        role: 'Lead Developer',
        department: 'development',
        avatar: '💻',
        soul_summary: '',
        hermes_base_url: 'http://127.0.0.1:8642',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: now,
        created_at: now,
      });

      agentRepo.create({
        id: 'agent_ops',
        name: 'Rian Ops',
        role: 'DevOps Engineer',
        department: 'operations',
        avatar: '⚙️',
        soul_summary: '',
        hermes_base_url: 'http://127.0.0.1:8642',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: now,
        created_at: now,
      });

      // Tasks today:
      // - 2 done for sales
      // - 1 done for dev
      // - 1 failed for dev
      // - 1 running for ops (in progress, not terminal)
      const taskStmt = db.prepare(`
        INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
        VALUES (?, ?, '', ?, 'normal', ?, 'run_x', ?, NULL, 123456789, ?, ?, 'manual', 0)
      `);

      taskStmt.run('t_sales_1', 'Lead outreach 1', 'agent_sales', 'done', 'Result 1', now, now);
      taskStmt.run('t_sales_2', 'Lead outreach 2', 'agent_sales', 'done', 'Result 2', now, now);
      taskStmt.run('t_dev_1', 'Fix auth bug', 'agent_dev', 'done', 'Fixed', now, now);
      taskStmt.run('t_dev_2', 'Deploy cluster', 'agent_dev', 'failed', 'Timeout', now, now);
      taskStmt.run('t_ops_1', 'Monitor metrics', 'agent_ops', 'running', null, now, now);

      // Task yesterday (should NOT be counted in today's metrics):
      const yesterday = now - 24 * 60 * 60 * 1000;
      taskStmt.run('t_old_1', 'Old task', 'agent_sales', 'done', 'Old result', yesterday, yesterday);

      // Approvals:
      const apprStmt = db.prepare(`
        INSERT INTO approvals (id, run_id, agent_id, summary, payload_json, status, created_at)
        VALUES (?, 'run_appr', 'agent_dev', 'Aksi sensitif', '{}', ?, ?)
      `);
      apprStmt.run('appr_1', 'pending', now);
      apprStmt.run('appr_2', 'pending', now);
      apprStmt.run('appr_3', 'approved', now);

      const metrics: DailyBriefingMetrics = scheduler.getDailyBriefingMetrics(now);

      expect(metrics.date).toBe('27 Oktober 2026');
      expect(metrics.tasksCompleted).toBe(3); // 2 sales + 1 dev
      expect(metrics.successRate).toBe(75); // 3 done out of 4 terminal (3 done + 1 failed) = 75%
      expect(metrics.pendingApprovals).toBe(2);
      expect(metrics.departmentBreakdown.sales).toBe(2);
      expect(metrics.departmentBreakdown.development).toBe(1);
      expect(metrics.departmentBreakdown.operations).toBe(0);
    });

    it('returns 100% success rate when zero tasks were finished today', () => {
      const now = Date.UTC(2026, 9, 27, 11, 0, 0);
      const metrics = scheduler.getDailyBriefingMetrics(now);

      expect(metrics.tasksCompleted).toBe(0);
      expect(metrics.successRate).toBe(100);
      expect(metrics.pendingApprovals).toBe(0);
    });
  });

  describe('checkAndTrigger (18:00 WIB & Idempotency Constraints)', () => {
    it('refuses to trigger before 18:00 WIB', async () => {
      // 10:00 WIB = 03:00 UTC
      const morningTime = Date.UTC(2026, 9, 27, 3, 0, 0);
      const result = await scheduler.checkAndTrigger(morningTime);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('before_18_wib');
      expect(mockNotifications.getSentNotifications().length).toBe(0);
    });

    it('triggers successfully at or after 18:00 WIB and sets calendar idempotency lock', async () => {
      // 18:05 WIB = 11:05 UTC
      const eveningTime = Date.UTC(2026, 9, 27, 11, 5, 0);
      const result = await scheduler.checkAndTrigger(eveningTime);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('scheduled_success');

      const sent = mockNotifications.getSentNotifications();
      expect(sent.length).toBe(1);
      expect(sent[0].text).toContain('Executive Daily Briefing');
      expect(sent[0].text).toContain('27 Oktober 2026');
      expect(sent[0].text).toContain('Ringkasan Kinerja Hari Ini:');
      expect(sent[0].buttonText).toBe('Lihat Dashboard Lengkap');

      // Idempotency setting recorded in SQLite
      expect(settingRepo.get('last_daily_briefing_date')).toBe('2026-10-27');
    });

    it('prevents double trigger on the same calendar day', async () => {
      const eveningTime = Date.UTC(2026, 9, 27, 11, 5, 0);
      // First trigger
      const firstResult = await scheduler.checkAndTrigger(eveningTime);
      expect(firstResult.triggered).toBe(true);

      // Second trigger at 19:00 WIB
      const laterTime = Date.UTC(2026, 9, 27, 12, 0, 0);
      const secondResult = await scheduler.checkAndTrigger(laterTime);

      expect(secondResult.triggered).toBe(false);
      expect(secondResult.reason).toBe('already_sent_today');
      expect(mockNotifications.getSentNotifications().length).toBe(1);
    });

    it('allows force trigger to bypass hour check and idempotency lock', async () => {
      const morningTime = Date.UTC(2026, 9, 27, 3, 0, 0);
      const result = await scheduler.checkAndTrigger(morningTime, true);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('forced_success');
      expect(mockNotifications.getSentNotifications().length).toBe(1);
    });

    it('respects notification preferences when daily_briefing_enabled is false', async () => {
      mockNotifications.setPreferencesProvider(() => ({
        notify_task_completed: true,
        notify_task_failed: true,
        notify_approval_pending: true,
        daily_briefing_enabled: false,
      }));

      const eveningTime = Date.UTC(2026, 9, 27, 11, 5, 0);
      const result = await scheduler.checkAndTrigger(eveningTime);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('daily_briefing_disabled');
      expect(mockNotifications.getSentNotifications().length).toBe(0);
    });
  });

  describe('start & stop lifecycle', () => {
    it('can start and stop without errors or orphan timers', () => {
      expect(() => {
        scheduler.start(5000);
        scheduler.stop();
      }).not.toThrow();
    });
  });
});
