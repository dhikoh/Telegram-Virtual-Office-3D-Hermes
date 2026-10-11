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
        bg_color: '#070B14',
        text_color: '#F8FAFC',
        hint_color: '#94A3B8',
        link_color: '#22D3EE',
        button_color: '#22D3EE',
        button_text_color: '#070B14',
        secondary_bg_color: '#0F172A',
      },
      isExpanded: true,
      viewportHeight: 740,
      viewportStableHeight: 740,
      headerColor: '#070B14',
      backgroundColor: '#070B14',
      BackButton: {
        isVisible: false,
        show: () => {},
        hide: () => {},
        onClick: () => {},
        offClick: () => {},
      },
      MainButton: {
        text: 'CONTINUE',
        color: '#22D3EE',
        textColor: '#070B14',
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
