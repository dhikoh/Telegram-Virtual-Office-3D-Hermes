/**
 * Telegram WebApp Integration Service (Rule REQ-068 & Section 8)
 * Always feature-detected and wrapped in try/catch.
 */

// Official Telegram WebApp window type declaration
declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
    };
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive: boolean) => void;
    hideProgress: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  enableClosingConfirmation: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  isVersionAtLeast: (version: string) => boolean;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  onEvent: (eventType: string, eventHandler: () => void) => void;
  offEvent: (eventType: string, eventHandler: () => void) => void;
}

class TmaService {
  private get webApp(): TelegramWebApp | undefined {
    return typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  }

  public isAvailable(): boolean {
    return !!this.webApp;
  }

  public init(): void {
    try {
      if (this.webApp) {
        this.webApp.ready();
        this.webApp.expand();

        // Disable vertical swipes if supported (Section 8)
        if (typeof this.webApp.disableVerticalSwipes === 'function') {
          this.webApp.disableVerticalSwipes();
        }

        // Apply dark theme header and background
        if (typeof this.webApp.setHeaderColor === 'function') {
          this.webApp.setHeaderColor('#070B14');
        }
        if (typeof this.webApp.setBackgroundColor === 'function') {
          this.webApp.setBackgroundColor('#070B14');
        }
      }
    } catch {
      // Safe fallback on feature detection failure
    }
  }

  public getInitData(): string {
    try {
      return this.webApp?.initData || '';
    } catch {
      return '';
    }
  }

  public getUser() {
    try {
      return this.webApp?.initDataUnsafe?.user;
    } catch {
      return undefined;
    }
  }

  public getColorScheme(): 'light' | 'dark' {
    try {
      return this.webApp?.colorScheme || 'dark';
    } catch {
      return 'dark';
    }
  }

  public getThemeParams() {
    try {
      return this.webApp?.themeParams || {};
    } catch {
      return {};
    }
  }

  // BackButton handlers
  public showBackButton(onClick: () => void): void {
    try {
      if (this.webApp?.BackButton) {
        this.webApp.BackButton.show();
        this.webApp.BackButton.onClick(onClick);
      }
    } catch {
      // Ignore
    }
  }

  public hideBackButton(onClick?: () => void): void {
    try {
      if (this.webApp?.BackButton) {
        this.webApp.BackButton.hide();
        if (onClick) {
          this.webApp.BackButton.offClick(onClick);
        }
      }
    } catch {
      // Ignore
    }
  }

  // Haptic feedback
  public hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium'): void {
    try {
      if (this.webApp?.HapticFeedback) {
        this.webApp.HapticFeedback.impactOccurred(style);
      }
    } catch {
      // Ignore
    }
  }

  public hapticNotification(type: 'error' | 'success' | 'warning'): void {
    try {
      if (this.webApp?.HapticFeedback) {
        this.webApp.HapticFeedback.notificationOccurred(type);
      }
    } catch {
      // Ignore
    }
  }

  public hapticSelection(): void {
    try {
      if (this.webApp?.HapticFeedback) {
        this.webApp.HapticFeedback.selectionChanged();
      }
    } catch {
      // Ignore
    }
  }

  // Fullscreen (Section 8: only if isVersionAtLeast('8.0'))
  public requestFullscreen(): void {
    try {
      if (
        this.webApp &&
        typeof this.webApp.requestFullscreen === 'function' &&
        typeof this.webApp.isVersionAtLeast === 'function' &&
        this.webApp.isVersionAtLeast('8.0')
      ) {
        this.webApp.requestFullscreen();
      }
    } catch {
      // Ignore
    }
  }
}

export const tma = new TmaService();
