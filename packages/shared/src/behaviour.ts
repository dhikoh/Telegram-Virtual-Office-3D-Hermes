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
 */
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
      // Slow stroll around the lounge slot: one loop ≈ 42 s, never in sync
      // with another agent because each has its own phase.
      const a = t * 0.15 + phase;
      return {
        offsetX: Math.cos(a) * 0.45,
        offsetZ: Math.sin(a) * 0.45,
        bob: Math.sin(t * 1.6 + phase) * 0.03,
        rotation: Math.sin(a) * 0.25,
      };
    }
    case 'working':
      // Typing: small forward/back lean and a fast hand-driven bob.
      return {
        offsetX: Math.sin(t * 2.4 + phase) * 0.04,
        offsetZ: 0,
        bob: Math.sin(t * 7 + phase) * 0.02,
        rotation: 0,
      };
    case 'thinking':
      // Pacing in place at the desk.
      return {
        offsetX: 0,
        offsetZ: Math.sin(t * 1.2 + phase) * 0.05,
        bob: Math.sin(t * 2.4 + phase) * 0.03,
        rotation: Math.sin(t * 1.2 + phase) * 0.15,
      };
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
