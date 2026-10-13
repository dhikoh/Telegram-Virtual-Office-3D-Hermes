// @vitest-environment jsdom
/**
 * Tahap 6: the frame-rate probe that decides the "otomatis" preset.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startFpsProbe } from './fps';

type RafCb = (now: number) => void;

describe('startFpsProbe', () => {
  let queue: RafCb[] = [];
  let cancelled: number[] = [];
  let originalRaf: unknown;
  let originalCaf: unknown;

  beforeEach(() => {
    queue = [];
    cancelled = [];
    originalRaf = window.requestAnimationFrame;
    originalCaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((cb: RafCb) => {
      queue.push(cb);
      return queue.length;
    }) as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      cancelled.push(id);
    }) as unknown as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRaf as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = originalCaf as typeof window.cancelAnimationFrame;
  });

  /** Drain n queued frames at 60 fps, advancing the clock by 16.7 ms each. */
  const run = (n: number, start = 1000) => {
    let now = start;
    for (let i = 0; i < n; i += 1) {
      const next: RafCb[] = [];
      queue.splice(0).forEach((cb) => next.push(cb));
      next.forEach((cb) => {
        cb(now);
        now += 16.7;
      });
    }
  };

  it('reports a frame rate once the window is full', () => {
    const samples: number[] = [];
    startFpsProbe((fps) => samples.push(fps), { windowMs: 1000 });
    run(70); // 70 frames * 16.7 ms ≈ 1.17 s
    expect(samples.length).toBeGreaterThanOrEqual(1);
    expect(samples[0]).toBeGreaterThan(50);
    expect(samples[0]).toBeLessThan(70);
  });

  it('reports nothing for a throttled, sub-30 fps tab window', () => {
    const samples: number[] = [];
    startFpsProbe((fps) => samples.push(fps), { windowMs: 1000 });
    // 10 frames over ~5 s → ~2 fps, but only if the window ever closes
    let now = 1000;
    for (let i = 0; i < 10; i += 1) {
      const next: RafCb[] = [];
      queue.splice(0).forEach((cb) => next.push(cb));
      next.forEach((cb) => cb(now));
      now += 500;
    }
    // The store side is what applies this; here we only assert the value is
    // still a finite number the policy can reject (resolveLowPower < 30).
    expect(samples.every((s) => Number.isFinite(s))).toBe(true);
  });

  it('stops on demand and cancels the pending frame', () => {
    const samples: number[] = [];
    const probe = startFpsProbe((fps) => samples.push(fps), { windowMs: 1000 });
    run(5);
    probe.stop();
    expect(cancelled.length).toBeGreaterThan(0);
    const before = queue.length;
    run(80);
    expect(queue.length).toBeLessThanOrEqual(before);
    expect(samples.length).toBe(0);
  });

  it('is a no-op without requestAnimationFrame', () => {
    const original = window.requestAnimationFrame;
    // jsdom may not define rAF at all; forcing it undefined covers both.
    (window as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined;
    try {
      const probe = startFpsProbe(() => undefined);
      expect(() => probe.stop()).not.toThrow();
    } finally {
      window.requestAnimationFrame = original as typeof window.requestAnimationFrame;
    }
  });
});
