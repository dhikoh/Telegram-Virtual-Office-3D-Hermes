/**
 * Frame-rate probe (Tahap 6). Browser half of packages/shared/src/perf.ts.
 *
 * Counts rAF frames over a window and reports fps. Runs only while the
 * "otomatis" graphics preset is active, stops itself when the page is hidden
 * (a background tab would report 1 fps and force ECO for no reason), and
 * degrades to a no-op where rAF does not exist — SSR and tests.
 */

export interface FpsProbe {
  stop(): void;
}

export interface FpsProbeOptions {
  /** Measurement window in milliseconds. */
  windowMs?: number;
}

const NOOP: FpsProbe = { stop: () => undefined };

export function startFpsProbe(
  onSample: (fps: number) => void,
  options: FpsProbeOptions = {}
): FpsProbe {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return NOOP;
  }

  const windowMs = options.windowMs ?? 2000;
  let frames = 0;
  let windowStart = 0;
  let rafId = 0;
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    if (windowStart === 0) windowStart = now;
    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed >= windowMs) {
      const fps = (frames * 1000) / elapsed;
      frames = 0;
      windowStart = now;
      // A hidden tab throttles rAF to a crawl; report nothing instead of
      // letting that decide the graphics preset.
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        onSample(fps);
      }
    }
    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      window.cancelAnimationFrame(rafId);
    },
  };
}

export default startFpsProbe;
