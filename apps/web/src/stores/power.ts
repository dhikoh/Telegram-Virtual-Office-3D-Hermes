/**
 * Low-Power Mode Store (Rule REQ-067 & Section 8)
 * Auto-detects weak hardware or reduced motion, allows manual toggle,
 * and adds/removes .low-power class to document root.
 *
 * Tahap 6: ECO stops being a blind boolean and becomes one of three graphics
 * presets (penuh / rendah / otomatis, DESIGN_DIRECTION 5). The manual presets
 * are stored verbatim; "otomatis" runs the frame-rate probe from lib/fps.ts
 * and applies resolveLowPower() from the shared policy module, with hysteresis
 * so it cannot flip on every sample. Below the preset nothing changed: the
 * .low-power class, and the rule that ECO really disables the 3D view
 * (Rule 9.3) still hold.
 */

import { create } from 'zustand';
import {
  isGraphicsPreset,
  presetLowPower,
  resolveLowPower,
  type GraphicsPreset,
} from '@hermes-office/shared';
import { useViewModeStore } from './view-mode';
import { startFpsProbe, type FpsProbe } from '../lib/fps';

const PRESET_KEY = 'hermes_graphics_preset';
/** Pre-Tahap-6 switch: read once for migration, then cleared. */
const LEGACY_KEY = 'hermes_low_power';

interface PowerState {
  isLowPower: boolean;
  autoDetected: boolean;
  preset: GraphicsPreset;
  /** Last fps the probe reported (settings UI); null until the first sample. */
  lastFps: number | null;
  toggleLowPower: () => void;
  setLowPower: (enabled: boolean) => void;
  setPreset: (preset: GraphicsPreset) => void;
}

/** Hardware heuristics only - the manual override is handled by the preset. */
function detectHeuristicLowPower(): boolean {
  if (typeof window === 'undefined') return false;

  // Reduced motion system setting
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return true;
  }

  // Hardware concurrency <= 4
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
    return true;
  }

  // Device memory <= 4 GB (where supported by browser)
  const navWithMemory = navigator as unknown as { deviceMemory?: number };
  if (navWithMemory?.deviceMemory && navWithMemory.deviceMemory <= 4) {
    return true;
  }

  return false;
}

function initialPreset(): GraphicsPreset {
  if (typeof localStorage === 'undefined') return 'otomatis';
  const stored = localStorage.getItem(PRESET_KEY);
  if (isGraphicsPreset(stored)) return stored;
  // Migrate the old ECO switch: an explicit choice stays an explicit choice.
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy !== null) return legacy === 'true' ? 'rendah' : 'penuh';
  return 'otomatis';
}

function updateDomClass(isLowPower: boolean): void {
  if (typeof document === 'undefined') return;
  if (isLowPower) {
    document.documentElement.classList.add('low-power');
  } else {
    document.documentElement.classList.remove('low-power');
  }
}

/**
 * ECO must actually disable 3D, not merely grey out the button (Rule 9.3).
 * Turning ECO on while the 3D view is active forces the 2D fallback;
 * turning ECO off leaves 2D alone so nothing flips under the user.
 */
function enforceViewModeForPower(isLowPower: boolean): void {
  if (!isLowPower) return;
  const view = useViewModeStore.getState();
  if (view.viewMode === '3D') {
    view.setViewMode('2D');
  }
}

const initialPresetValue = initialPreset();
const initialLowPower =
  initialPresetValue === 'penuh'
    ? false
    : initialPresetValue === 'rendah'
      ? true
      : detectHeuristicLowPower();

updateDomClass(initialLowPower);
enforceViewModeForPower(initialLowPower);

let probe: FpsProbe | null = null;

function stopProbe(): void {
  probe?.stop();
  probe = null;
}

export const usePowerStore = create<PowerState>((set, get) => {
  const apply = (lowPower: boolean) => {
    updateDomClass(lowPower);
    enforceViewModeForPower(lowPower);
    set({ isLowPower: lowPower });
  };

  const startProbe = () => {
    stopProbe();
    probe = startFpsProbe((fps) => {
      const state = usePowerStore.getState();
      // The user may have switched presets while a sample was in flight.
      if (state.preset !== 'otomatis') return;
      const next = resolveLowPower(fps, state.isLowPower);
      if (next !== state.isLowPower) apply(next);
      set({ lastFps: Math.round(fps) });
    });
  };

  return {
    isLowPower: initialLowPower,
    autoDetected: initialPresetValue === 'otomatis',
    preset: initialPresetValue,
    lastFps: null,

    // Legacy API kept: both now resolve to an explicit preset, so the UI and
    // the probe can never disagree about what the user chose.
    toggleLowPower: () => get().setPreset(get().isLowPower ? 'penuh' : 'rendah'),
    setLowPower: (enabled) => get().setPreset(enabled ? 'rendah' : 'penuh'),

    setPreset: (preset) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PRESET_KEY, preset);
        localStorage.removeItem(LEGACY_KEY);
      }
      if (preset === 'otomatis') {
        startProbe();
      } else {
        stopProbe();
        apply(presetLowPower(preset, get().isLowPower));
      }
      set({ preset, autoDetected: preset === 'otomatis' });
    },
  };
});

// Boot the probe when "otomatis" is what the user is running.
if (initialPresetValue === 'otomatis') {
  usePowerStore.getState().setPreset('otomatis');
}

