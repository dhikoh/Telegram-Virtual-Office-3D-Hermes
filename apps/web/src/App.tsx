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
import { useOfficeStore } from './stores/office';
import { tma } from './services/tma';
import { initThemeListener } from './theme';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('office');
  const { fetchInitialData, initStream } = useOfficeStore();

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

  // BackButton handling: if on a secondary tab, BackButton returns to office tab
  useEffect(() => {
    if (currentTab !== 'office') {
      tma.showBackButton(() => {
        setCurrentTab('office');
      });
    } else {
      tma.hideBackButton();
    }
  }, [currentTab]);

  return (
    <div className="w-full min-h-screen bg-office-bg text-office-text flex flex-col font-sans relative antialiased selection:bg-office-cyan selection:text-office-bg">
      {/* Screen View */}
      <div className="flex-1 w-full">
        {currentTab === 'office' && (
          <OfficeScreen
            onOpenRecruitment={() => setCurrentTab('more')}
            onOpenInbox={() => setCurrentTab('inbox')}
          />
        )}
        {currentTab === 'tasks' && <TasksScreen />}
        {currentTab === 'inbox' && <InboxScreen />}
        {currentTab === 'reports' && <ReportsScreen />}
        {currentTab === 'more' && <MoreScreen onOpenRecruitment={() => setCurrentTab('more')} />}
      </div>

      {/* Persistent Bottom Nav */}
      <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} />
    </div>
  );
};
