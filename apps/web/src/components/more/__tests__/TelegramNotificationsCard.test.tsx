// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TelegramNotificationsCard } from '../TelegramNotificationsCard';
import { api } from '../../../services/api';
import '../../../i18n';

describe('TelegramNotificationsCard Component (Task 5.0 & Rule REQ-011)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial state and fetches preferences from api', async () => {
    vi.spyOn(api, 'getNotificationPreferences').mockResolvedValueOnce({
      notify_task_completed: true,
      notify_task_failed: false,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    });

    render(<TelegramNotificationsCard />);

    expect(screen.getByTestId('telegram-notifications-card')).toBeDefined();

    // Verify toggles render after fetch
    await waitFor(() => {
      const taskDoneToggle = screen.getByRole('switch', { name: /Tugas Selesai|Task Completed/i });
      expect(taskDoneToggle.getAttribute('aria-checked')).toBe('true');

      const taskFailedToggle = screen.getByRole('switch', { name: /Tugas Gagal|Task Failed/i });
      expect(taskFailedToggle.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('updates notification preference when a toggle is clicked', async () => {
    vi.spyOn(api, 'getNotificationPreferences').mockResolvedValueOnce({
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    });

    const updateSpy = vi.spyOn(api, 'updateNotificationPreferences').mockResolvedValueOnce({
      notify_task_completed: false,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    });

    render(<TelegramNotificationsCard />);

    const toggleBtn = await screen.findByRole('switch', { name: /Tugas Selesai|Task Completed/i });
    expect(toggleBtn.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggleBtn);

    expect(updateSpy).toHaveBeenCalledWith({ notify_task_completed: false });

    await waitFor(() => {
      expect(toggleBtn.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('rolls back toggle state and shows error message on API update failure', async () => {
    vi.spyOn(api, 'getNotificationPreferences').mockResolvedValueOnce({
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    });

    vi.spyOn(api, 'updateNotificationPreferences').mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<TelegramNotificationsCard />);

    const toggleBtn = await screen.findByRole('switch', { name: /Tugas Selesai|Task Completed/i });
    expect(toggleBtn.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggleBtn);

    await waitFor(() => {
      // Rolled back to true
      expect(toggleBtn.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByText(/Gagal menyimpan pengaturan notifikasi|Failed to save notification settings/i)).toBeDefined();
    });
  });

  it('sends test notification when test button is clicked and displays feedback', async () => {
    vi.spyOn(api, 'getNotificationPreferences').mockResolvedValueOnce({
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    });

    const testSpy = vi.spyOn(api, 'sendTestNotification').mockResolvedValueOnce({
      ok: true,
      sent_count: 1,
      target_chat_ids: [123456789],
      message: 'Notifikasi uji berhasil dikirim ke seluruh Owner Telegram',
      timestamp: Date.now(),
    });

    render(<TelegramNotificationsCard />);

    const testBtn = screen.getByRole('button', { name: /Kirim Notifikasi Uji|Send Test Notification/i });
    fireEvent.click(testBtn);

    expect(testSpy).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByTestId('test-notification-feedback')).toBeDefined();
      expect(screen.getByText(/1 Owner ID/i)).toBeDefined();
    });
  });

  it('displays error feedback when test notification fails', async () => {
    vi.spyOn(api, 'getNotificationPreferences').mockResolvedValueOnce({
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    });

    vi.spyOn(api, 'sendTestNotification').mockResolvedValueOnce({
      ok: false,
      sent_count: 0,
      target_chat_ids: [],
      message: 'Telegram API returned 401 Unauthorized',
      timestamp: Date.now(),
    });

    render(<TelegramNotificationsCard />);

    const testBtn = screen.getByRole('button', { name: /Kirim Notifikasi Uji|Send Test Notification/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/Telegram API returned 401 Unauthorized/i)).toBeDefined();
    });
  });
});
