/**
 * Telegram Notifications Settings Card (Task 5.0, Rule REQ-011, REQ-085 & REQ-093)
 * Full End-to-End integration for dynamic Telegram notification preferences and test sending.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Send,
  Loader2,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';
import type { NotificationPreferences, TestNotificationResult } from '@hermes-office/shared';
import { api } from '../../services/api';
import { tma } from '../../services/tma';

interface ToggleItemProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

const NotificationToggleItem: React.FC<ToggleItemProps> = ({
  id,
  icon,
  title,
  description,
  checked,
  disabled = false,
  onChange,
}) => {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-office-elevated/70 border border-office-border/60 hover:border-office-accent/40 transition-colors gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="p-1.5 rounded-md bg-office-hover text-office-accent-ink shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="flex flex-col min-w-0">
          <label htmlFor={id} className="text-xs font-semibold text-office-text cursor-pointer truncate">
            {title}
          </label>
          <span className="text-[10px] text-office-muted leading-tight mt-0.5">{description}</span>
        </div>
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none min-h-[44px] min-w-[44px] items-center px-0.5 ${
          checked ? 'bg-office-accent' : 'bg-office-border/70'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="sr-only">{title}</span>
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        >
          {checked ? (
            <Check className="w-3 h-3 text-office-accent" />
          ) : (
            <X className="w-3 h-3 text-office-muted" />
          )}
        </span>
      </button>
    </div>
  );
};

export const TelegramNotificationsCard: React.FC = () => {
  const { t } = useTranslation();

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    notify_task_completed: true,
    notify_task_failed: true,
    notify_approval_pending: true,
    daily_briefing_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestNotificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPrefs = async () => {
      try {
        const data = await api.getNotificationPreferences();
        if (isMounted) {
          setPreferences(data);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          // Fallback to default schema values on network error
          setLoading(false);
        }
      }
    };

    void fetchPrefs();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    tma.hapticSelection();
    setSavingKey(key);
    setErrorMsg(null);

    // Optimistic update
    const previous = { ...preferences };
    setPreferences((prev) => ({ ...prev, [key]: value }));

    try {
      const updated = await api.updateNotificationPreferences({ [key]: value });
      setPreferences(updated);
    } catch {
      // Rollback on failure
      setPreferences(previous);
      setErrorMsg(t('notifications.saveFailed'));
      tma.hapticNotification('error');
    } finally {
      setSavingKey(null);
    }
  };

  const handleTestNotification = async () => {
    tma.hapticImpact('medium');
    setTesting(true);
    setTestResult(null);
    setErrorMsg(null);

    try {
      const result = await api.sendTestNotification();
      if (result.ok) {
        setTestResult(result);
        tma.hapticNotification('success');
      } else {
        tma.hapticNotification('error');
        setErrorMsg(result.message || t('notifications.testFailed'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('notifications.testFailed');
      setErrorMsg(msg);
      tma.hapticNotification('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      data-testid="telegram-notifications-card"
      className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-3 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-office-accent/15 text-office-accent-ink">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-office-text">{t('notifications.title')}</span>
            <span className="text-[10px] text-office-muted">{t('notifications.subtitle')}</span>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-office-success/20 text-office-success border border-office-success/30 font-medium">
          <CheckCircle2 className="w-3 h-3" />
          Active
        </span>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div className="p-2 rounded-lg bg-office-danger/15 border border-office-danger/30 text-office-danger text-[11px] flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Toggle Controls List */}
      <div className="flex flex-col gap-2">
        <NotificationToggleItem
          id="toggle-task-completed"
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          title={t('notifications.taskCompleted')}
          description={t('notifications.taskCompletedDesc')}
          checked={preferences.notify_task_completed}
          disabled={loading || savingKey === 'notify_task_completed'}
          onChange={(val) => handleToggle('notify_task_completed', val)}
        />

        <NotificationToggleItem
          id="toggle-task-failed"
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          title={t('notifications.taskFailed')}
          description={t('notifications.taskFailedDesc')}
          checked={preferences.notify_task_failed}
          disabled={loading || savingKey === 'notify_task_failed'}
          onChange={(val) => handleToggle('notify_task_failed', val)}
        />

        <NotificationToggleItem
          id="toggle-approval-pending"
          icon={<Clock className="w-3.5 h-3.5" />}
          title={t('notifications.approvalPending')}
          description={t('notifications.approvalPendingDesc')}
          checked={preferences.notify_approval_pending}
          disabled={loading || savingKey === 'notify_approval_pending'}
          onChange={(val) => handleToggle('notify_approval_pending', val)}
        />

        <NotificationToggleItem
          id="toggle-daily-briefing"
          icon={<Calendar className="w-3.5 h-3.5" />}
          title={t('notifications.dailyBriefing')}
          description={t('notifications.dailyBriefingDesc')}
          checked={preferences.daily_briefing_enabled}
          disabled={loading || savingKey === 'daily_briefing_enabled'}
          onChange={(val) => handleToggle('daily_briefing_enabled', val)}
        />
      </div>

      {/* Action / Send Test Button */}
      <button
        onClick={handleTestNotification}
        disabled={testing}
        type="button"
        aria-label={t('notifications.testBtn')}
        className={`w-full py-2.5 px-3 rounded-lg border border-office-border flex items-center justify-between text-xs font-semibold text-office-text min-h-[44px] transition-all active:scale-[0.98] ${
          testing
            ? 'bg-office-hover/50 opacity-70 cursor-wait'
            : 'bg-office-hover hover:bg-office-hover/80 hover:border-office-accent/50'
        }`}
      >
        <div className="flex items-center gap-2">
          {testing ? (
            <Loader2 className="w-4 h-4 text-office-accent-ink animate-spin" />
          ) : (
            <Send className="w-4 h-4 text-office-accent-ink" />
          )}
          <span>{testing ? t('notifications.sending') : t('notifications.testBtn')}</span>
        </div>
        <span className="text-[10px] font-mono text-office-accent-ink font-semibold">
          {testing ? '...' : 'POST /test'}
        </span>
      </button>

      {/* Test Result Feedback Box */}
      {testResult && (
        <div
          data-testid="test-notification-feedback"
          className="p-2.5 rounded-lg bg-office-elevated border border-office-success/30 flex flex-col gap-1.5 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-office-success flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              {t('notifications.testSuccess')}
            </span>
            <span className="text-[9px] font-mono text-office-muted">
              {testResult.sent_count} Owner ID(s)
            </span>
          </div>
          <span className="text-[10px] text-office-muted">{testResult.message}</span>
        </div>
      )}

      {/* REQ-011 Boundary Notice */}
      <div className="flex items-center gap-1.5 text-[10px] text-office-muted pt-1 border-t border-office-border/40">
        <ShieldCheck className="w-3.5 h-3.5 text-office-success shrink-0" />
        <span>{t('notifications.req011Notice')}</span>
      </div>
    </div>
  );
};
