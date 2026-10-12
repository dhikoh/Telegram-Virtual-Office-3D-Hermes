/**
 * Office View Mode Store (2D vs 3D) - Rule 9.3 & REQ-108.
 * Controls the active rendering mode, persists user preference,
 * and handles automatic fallback on low-power mode or WebGL context loss.
 */

import { create } from 'zustand';

export type ViewMode = '2D' | '3D';

interface ViewModeState {
  viewMode: ViewMode;
  webGLSupported: boolean;
  webGLError: string | null;
  setViewMode: (mode: ViewMode) => void;
  setWebGLError: (error: string | null) => void;
  retryWebGL: () => void;
}

function detectWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function getInitialViewMode(): ViewMode {
  if (typeof localStorage === 'undefined') return '2D';
  const saved = localStorage.getItem('hermes_view_mode');
  if (saved === '3D') {
    // Only return 3D if WebGL is supported
    return detectWebGL() ? '3D' : '2D';
  }
  return '2D';
}

export const useViewModeStore = create<ViewModeState>((set) => ({
  viewMode: getInitialViewMode(),
  webGLSupported: detectWebGL(),
  webGLError: null,

  setViewMode: (mode) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hermes_view_mode', mode);
    }
    set({ viewMode: mode });
  },

  setWebGLError: (error) => {
    set({ webGLError: error, viewMode: '2D' });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hermes_view_mode', '2D');
    }
  },

  // Rule REQ-117 recovery: after a WebGL failure the user must be able to try 3D
  // again without reloading the whole mini app. No-op when WebGL is genuinely
  // unsupported, so we never bounce back into a known-dead loop.
  retryWebGL: () => {
    set((state) => {
      if (!state.webGLSupported) return state;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('hermes_view_mode', '3D');
      }
      return { viewMode: '3D', webGLError: null };
    });
  },
}));
