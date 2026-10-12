/**
 * Development Mock Telegram WebApp (Rule REQ-069)
 * Injected only in dev (import.meta.env.DEV) when running outside the Telegram client.
 */

import type { TelegramWebApp } from './services/tma';

export function setupDevTmaMock(): void {
  if (typeof window === 'undefined') return;

  // Only inject if window.Telegram is missing and we're in dev mode
  if (import.meta.env.DEV && !window.Telegram?.WebApp) {
    const mockUser = {
      id: 123456789,
      first_name: 'CEO',
      username: 'ceo_hermes',
      language_code: 'id',
      is_premium: true,
    };

    const mockInitData = new URLSearchParams({
      query_id: 'AAHdF6IQAAAAAN0XohD-dev',
      user: JSON.stringify(mockUser),
      auth_date: Math.floor(Date.now() / 1000).toString(),
      hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    }).toString();

    const mockWebApp: TelegramWebApp = {
      initData: mockInitData,
      initDataUnsafe: {
        query_id: 'AAHdF6IQAAAAAN0XohD-dev',
        user: mockUser,
        auth_date: Math.floor(Date.now() / 1000),
        hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
      version: '8.0',
      platform: 'tdesktop',
      colorScheme: 'dark',
      themeParams: {
        bg_color: '#EEF2F7',
        text_color: '#1F2937',
        hint_color: '#64748B',
        link_color: '#F59E0B',
        button_color: '#F59E0B',
        button_text_color: '#EEF2F7',
        secondary_bg_color: '#E4EBF4',
      },
      isExpanded: true,
      viewportHeight: 740,
      viewportStableHeight: 740,
      headerColor: '#EEF2F7',
      backgroundColor: '#EEF2F7',
      BackButton: {
        isVisible: false,
        show: () => {},
        hide: () => {},
        onClick: () => {},
        offClick: () => {},
      },
      MainButton: {
        text: 'CONTINUE',
        color: '#F59E0B',
        textColor: '#EEF2F7',
        isVisible: false,
        isActive: true,
        isProgressVisible: false,
        setText: () => {},
        onClick: () => {},
        offClick: () => {},
        show: () => {},
        hide: () => {},
        enable: () => {},
        disable: () => {},
        showProgress: () => {},
        hideProgress: () => {},
      },
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {},
        selectionChanged: () => {},
      },
      ready: () => {},
      expand: () => {},
      close: () => {},
      enableClosingConfirmation: () => {},
      disableVerticalSwipes: () => {},
      requestFullscreen: () => {},
      isVersionAtLeast: () => true,
      setHeaderColor: () => {},
      setBackgroundColor: () => {},
      onEvent: () => {},
      offEvent: () => {},
    };

    window.Telegram = { WebApp: mockWebApp };
  }
}
