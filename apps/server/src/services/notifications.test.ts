import { describe, it, expect, beforeEach } from 'vitest';
import { TelegramNotificationService } from './notifications.js';

describe('TelegramNotificationService (REQ-085 & REQ-011)', () => {
  let service: TelegramNotificationService;

  beforeEach(() => {
    service = new TelegramNotificationService('mock_token', [12345, 67890], 'https://office.example.com');
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
    expect(sent[0].text).toContain('daily_sales');
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
