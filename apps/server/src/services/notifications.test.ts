import { describe, it, expect, beforeEach } from 'vitest';
import { TelegramNotificationService, escapeTelegramMarkdown } from './notifications.js';

describe('TelegramNotificationService (REQ-085 & REQ-011)', () => {
  let service: TelegramNotificationService;

  beforeEach(() => {
    service = new TelegramNotificationService('mock_token', [12345, 67890], 'https://office.example.com');
  });

  it('escapes Telegram Markdown v1 special characters correctly', () => {
    expect(escapeTelegramMarkdown('Hello_World*Test`Code[Link')).toBe('Hello\\_World\\*Test\\`Code\\[Link');
    expect(escapeTelegramMarkdown('Normal text')).toBe('Normal text');
  });

  it('notifies on completed task with department, agent, output summary, and inline button', async () => {
    const success = await service.notifyTaskCompleted(
      {
        id: 'task_comp_101',
        title: 'Buat Penawaran Klien B2B',
        department: 'sales',
      },
      'Raka Sales',
      'Dokumen penawaran harga dan diskon volume telah dibuat.'
    );

    expect(success).toBe(true);
    const sent = service.getSentNotifications();
    expect(sent.length).toBe(2);

    expect(sent[0].chatId).toBe(12345);
    expect(sent[0].text).toContain('Tugas Selesai');
    expect(sent[0].text).toContain('Raka Sales');
    expect(sent[0].text).toContain('SALES');
    expect(sent[0].text).toContain('Buat Penawaran Klien B2B');
    expect(sent[0].text).toContain('Dokumen penawaran harga');
    expect(sent[0].text).toContain('task_comp_101');
    expect(sent[0].buttonText).toBe('Buka Virtual Office');
    expect(sent[0].webAppUrl).toBe('https://office.example.com');
  });

  it('respects notification preferences when notify_task_completed is false', async () => {
    service.setPreferencesProvider(() => ({
      notify_task_completed: false,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    }));

    const result = await service.notifyTaskCompleted(
      { id: 'task_muted', title: 'Muted Task' },
      'Raka Sales'
    );

    expect(result).toBe(false);
    expect(service.getSentNotifications()).toHaveLength(0);
  });

  it('notifies on pending approval with correct format and inline webapp button', async () => {
    await service.notifyApprovalPending(
      {
        id: 'appr_test_1',
        run_id: 'run_test_1',
        summary: 'Kirim email promosi ke 500 pelanggan',
      },
      'Nova Social'
    );

    const sent = service.getSentNotifications();
    expect(sent.length).toBe(2); // Sent to both owners

    expect(sent[0].chatId).toBe(12345);
    expect(sent[0].text).toContain('Persetujuan Diperlukan');
    expect(sent[0].text).toContain('Nova Social');
    expect(sent[0].text).toContain('Kirim email promosi');
    expect(sent[0].text).toContain('appr_test_1');
    expect(sent[0].buttonText).toBe('Tinjau Persetujuan');
    expect(sent[0].webAppUrl).toBe('https://office.example.com');

    expect(sent[1].chatId).toBe(67890);
  });

  it('respects notification preferences when notify_approval_pending is false', async () => {
    service.setPreferencesProvider(() => ({
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: false,
      daily_briefing_enabled: true,
    }));

    const result = await service.notifyApprovalPending(
      { id: 'appr_muted', run_id: 'run_m', summary: 'Muted Approval' },
      'Agent Nova'
    );

    expect(result).toBe(false);
    expect(service.getSentNotifications()).toHaveLength(0);
  });

  it('notifies on task run failure with error snippet', async () => {
    await service.notifyRunFailed(
      {
        id: 'task_err_1',
        title: 'Generate Weekly Financial Balance',
      },
      'Fin Vault',
      'Hermes API timeout connecting to database pool'
    );

    const sent = service.getSentNotifications();
    expect(sent.length).toBe(2);

    expect(sent[0].text).toContain('Eksekusi Tugas Gagal');
    expect(sent[0].text).toContain('Fin Vault');
    expect(sent[0].text).toContain('Generate Weekly Financial Balance');
    expect(sent[0].text).toContain('Hermes API timeout');
    expect(sent[0].buttonText).toBe('Periksa Error');
  });

  it('respects notification preferences when notify_task_failed is false', async () => {
    service.setPreferencesProvider(() => ({
      notify_task_completed: true,
      notify_task_failed: false,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    }));

    const result = await service.notifyRunFailed(
      { id: 'task_err_muted', title: 'Muted Error' },
      'Fin Vault',
      'Some error'
    );

    expect(result).toBe(false);
    expect(service.getSentNotifications()).toHaveLength(0);
  });

  it('sends executive daily briefing with calculated metrics and department breakdown', async () => {
    const success = await service.sendDailyBriefing({
      date: 'Selasa, 27 Oktober 2026',
      tasksCompleted: 14,
      successRate: 93,
      pendingApprovals: 2,
      departmentBreakdown: {
        sales: 5,
        marketing: 4,
        operations: 5,
      },
    });

    expect(success).toBe(true);
    const sent = service.getSentNotifications();
    expect(sent).toHaveLength(2);

    expect(sent[0].text).toContain('Executive Daily Briefing');
    expect(sent[0].text).toContain('Selasa, 27 Oktober 2026');
    expect(sent[0].text).toContain('Tugas Selesai: *14* tugas');
    expect(sent[0].text).toContain('Tingkat Keberhasilan: *93%*');
    expect(sent[0].text).toContain('Approval Tertunda: *2* perlu tindakan');
    expect(sent[0].text).toContain('SALES: 5 tugas');
    expect(sent[0].text).toContain('MARKETING: 4 tugas');
    expect(sent[0].text).toContain('OPERATIONS: 5 tugas');
    expect(sent[0].buttonText).toBe('Lihat Dashboard Lengkap');
  });

  it('respects notification preferences when daily_briefing_enabled is false', async () => {
    service.setPreferencesProvider(() => ({
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: false,
    }));

    const success = await service.sendDailyBriefing({
      date: 'Selasa, 27 Oktober 2026',
      tasksCompleted: 0,
      successRate: 100,
      pendingApprovals: 0,
      departmentBreakdown: {},
    });

    expect(success).toBe(false);
    expect(service.getSentNotifications()).toHaveLength(0);
  });

  it('sends test notification and returns structured TestNotificationResult', async () => {
    const result = await service.sendTestNotification();

    expect(result.ok).toBe(true);
    expect(result.sent_count).toBe(2);
    expect(result.target_chat_ids).toEqual([12345, 67890]);
    expect(result.message).toContain('berhasil dikirim');

    const sent = service.getSentNotifications();
    expect(sent).toHaveLength(2);
    expect(sent[0].text).toContain('Uji Notifikasi Telegram');
  });

  it('handles empty ownerIds gracefully in sendTestNotification', async () => {
    const emptyService = new TelegramNotificationService('mock_token', [], 'https://office.example.com');
    const result = await emptyService.sendTestNotification();

    expect(result.ok).toBe(false);
    expect(result.sent_count).toBe(0);
    expect(result.target_chat_ids).toEqual([]);
    expect(result.message).toContain('Tidak ada OWNER_TELEGRAM_IDS');
  });

  it('notifies on completed anti-hallucination report', async () => {
    await service.notifyReportReady(
      {
        id: 'rep_sales_42',
        department: 'sales',
        template: 'daily_sales',
        period: 'Q3 2026',
      },
      'Vance Sales'
    );

    const sent = service.getSentNotifications();
    expect(sent.length).toBe(2);

    expect(sent[0].text).toContain('Laporan Kinerja Siap');
    expect(sent[0].text).toContain('SALES');
    expect(sent[0].text).toContain('Vance Sales');
    expect(sent[0].text).toContain('daily\\_sales');
    expect(sent[0].text).toContain('Q3 2026');
    expect(sent[0].text).toContain('rep_sales_42');
    expect(sent[0].buttonText).toBe('Baca Laporan');
  });

  it('clears notification history as expected', async () => {
    await service.sendMessage('Halo Admin');
    expect(service.getSentNotifications().length).toBe(2);
    service.clearSentNotifications();
    expect(service.getSentNotifications().length).toBe(0);
  });
});

