/**
 * Low-Power Mode Store (Rule REQ-067 & Section 8)
 * Auto-detects weak hardware or reduced motion, allows manual toggle,
 * and adds/removes .low-power class to document root.
 */

import { create } from 'zustand';

interface PowerState {
  isLowPower: boolean;
  autoDetected: boolean;
  toggleLowPower: () => void;
  setLowPower: (enabled: boolean) => void;
}

function detectLowPower(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Check user preference override in localStorage
  const stored = localStorage.getItem('hermes_low_power');
  if (stored !== null) {
    return stored === 'true';
  }

  // 2. Reduced motion system setting
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return true;
  }

  // 3. Hardware concurrency <= 4
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
    return true;
  }

  // 4. Device memory <= 4 GB (where supported by browser)
  const navWithMemory = navigator as unknown as { deviceMemory?: number };
  if (navWithMemory?.deviceMemory && navWithMemory.deviceMemory <= 4) {
    return true;
  }

  return false;
}

function updateDomClass(isLowPower: boolean): void {
  if (typeof document === 'undefined') return;
  if (isLowPower) {
    document.documentElement.classList.add('low-power');
  } else {
    document.documentElement.classList.remove('low-power');
  }
}

const initialLowPower = detectLowPower();
updateDomClass(initialLowPower);

export const usePowerStore = create<PowerState>((set) => ({
  isLowPower: initialLowPower,
  autoDetected: typeof localStorage !== 'undefined' ? localStorage.getItem('hermes_low_power') === null : true,
  toggleLowPower: () =>
    set((state) => {
      const next = !state.isLowPower;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('hermes_low_power', String(next));
      }
      updateDomClass(next);
      return { isLowPower: next, autoDetected: false };
    }),
  setLowPower: (enabled: boolean) =>
    set(() => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('hermes_low_power', String(enabled));
      }
      updateDomClass(enabled);
      return { isLowPower: enabled, autoDetected: false };
    }),
}));
