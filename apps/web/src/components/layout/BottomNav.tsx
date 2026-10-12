/**
 * Bottom Navigation (Rule R10 & Section 8)
 * 5 Tabs: Office, Tasks, Inbox, Reports, More.
 * Mobile-first touch targets >= 44px.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, CheckSquare, Inbox, BarChart3, MoreHorizontal } from 'lucide-react';
import { tma } from '../../services/tma';
import { useOfficeStore } from '../../stores/office';

export type NavTab = 'office' | 'tasks' | 'inbox' | 'reports' | 'more';

interface BottomNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onTabChange }) => {
  const { t } = useTranslation();
  const { approvals } = useOfficeStore();

  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length;

  const handleTabClick = (tab: NavTab) => {
    tma.hapticSelection();
    onTabChange(tab);
  };

  const tabs: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'office', label: t('nav.office'), icon: LayoutDashboard },
    { id: 'tasks', label: t('nav.tasks'), icon: CheckSquare },
    {
      id: 'inbox',
      label: t('nav.inbox'),
      icon: Inbox,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
    },
    { id: 'reports', label: t('nav.reports'), icon: BarChart3 },
    { id: 'more', label: t('nav.more'), icon: MoreHorizontal },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-office-surface/95 backdrop-blur-lg border-t border-office-border px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              type="button"
              className={`flex-1 flex flex-col items-center justify-center min-h-[48px] min-w-[48px] py-1 rounded-lg transition-all relative ${
                isActive
                  ? 'text-office-accent-ink font-medium'
                  : 'text-office-muted hover:text-office-text active:scale-95'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]' : ''
                  }`}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-office-warn text-office-on-accent font-mono text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center shadow-nu-raised animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight leading-none">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-6 h-0.5 bg-office-accent rounded-full shadow-nu-flat" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
