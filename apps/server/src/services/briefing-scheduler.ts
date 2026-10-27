import type Database from 'better-sqlite3';
import { SettingRepository } from '../db/repositories/settings.js';
import {
  type DailyBriefingMetrics,
  type TelegramNotificationService,
  telegramNotifications,
} from './notifications.js';

export interface WibDateInfo {
  startMs: number;
  endMs: number;
  dateStr: string;
  key: string;
  hour: number;
}

/**
 * Calculates start/end boundaries and formatting for Indonesia Western Time (WIB / UTC+7).
 */
export function getWibDateInfo(nowMs: number = Date.now()): WibDateInfo {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const wibTime = new Date(nowMs + WIB_OFFSET_MS);

  const year = wibTime.getUTCFullYear();
  const month = wibTime.getUTCMonth(); // 0-11
  const day = wibTime.getUTCDate();
  const hour = wibTime.getUTCHours();

  const startMs = Date.UTC(year, month, day, 0, 0, 0, 0) - WIB_OFFSET_MS;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;

  const monthNamesId = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  const dateStr = `${day} ${monthNamesId[month]} ${year}`;
  const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { startMs, endMs, dateStr, key, hour };
}

export interface TriggerBriefingResult {
  triggered: boolean;
  reason?:
    | 'before_18_wib'
    | 'already_sent_today'
    | 'daily_briefing_disabled'
    | 'send_failed'
    | 'forced_success'
    | 'scheduled_success';
  metrics: DailyBriefingMetrics;
}

export class ExecutiveBriefingService {
  private settingRepo: SettingRepository;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private db: Database.Database,
    private notifications: TelegramNotificationService = telegramNotifications
  ) {
    this.settingRepo = new SettingRepository(db);
  }

  /**
   * Aggregates factual performance metrics for today (WIB) from SQLite.
   */
  public getDailyBriefingMetrics(nowMs: number = Date.now()): DailyBriefingMetrics {
    const { startMs, endMs, dateStr } = getWibDateInfo(nowMs);

    // 1. Tasks completed today (WIB)
    const completedRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM tasks 
         WHERE status = 'done' 
         AND COALESCE(updated_at, created_at) >= ? 
         AND COALESCE(updated_at, created_at) <= ?`
      )
      .get(startMs, endMs) as { count: number };
    const tasksCompleted = completedRow ? completedRow.count : 0;

    // 2. Tasks failed today (WIB)
    const failedRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM tasks 
         WHERE status = 'failed' 
         AND COALESCE(updated_at, created_at) >= ? 
         AND COALESCE(updated_at, created_at) <= ?`
      )
      .get(startMs, endMs) as { count: number };
    const tasksFailed = failedRow ? failedRow.count : 0;

    // 3. Success rate (% completed out of terminal tasks)
    const totalFinished = tasksCompleted + tasksFailed;
    const successRate = totalFinished > 0 ? Math.round((tasksCompleted / totalFinished) * 100) : 100;

    // 4. Pending approvals currently awaiting decision
    const pendingApprovalRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'`)
      .get() as { count: number };
    const pendingApprovals = pendingApprovalRow ? pendingApprovalRow.count : 0;

    // 5. Department breakdown of completed tasks
    const departmentBreakdown: Record<string, number> = {};

    // Inisialisasi departemen yang terdaftar di agen aktif
    const activeDepts = this.db
      .prepare(`SELECT DISTINCT department FROM agents WHERE active = 1 AND department IS NOT NULL`)
      .all() as { department: string }[];

    if (activeDepts.length > 0) {
      for (const row of activeDepts) {
        if (row.department) {
          departmentBreakdown[row.department.toLowerCase()] = 0;
        }
      }
    } else {
      // Default fallback jika belum ada agen terdaftar
      departmentBreakdown.sales = 0;
      departmentBreakdown.marketing = 0;
      departmentBreakdown.development = 0;
      departmentBreakdown.operations = 0;
    }

    const deptCounts = this.db
      .prepare(
        `SELECT a.department, COUNT(t.id) as count
         FROM tasks t
         JOIN agents a ON t.agent_id = a.id
         WHERE t.status = 'done'
         AND COALESCE(t.updated_at, t.created_at) >= ?
         AND COALESCE(t.updated_at, t.created_at) <= ?
         GROUP BY a.department`
      )
      .all(startMs, endMs) as { department: string; count: number }[];

    for (const row of deptCounts) {
      if (row.department) {
        departmentBreakdown[row.department.toLowerCase()] = row.count;
      }
    }

    return {
      date: dateStr,
      tasksCompleted,
      successRate,
      pendingApprovals,
      departmentBreakdown,
    };
  }

  /**
   * Checks conditions and triggers daily executive briefing.
   * Enforces 18:00 WIB constraint and calendar-day idempotency lock.
   */
  public async checkAndTrigger(nowMs: number = Date.now(), force = false): Promise<TriggerBriefingResult> {
    const info = getWibDateInfo(nowMs);
    const metrics = this.getDailyBriefingMetrics(nowMs);

    if (!force) {
      // Rule FR-4: Runs at or after 18:00 WIB (11:00 UTC)
      if (info.hour < 18) {
        return { triggered: false, reason: 'before_18_wib', metrics };
      }

      // Idempotency: Max once per calendar day
      const lastRun = this.settingRepo.get('last_daily_briefing_date');
      if (lastRun === info.key) {
        return { triggered: false, reason: 'already_sent_today', metrics };
      }

      // Preferences check
      const prefs = this.notifications.getPreferences();
      if (!prefs.daily_briefing_enabled) {
        return { triggered: false, reason: 'daily_briefing_disabled', metrics };
      }
    }

    const success = await this.notifications.sendDailyBriefing(metrics);
    if (success) {
      this.settingRepo.set('last_daily_briefing_date', info.key);
      return {
        triggered: true,
        reason: force ? 'forced_success' : 'scheduled_success',
        metrics,
      };
    }

    return { triggered: false, reason: 'send_failed', metrics };
  }

  /**
   * Starts periodic timer checking every intervalMs (defaults to 60s).
   */
  public start(intervalMs = 60000): void {
    if (this.timer) return;

    // Initial tick on startup
    void this.checkAndTrigger().catch(() => {});

    this.timer = setInterval(() => {
      void this.checkAndTrigger().catch(() => {});
    }, intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the active periodic scheduler timer.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
