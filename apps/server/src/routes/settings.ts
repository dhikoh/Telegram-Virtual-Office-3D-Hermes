import type { FastifyPluginAsync } from 'fastify';
import {
  NotificationPreferencesPatchSchema,
  NotificationPreferencesSchema,
  type NotificationPreferences,
} from '@hermes-office/shared';
import { SettingRepository } from '../db/repositories/settings.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { telegramNotifications } from '../services/notifications.js';

export function readNotificationPreferences(settingRepo: SettingRepository): NotificationPreferences {
  const raw = settingRepo.get('notification_preferences');
  if (!raw) {
    return {
      notify_task_completed: true,
      notify_task_failed: true,
      notify_approval_pending: true,
      daily_briefing_enabled: true,
    };
  }
  try {
    const parsed = JSON.parse(raw);
    const result = NotificationPreferencesSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch {
    // fallback on invalid json
  }
  return {
    notify_task_completed: true,
    notify_task_failed: true,
    notify_approval_pending: true,
    daily_briefing_enabled: true,
  };
}

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const { db } = fastify;
  const settingRepo = new SettingRepository(db);
  const auditRepo = new AuditRepository(db);

  // GET /api/settings/notifications
  fastify.get('/api/settings/notifications', async () => {
    return readNotificationPreferences(settingRepo);
  });

  // PATCH /api/settings/notifications
  fastify.patch('/api/settings/notifications', async (request, reply) => {
    const parseResult = NotificationPreferencesPatchSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'invalid_input',
        details: parseResult.error.format(),
      });
    }

    const current = readNotificationPreferences(settingRepo);
    const updated: NotificationPreferences = {
      ...current,
      ...parseResult.data,
    };

    settingRepo.set('notification_preferences', JSON.stringify(updated));

    if (request.user?.id) {
      auditRepo.logAction(
        request.user.id,
        'settings.notifications_update',
        'notification_preferences',
        JSON.stringify(parseResult.data)
      );
    }

    return updated;
  });

  // POST /api/settings/notifications/test
  fastify.post('/api/settings/notifications/test', async () => {
    const result = await telegramNotifications.sendTestNotification();
    return result;
  });
};
