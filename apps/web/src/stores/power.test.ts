/**
 * Tests for Low-Power ECO mode (Rule 9.3 & REQ-067).
 * ECO must genuinely disable the 3D view, not just grey out its button.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usePowerStore } from './power';
import { useViewModeStore } from './view-mode';

describe('Low-Power ECO mode vs 3D view (Rule 9.3)', () => {
  beforeEach(() => {
    useViewModeStore.setState({
      viewMode: '2D',
      webGLError: null,
      webGLSupported: true,
    });
    usePowerStore.setState({ isLowPower: false, autoDetected: false });
  });

  it('turning ECO on while in 3D forces the 2D fallback', () => {
    useViewModeStore.getState().setViewMode('3D');
    expect(useViewModeStore.getState().viewMode).toBe('3D');

    usePowerStore.getState().toggleLowPower();

    expect(usePowerStore.getState().isLowPower).toBe(true);
    expect(useViewModeStore.getState().viewMode).toBe('2D');
  });

  it('turning ECO off does not flip the view back on its own', () => {
    useViewModeStore.getState().setViewMode('3D');
    usePowerStore.getState().setLowPower(true);
    expect(useViewModeStore.getState().viewMode).toBe('2D');

    usePowerStore.getState().setLowPower(false);

    expect(usePowerStore.getState().isLowPower).toBe(false);
    expect(useViewModeStore.getState().viewMode).toBe('2D');
  });

  it('setLowPower(true) enforces 2D too, not only the toggle', () => {
    useViewModeStore.getState().setViewMode('3D');

    usePowerStore.getState().setLowPower(true);

    expect(useViewModeStore.getState().viewMode).toBe('2D');
  });

  it('ECO off leaves an already-2D view untouched', () => {
    usePowerStore.getState().setLowPower(true);
    usePowerStore.getState().setLowPower(false);

    expect(useViewModeStore.getState().viewMode).toBe('2D');
  });
});

describe('graphics presets (Tahap 6)', () => {
  // The store runs in a plain node environment here (no jsdom): give it the
  // two storage calls it makes so the preset persistence can be asserted.
  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  };

  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    useViewModeStore.setState({ viewMode: '3D', webGLError: null, webGLSupported: true });
    usePowerStore.setState({ isLowPower: false, autoDetected: false, preset: 'penuh', lastFps: null });
  });

  afterEach(() => {
    // leave a manual preset behind so no probe keeps running between files
    usePowerStore.getState().setPreset('penuh');
    memory.clear();
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('"rendah" forces ECO on and the 2D fallback', () => {
    usePowerStore.getState().setPreset('rendah');

    expect(usePowerStore.getState().preset).toBe('rendah');
    expect(usePowerStore.getState().isLowPower).toBe(true);
    expect(useViewModeStore.getState().viewMode).toBe('2D');
    if (typeof document !== 'undefined') {
      expect(document.documentElement.classList.contains('low-power')).toBe(true);
    }
  });

  it('"penuh" lifts ECO without moving the view back', () => {
    usePowerStore.getState().setPreset('rendah');
    usePowerStore.getState().setPreset('penuh');

    expect(usePowerStore.getState().preset).toBe('penuh');
    expect(usePowerStore.getState().isLowPower).toBe(false);
    expect(useViewModeStore.getState().viewMode).toBe('2D');
    if (typeof document !== 'undefined') {
      expect(document.documentElement.classList.contains('low-power')).toBe(false);
    }
  });

  it('persists the preset and clears the legacy ECO switch', () => {
    usePowerStore.getState().setPreset('rendah');

    expect(localStorage.getItem('hermes_graphics_preset')).toBe('rendah');
    expect(localStorage.getItem('hermes_low_power')).toBeNull();
  });

  it('toggleLowPower now resolves to an explicit preset', () => {
    usePowerStore.getState().toggleLowPower();
    expect(usePowerStore.getState().preset).toBe('rendah');
    usePowerStore.getState().toggleLowPower();
    expect(usePowerStore.getState().preset).toBe('penuh');
    expect(usePowerStore.getState().isLowPower).toBe(false);
  });

  it('"otomatis" hands the decision to the probe, keeping the current state until a sample arrives', () => {
    usePowerStore.getState().setPreset('rendah');
    usePowerStore.getState().setPreset('otomatis');

    expect(usePowerStore.getState().preset).toBe('otomatis');
    expect(usePowerStore.getState().autoDetected).toBe(true);
    expect(usePowerStore.getState().isLowPower).toBe(true); // no sample yet
  });
});
