import { config } from '../config.js';
import type { NotificationPreferences, TestNotificationResult } from '@hermes-office/shared';

export interface SentTelegramNotification {
  chatId: number;
  text: string;
  buttonText?: string;
  webAppUrl?: string;
  timestamp: number;
}

export interface DailyBriefingMetrics {
  date: string;
  tasksCompleted: number;
  successRate: number;
  pendingApprovals: number;
  departmentBreakdown: Record<string, number>;
}

/**
 * Escapes dynamic content for Telegram Markdown V1 entities (_ * ` [).
 */
export function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, '\\$1');
}

export class TelegramNotificationService {
  private sentNotifications: SentTelegramNotification[] = [];
  private preferencesProvider?: () => NotificationPreferences;

  constructor(
    private botToken: string = config.TELEGRAM_BOT_TOKEN,
    private ownerIds: number[] = config.ownerIdsList,
    private appUrl: string = config.APP_URL || 'https://t.me/hermes_office_bot/app',
    preferencesProvider?: () => NotificationPreferences
  ) {
    this.preferencesProvider = preferencesProvider;
  }

  public setPreferencesProvider(provider: () => NotificationPreferences): void {
    this.preferencesProvider = provider;
  }

  public getPreferences(): NotificationPreferences {
    if (this.preferencesProvider) {
      try {
        return this.preferencesProvider();
      } catch {
        // Fallback gracefully on error
      }
    }
    return {
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    };
  }

  public getSentNotifications(): SentTelegramNotification[] {
    return [...this.sentNotifications];
  }

  public getLastNotification(): SentTelegramNotification | undefined {
    return this.sentNotifications[this.sentNotifications.length - 1];
  }

  public clearSentNotifications(): void {
    this.sentNotifications = [];
  }

  public clearSentNotificationsForTest(): void {
    this.clearSentNotifications();
  }

  public async sendMessage(text: string, buttonText = 'Buka Virtual Office'): Promise<boolean> {
    if (!this.ownerIds.length) {
      return false;
    }

    const isMock = this.botToken === 'mock_telegram_bot_token' || config.NODE_ENV === 'test';

    let allSuccess = true;
    for (const chatId of this.ownerIds) {
      const record: SentTelegramNotification = {
        chatId,
        text,
        buttonText,
        webAppUrl: this.appUrl,
        timestamp: Date.now(),
      };
      this.sentNotifications.push(record);

      if (isMock) {
        continue;
      }

      // Security Rule REQ-011: ONLY call sendMessage; never getUpdates or setWebhook
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: buttonText,
                    web_app: { url: this.appUrl },
                  },
                ],
              ],
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (!response.ok) {
          allSuccess = false;
        }
      } catch {
        allSuccess = false;
      }
    }

    return allSuccess;
  }

  public async notifyTaskCompleted(
    task: { id: string; title: string; department?: string },
    agentName: string,
    outputSummary?: string
  ): Promise<boolean> {
    const prefs = this.getPreferences();
    if (!prefs.notify_task_completed) {
      return false;
    }

    const deptText = task.department ? ` (${escapeTelegramMarkdown(task.department.toUpperCase())})` : '';
    const lines = [
      '✅ *Tugas Selesai*',
      `Agen: *${escapeTelegramMarkdown(agentName)}*${deptText}`,
      `Tugas: *${escapeTelegramMarkdown(task.title)}*`,
    ];

    if (outputSummary && outputSummary.trim()) {
      lines.push(`Hasil: ${escapeTelegramMarkdown(outputSummary.trim().slice(0, 300))}`);
    }

    lines.push(`ID Tugas: \`${task.id}\``);

    return this.sendMessage(lines.join('\n'), 'Buka Virtual Office');
  }

  public async notifyApprovalPending(
    approval: { id: string; run_id: string; summary: string },
    agentName: string
  ): Promise<boolean> {
    const prefs = this.getPreferences();
    if (!prefs.notify_approval_pending) {
      return false;
    }

    const text = [
      '⚠️ *Persetujuan Diperlukan*',
      `Agen: *${escapeTelegramMarkdown(agentName)}*`,
      `Ringkasan: ${escapeTelegramMarkdown(approval.summary)}`,
      `ID Persetujuan: \`${approval.id}\``,
    ].join('\n');

    return this.sendMessage(text, 'Tinjau Persetujuan');
  }

  public async notifyRunFailed(
    task: { id: string; title: string },
    agentName: string,
    error: string
  ): Promise<boolean> {
    const prefs = this.getPreferences();
    if (!prefs.notify_task_failed) {
      return false;
    }

    const text = [
      '🚨 *Eksekusi Tugas Gagal*',
      `Agen: *${escapeTelegramMarkdown(agentName)}*`,
      `Tugas: *${escapeTelegramMarkdown(task.title)}*`,
      `Error: ${escapeTelegramMarkdown(error.slice(0, 300))}`,
      `ID Tugas: \`${task.id}\``,
    ].join('\n');

    return this.sendMessage(text, 'Periksa Error');
  }

  public async notifyReportReady(
    report: { id: string; department: string; template: string; period: string },
    agentName: string
  ): Promise<boolean> {
    const text = [
      '📊 *Laporan Kinerja Siap*',
      `Departemen: *${escapeTelegramMarkdown(report.department.toUpperCase())}*`,
      `Penyusun: *${escapeTelegramMarkdown(agentName)}*`,
      `Template: *${escapeTelegramMarkdown(report.template)}* (${escapeTelegramMarkdown(report.period)})`,
      `ID Laporan: \`${report.id}\``,
    ].join('\n');

    return this.sendMessage(text, 'Baca Laporan');
  }

  public async sendDailyBriefing(metrics: DailyBriefingMetrics): Promise<boolean> {
    const prefs = this.getPreferences();
    if (!prefs.daily_briefing_enabled) {
      return false;
    }

    const deptEntries = Object.entries(metrics.departmentBreakdown);
    const deptLines =
      deptEntries.length > 0
        ? deptEntries.map(([dept, count]) => `• ${escapeTelegramMarkdown(dept.toUpperCase())}: ${count} tugas`).join('\n')
        : '• Belum ada aktivitas departemen hari ini';

    const text = [
      '🏢 *Executive Daily Briefing — Hermes Office*',
      `📅 *${escapeTelegramMarkdown(metrics.date)}*`,
      '',
      '📊 *Ringkasan Kinerja Hari Ini:*',
      `• Tugas Selesai: *${metrics.tasksCompleted}* tugas`,
      `• Tingkat Keberhasilan: *${metrics.successRate}%*`,
      `• Approval Tertunda: *${metrics.pendingApprovals}* perlu tindakan`,
      '',
      '🏛️ *Aktivitas Departemen:*',
      deptLines,
      '',
      'Semua agen beroperasi normal di kantor virtual.',
    ].join('\n');

    return this.sendMessage(text, 'Lihat Dashboard Lengkap');
  }

  public async sendTestNotification(): Promise<TestNotificationResult> {
    if (!this.ownerIds.length) {
      return {
        ok: false,
        sent_count: 0,
        target_chat_ids: [],
        message: 'Tidak ada OWNER_TELEGRAM_IDS yang dikonfigurasi di server',
        timestamp: Date.now(),
      };
    }

    const text = [
      '🔔 *Uji Notifikasi Telegram*',
      'Hermes Virtual Office terhubung dengan sukses ke akun Telegram Anda.',
      'Notifikasi proaktif dan ringkasan eksekutif siap dikirimkan.',
    ].join('\n');

    const success = await this.sendMessage(text, 'Buka Virtual Office');
    return {
      ok: success,
      sent_count: success ? this.ownerIds.length : 0,
      target_chat_ids: [...this.ownerIds],
      message: success
        ? 'Notifikasi uji berhasil dikirim ke seluruh Owner Telegram'
        : 'Gagal mengirim notifikasi uji ke Telegram API',
      timestamp: Date.now(),
    };
  }
}

export const telegramNotifications = new TelegramNotificationService();

