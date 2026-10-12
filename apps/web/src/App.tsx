/**
 * Main Application Shell (Phase 3 Web Shell)
 * Handles TMA initialization, SSE streaming, navigation, and theme.
 */

import React, { useEffect, useState } from 'react';
import { BottomNav, type NavTab } from './components/layout/BottomNav';
import { OfficeScreen } from './screens/Office';
import { TasksScreen } from './screens/Tasks';
import { InboxScreen } from './screens/Inbox';
import { ReportsScreen } from './screens/Reports';
import { MoreScreen } from './screens/More';
import { RecruitmentWizard } from './components/recruitment/RecruitmentWizard';
import { OfflineBanner } from './components/states/OfflineBanner';
import { useOfficeStore } from './stores/office';
import { tma } from './services/tma';
import { initThemeListener } from './theme';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('office');
  const [isRecruitmentOpen, setIsRecruitmentOpen] = useState(false);
  const { fetchInitialData, initStream, streamStatus } = useOfficeStore();

  useEffect(() => {
    // 1. Initialize Telegram WebApp
    tma.init();

    // 2. Initialize Theme listeners
    initThemeListener();

    // 3. Fetch initial data and subscribe to SSE /api/stream
    fetchInitialData();
    const cleanupStream = initStream();

    return () => {
      cleanupStream();
    };
  }, [fetchInitialData, initStream]);

  // Hash routing support for deep-linking and browser navigation
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, '') as NavTab;
      if (['office', 'tasks', 'inbox', 'reports', 'more'].includes(hash)) {
        setCurrentTab(hash);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleTabChange = (tab: NavTab) => {
    window.location.hash = tab;
    setCurrentTab(tab);
  };

  // BackButton handling: if on a secondary tab, BackButton returns to office tab
  useEffect(() => {
    if (currentTab !== 'office') {
      tma.showBackButton(() => {
        handleTabChange('office');
      });
    } else {
      tma.hideBackButton();
    }
  }, [currentTab]);

  return (
    <div className="w-full min-h-screen bg-office-bg text-office-text flex flex-col font-sans relative antialiased selection:bg-office-cyan selection:text-office-bg">
      {/* Offline Banner when disconnected from live SSE */}
      {(streamStatus === 'error' || streamStatus === 'disconnected') && (
        <OfflineBanner onReconnect={() => initStream()} />
      )}

      {/* Screen View */}
      <div className="flex-1 w-full">
        {currentTab === 'office' && (
          <OfficeScreen
            onOpenRecruitment={() => setIsRecruitmentOpen(true)}
            onOpenInbox={() => handleTabChange('inbox')}
          />
        )}
        {currentTab === 'tasks' && <TasksScreen />}
        {currentTab === 'inbox' && <InboxScreen />}
        {currentTab === 'reports' && <ReportsScreen />}
        {currentTab === 'more' && (
          <MoreScreen onOpenRecruitment={() => setIsRecruitmentOpen(true)} />
        )}
      </div>

      {/* Persistent Bottom Nav */}
      <BottomNav currentTab={currentTab} onTabChange={handleTabChange} />

      {/* Recruitment Room Modal */}
      <RecruitmentWizard
        isOpen={isRecruitmentOpen}
        onClose={() => setIsRecruitmentOpen(false)}
      />
    </div>
  );
};
