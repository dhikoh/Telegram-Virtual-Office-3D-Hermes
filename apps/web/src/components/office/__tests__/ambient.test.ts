/**
 * Tahap 4a — street traffic, the module both renderers will share.
 *
 * Section 7.5 of the design direction: the window onto the street must be
 * one source of truth, or the diorama shows traffic the map disagrees with.
 */

import { describe, it, expect } from 'vitest';
import { streetTraffic, STREET_SPAN } from '@hermes-office/shared';

const SAMPLE_TIMES = Array.from({ length: 24 }, (_, i) => i * 0.9);

describe('streetTraffic', () => {
  it('returns the same fleet every call', () => {
    expect(streetTraffic(0).map((v) => v.id)).toEqual(
      streetTraffic(0).map((v) => v.id)
    );
    expect(streetTraffic(0).length).toBeGreaterThanOrEqual(6);
  });

  it('keeps every vehicle inside the visible span', () => {
    for (const t of SAMPLE_TIMES) {
      for (const v of streetTraffic(t)) {
        expect(v.x).toBeGreaterThanOrEqual(-STREET_SPAN);
        expect(v.x).toBeLessThan(STREET_SPAN + 0.0001);
        expect(v.lane === 0 || v.lane === 1).toBe(true);
        expect(v.x).toBeGreaterThan(-Infinity); // finite
        expect(Number.isFinite(v.x)).toBe(true);
      }
    }
  });

  it('actually moves while time passes', () => {
    const a = streetTraffic(0);
    const b = streetTraffic(5);
    const moved = a.some((v, i) => Math.abs(v.x - b[i].x) > 1);
    expect(moved).toBe(true);
  });

  it('freezes the street under low power (Rule 9.3 / REQ-067)', () => {
    const still = streetTraffic(0, true);
    for (const t of [0, 5, 30, 120]) {
      const moving = streetTraffic(t, true);
      expect(moving.map((v) => v.x)).toEqual(still.map((v) => v.x));
      expect(moving.every((v) => v.speed === 0)).toBe(true);
    }
  });

  it('drives both lanes in opposite directions', () => {
    const fleet = streetTraffic(0);
    const speeds = new Set(fleet.map((v) => Math.sign(v.speed)));
    expect(speeds).toEqual(new Set([-1, 1]));
  });

  it('never lets two vehicles of a lane occupy the same spot at t=0', () => {
    for (const lane of [0, 1]) {
      const xs = streetTraffic(0)
        .filter((v) => v.lane === lane)
        .map((v) => v.x)
        .sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThan(4);
      }
    }
  });
});
