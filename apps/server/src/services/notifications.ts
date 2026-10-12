import { config } from '../config.js';

export interface SentTelegramNotification {
  chatId: number;
  text: string;
  buttonText?: string;
  webAppUrl?: string;
  timestamp: number;
}

export class TelegramNotificationService {
  private sentNotifications: SentTelegramNotification[] = [];

  constructor(
    private botToken: string = config.TELEGRAM_BOT_TOKEN,
    private ownerIds: number[] = config.ownerIdsList,
    private appUrl: string = config.APP_URL || 'https://t.me/hermes_office_bot/app'
  ) {}

  public getSentNotifications(): SentTelegramNotification[] {
    return [...this.sentNotifications];
  }

  public getLastNotification(): SentTelegramNotification | undefined {
    return this.sentNotifications[this.sentNotifications.length - 1];
  }

  public clearSentNotifications(): void {
    this.sentNotifications = [];
  }

  public async sendMessage(text: string, buttonText = 'Buka Virtual Office'): Promise<boolean> {
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

  public async notifyApprovalPending(
    approval: { id: string; run_id: string; summary: string },
    agentName: string
  ): Promise<void> {
    const text = [
      '⚠️ *Persetujuan Diperlukan*',
      `Agen: *${agentName}*`,
      `Ringkasan: ${approval.summary}`,
      `ID Persetujuan: \`${approval.id}\``,
    ].join('\n');

    await this.sendMessage(text, 'Tinjau Persetujuan');
  }

  public async notifyRunFailed(
    task: { id: string; title: string },
    agentName: string,
    error: string
  ): Promise<void> {
    const text = [
      '🚨 *Eksekusi Tugas Gagal*',
      `Agen: *${agentName}*`,
      `Tugas: *${task.title}*`,
      `Error: ${error.slice(0, 300)}`,
      `ID Tugas: \`${task.id}\``,
    ].join('\n');

    await this.sendMessage(text, 'Periksa Error');
  }

  public async notifyReportReady(
    report: { id: string; department: string; template: string; period: string },
    agentName: string
  ): Promise<void> {
    const text = [
      '📊 *Laporan Kinerja Siap*',
      `Departemen: *${report.department.toUpperCase()}*`,
      `Penyusun: *${agentName}*`,
      `Template: *${report.template}* (${report.period})`,
      `ID Laporan: \`${report.id}\``,
    ].join('\n');

    await this.sendMessage(text, 'Baca Laporan');
  }
}

export const telegramNotifications = new TelegramNotificationService();
