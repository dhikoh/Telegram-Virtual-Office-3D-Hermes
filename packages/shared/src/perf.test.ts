/**
 * Tahap 6: graphics preset policy — the 30 fps floor, the hysteresis that
 * keeps "otomatis" from flapping, and the preset -> ECO mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  GRAPHICS_PRESETS,
  FPS_LOW,
  FPS_FULL,
  isGraphicsPreset,
  resolveLowPower,
  summarizeFps,
  presetLowPower,
} from './perf.js';
import { GRAPHICS_PRESETS as FROM_INDEX } from './index.js';

describe('preset vocabulary', () => {
  it('exposes exactly penuh / rendah / otomatis', () => {
    expect([...GRAPHICS_PRESETS]).toEqual(['penuh', 'rendah', 'otomatis']);
  });

  it('sets the documented floor at 30 fps', () => {
    expect(FPS_LOW).toBe(30);
    expect(FPS_FULL).toBeGreaterThan(FPS_LOW);
  });

  it('validates stored strings', () => {
    expect(isGraphicsPreset('penuh')).toBe(true);
    expect(isGraphicsPreset('otomatis')).toBe(true);
    expect(isGraphicsPreset('hemat')).toBe(false);
    expect(isGraphicsPreset(null)).toBe(false);
    expect(isGraphicsPreset(3)).toBe(false);
  });
});

describe('resolveLowPower (hysteresis)', () => {
  it('goes to ECO under 30 fps', () => {
    expect(resolveLowPower(29.9, false)).toBe(true);
    expect(resolveLowPower(12, false)).toBe(true);
  });

  it('leaves ECO only at 50 fps or above', () => {
    expect(resolveLowPower(60, true)).toBe(false);
    expect(resolveLowPower(50, true)).toBe(false);
    expect(resolveLowPower(45, true)).toBe(true); // still in the dead band
  });

  it('holds its previous state inside the dead band', () => {
    expect(resolveLowPower(40, true)).toBe(true);
    expect(resolveLowPower(40, false)).toBe(false);
    expect(resolveLowPower(30, false)).toBe(false);
    expect(resolveLowPower(49.9, false)).toBe(false);
  });

  it('never decides on garbage', () => {
    expect(resolveLowPower(Number.NaN, true)).toBe(true);
    expect(resolveLowPower(Number.POSITIVE_INFINITY, false)).toBe(false);
    expect(resolveLowPower(0, true)).toBe(true);
    expect(resolveLowPower(-5, false)).toBe(false);
  });
});

describe('summarizeFps', () => {
  it('takes the median so one stalled frame cannot decide', () => {
    expect(summarizeFps([60, 61, 4])).toBe(60);
    expect(summarizeFps([55, 57])).toBe(56);
  });

  it('ignores unusable samples', () => {
    expect(summarizeFps([Number.NaN, 0, -3, 45])).toBe(45);
    expect(summarizeFps([])).toBe(0);
    expect(summarizeFps([0, Number.NaN])).toBe(0);
  });
});

describe('presetLowPower', () => {
  it('pins manual presets and lets otomatis follow the probe', () => {
    expect(presetLowPower('penuh', true)).toBe(false);
    expect(presetLowPower('rendah', false)).toBe(true);
    expect(presetLowPower('otomatis', true)).toBe(true);
    expect(presetLowPower('otomatis', false)).toBe(false);
  });
});

describe('wiring', () => {
  it('reaches the shared package entry point', () => {
    expect([...FROM_INDEX]).toEqual([...GRAPHICS_PRESETS]);
  });
});
