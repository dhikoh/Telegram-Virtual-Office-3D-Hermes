/**
 * Theme & Telegram themeParams Manager (Rule REQ-066)
 * Maps Telegram CSS variables and manages dark/light modes.
 */

import { tma } from './services/tma';

export function applyTheme(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const params = tma.getThemeParams();
  const colorScheme = tma.getColorScheme();

  if (colorScheme === 'light') {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }

  if (params.bg_color) {
    root.style.setProperty('--tg-theme-bg-color', params.bg_color);
  }
  if (params.text_color) {
    root.style.setProperty('--tg-theme-text-color', params.text_color);
  }
  if (params.hint_color) {
    root.style.setProperty('--tg-theme-hint-color', params.hint_color);
  }
  if (params.link_color) {
    root.style.setProperty('--tg-theme-link-color', params.link_color);
  }
  if (params.button_color) {
    root.style.setProperty('--tg-theme-button-color', params.button_color);
  }
  if (params.button_text_color) {
    root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
  }
  if (params.secondary_bg_color) {
    root.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
  }
}

export function initThemeListener(): void {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    window.Telegram.WebApp.onEvent('themeChanged', () => {
      applyTheme();
    });
  }
  applyTheme();
}
