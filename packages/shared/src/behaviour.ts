/**
 * Ambient agent behaviour — Tahap 3.5.
 *
 * One module, two renderers (Rule 9.1 covers *where* an agent stands; this
 * covers *what* it does once it gets there). The 2D SVG map and the 3D WebGL
 * scene both call `agentMotion`, so an agent's body language is identical in
 * both modes: idle agents stroll a small loop instead of standing frozen,
 * working agents type, waiting agents bounce, error agents glitch.
 *
 * Everything here is pure and deterministic in (agentId, status, tSeconds):
 * no clock reads, no randomness, no state — unit-testable and identical on
 * both renderers. Distances are 3D world units; the 2D map multiplies by
 * `PX_PER_UNIT`.
 */

/** 2D map is 380 px wide over ~19 world units; lounge slots sit 4 units apart
 *  in 3D and 80 px apart in 2D, so 20 px keeps both scales in step. */
export const PX_PER_UNIT = 20;

export interface AgentMotion {
  /** Horizontal offset in world units, added to the placement from layout.ts */
  offsetX: number;
  offsetZ: number;
  /** Vertical offset: head bob / bounce */
  bob: number;
  /** Yaw wobble in radians (3D only; 2D avatars have no facing) */
  rotation: number;
}

const STILL: AgentMotion = { offsetX: 0, offsetZ: 0, bob: 0, rotation: 0 };

/* ------------------------------------------------------------------- gait */

/**
 * How fast a committed character walks, in world units per second.
 *
 * Measured off all twelve Kenney GLBs, not guessed. The `walk` clip is a
 * mirrored scissor — measured: `yLeft === yRight` and `zLeft === -zRight` on
 * every sample — so the legs have no true stance phase and a "planted foot"
 * speed does not exist. What the clip does define is its stride and cadence:
 * the hip sits 0.176 units above the sole, each leg swings 60° either side of
 * rest (peak quaternion 0.5, 0, 0, -0.866), so the feet pass 2 × 0.176 ×
 * sin 60° = 0.305 units apart, twice per 0.667 s cycle — 3 steps/s.
 *
 * Speed = stride × cadence = 0.305 × 3 = 0.916 units/s in the pack's scale.
 * `prepareForScene` then scales each model UP to `CHARACTER_HEIGHT = 1.0` (the
 * pack's bodies are 0.66–0.79 units tall), lengthening the stride by the same
 * factor: 1.155 units/s for the tallest body (male-c), 1.385 for the shortest
 * (male-b). This constant is the pack's mean, 1.28.
 *
 * Running the body at the clip's own stride×cadence is what stops the feet
 * being dragged: the old path eased the body at ~3 units/s against a clip that
 * strides 1.26 — a 2.4× mismatch, which is the "berjalan tidak natural" the
 * owner saw. Any deliberate speed change is paid for with `timeScale` (see
 * `gaitFor`), never by sliding the body.
 */
export const WALK_SPEED = 1.28;

/** Below this the feet are not taking steps — stand still and play `Idle`. */
export const MOVING_SPEED = 0.15;

/**
 * The clip a body travelling at `speed` should play, and the `timeScale` that
 * keeps its stride matched to that speed. Pure, so both renderers and the
 * tests read the same rule.
 *
 * The clamp is deliberate: a body creeping at 0.05 units/s must still look
 * like it is walking (timeScale 0.35) rather than marching in slow motion,
 * and one moving faster than the clip can stride is capped at 1.6 rather than
 * spinning its legs.
 */
export function gaitFor(speed: number): { moving: boolean; timeScale: number } {
  const magnitude = Math.abs(speed);
  return {
    moving: magnitude > MOVING_SPEED,
    timeScale: Math.min(1.6, Math.max(0.35, magnitude / WALK_SPEED)),
  };
}

/** Move `current` towards `target` by at most `maxDelta` — no overshoot. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/** Shortest-arc turn from `current` to `target`, by at most `maxDelta` rad. */
export function turnTowards(current: number, target: number, maxDelta: number): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + Math.max(-maxDelta, Math.min(maxDelta, delta));
}

/** Stable 0..1 hash so every agent gets its own phase without a random seed. */
function phase01(agentId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < agentId.length; i++) {
    hash ^= agentId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

/**
 * Motion amplitudes are chosen so a moving agent never leaves its own slot:
 * idle wander radius 0.45 units = 9 px in 2D, while lounge slots are 40 px
 * apart vertically — the avatar circles are 40 px wide, so paths stay clear.
 *
 * Idle and thinking agents do not *slide*: they stand, then take a real walk
 * to a nearby spot and back, at `WALK_SPEED` exactly (see `patrol`). A body
 * that creeps along a continuous curve has to drag its feet, because the walk
 * clip can only stride at one honest speed — that skating is what "berjalan
 * tidak natural" described.
 */

/** Idle agents take one short stroll per this many seconds: a step out, a
 *  pause, a step back, a longer pause — mostly resting, never gliding.
 *  At `WALK_SPEED` the 0.45-unit leg takes 0.36 s, about one clip cycle. */
const IDLE_PERIOD = 9.6;
const IDLE_STEP = 0.45;

/** Thinking agents pace in front of the desk: a step, a beat, a step back. */
const PACE_PERIOD = 3.2;
const PACE_STEP = 0.5;

interface Patrol {
  offsetX: number;
  offsetZ: number;
  /** Yaw to face, in radians. The character model faces +Z (measured off the
   *  GLB geometry), so facing a direction (dx, dz) is `atan2(dx, dz)`. */
  rotation: number;
}

/**
 * Stand, walk out `amplitude` units along `angle`, stand, walk back — a pure
 * function of time. Both walking legs cover the distance at `WALK_SPEED`, so
 * the renderer can match the clip's stride exactly instead of approximating.
 *
 * `phase` shifts the whole schedule (not the direction): agents are then at
 * different points of their own cycle at any instant, so the lounge always has
 * somebody walking and somebody resting instead of the row moving in lockstep.
 */
function patrol(
  angle: number,
  phase: number,
  t: number,
  amplitude: number,
  period: number
): Patrol {
  const travel = amplitude / WALK_SPEED; // seconds of walking, one way
  const hold = Math.max(0, (period - 2 * travel) / 2);
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const outYaw = Math.atan2(dx, dz);
  const backYaw = Math.atan2(-dx, -dz);
  const f = (((t + phase) % period) + period) % period;

  if (f < hold) return { offsetX: 0, offsetZ: 0, rotation: outYaw };
  if (f < hold + travel) {
    const k = (f - hold) / travel;
    return { offsetX: dx * amplitude * k, offsetZ: dz * amplitude * k, rotation: outYaw };
  }
  if (f < hold + travel + hold) {
    return { offsetX: dx * amplitude, offsetZ: dz * amplitude, rotation: backYaw };
  }
  const k = (f - hold - travel - hold) / travel;
  return {
    offsetX: dx * amplitude * (1 - k),
    offsetZ: dz * amplitude * (1 - k),
    rotation: backYaw,
  };
}

export function agentMotion(
  agentId: string,
  status: string,
  tSeconds: number,
  lowPower = false
): AgentMotion {
  // Rule REQ-067: ECO / reduced motion freezes ambient animation entirely.
  if (lowPower) return STILL;

  const phase = phase01(agentId) * Math.PI * 2;
  const t = tSeconds;

  switch (status) {
    case 'idle': {
      // Step away from the lounge slot and come back, on this agent's own
      // schedule (phases differ, so the row never moves in lockstep).
      const step = patrol(phase, phase, t, IDLE_STEP, IDLE_PERIOD);
      return { ...step, bob: Math.sin(t * 1.6 + phase) * 0.03 };
    }
    case 'working':
      // Typing: small forward/back lean and a fast hand-driven bob.
      return {
        offsetX: Math.sin(t * 2.4 + phase) * 0.04,
        offsetZ: 0,
        bob: Math.sin(t * 7 + phase) * 0.02,
        rotation: 0,
      };
    case 'thinking': {
      // Pacing side to side in front of the desk — a real walk, not a slide.
      // Angle 0 keeps the walk along X (lateral), so a pacer never walks into
      // the desk it stands behind.
      const pace = patrol(0, phase, t, PACE_STEP, PACE_PERIOD);
      return { ...pace, bob: Math.sin(t * 2.4 + phase) * 0.03 };
    }
    case 'waiting_approval':
      // Impatient bounce while the CEO decides.
      return {
        offsetX: 0,
        offsetZ: 0,
        bob: Math.abs(Math.sin(t * 2.5 + phase)) * 0.06,
        rotation: 0,
      };
    case 'error':
      // Glitch shake.
      return {
        offsetX: Math.sin(t * 26 + phase) * 0.05,
        offsetZ: Math.sin(t * 33) * 0.02,
        bob: 0,
        rotation: 0,
      };
    default:
      // offline and anything unknown stand still
      return STILL;
  }
}
