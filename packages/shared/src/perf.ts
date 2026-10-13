/**
 * Graphics presets and the frame-rate policy (Tahap 6, DESIGN_DIRECTION 5).
 *
 * Criterion for the stage: a penuh / rendah / otomatis switch, a measured
 * frame rate with the 30 fps floor from section 5, and the existing WebGL
 * rollback. Everything here is pure — no timers, no requestAnimationFrame —
 * so the policy can be unit-tested; the browser half lives in
 * apps/web/src/lib/fps.ts and applies what this file decides.
 */

/** Penuh = effects on, Rendah = ECO on, Otomatis = let the probe decide. */
export const GRAPHICS_PRESETS = ['penuh', 'rendah', 'otomatis'] as const;

export type GraphicsPreset = (typeof GRAPHICS_PRESETS)[number];

/** Below this the frame budget is broken: go to ECO (section 5 wants >= 30). */
export const FPS_LOW = 30;

/** Comfortable headroom before effects are switched back on. */
export const FPS_FULL = 50;

export function isGraphicsPreset(value: unknown): value is GraphicsPreset {
  return typeof value === 'string' && (GRAPHICS_PRESETS as readonly string[]).includes(value);
}

/**
 * Hysteresis for the automatic preset: under 30 fps drop to ECO, at 50 fps or
 * above come back, and in between stay where you are. Without the gap the
 * probe would flip modes on every other sample.
 */
export function resolveLowPower(fps: number, previous: boolean): boolean {
  if (!Number.isFinite(fps) || fps <= 0) return previous;
  if (fps < FPS_LOW) return true;
  if (fps >= FPS_FULL) return false;
  return previous;
}

/** Median of the usable samples — a single stalled frame must not decide. */
export function summarizeFps(samples: readonly number[]): number {
  const usable = samples.filter((s) => Number.isFinite(s) && s > 0).sort((a, b) => a - b);
  if (usable.length === 0) return 0;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 === 1 ? usable[mid] : (usable[mid - 1] + usable[mid]) / 2;
}

/** What ECO a preset implies: manual presets are fixed, otomatis follows the probe. */
export function presetLowPower(preset: GraphicsPreset, probedLowPower: boolean): boolean {
  if (preset === 'penuh') return false;
  if (preset === 'rendah') return true;
  return probedLowPower;
}
