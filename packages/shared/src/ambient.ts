/**
 * Ambient street traffic — Tahap 4a (Konsep A: Diorama Ruang Kaca, section 7.5).
 *
 * The office diorama has a back wall with a window; the world outside must
 * keep moving. Like `behaviour.ts`, this is one pure module for both
 * renderers: the 3D scene builds boxes from it, the 2D renderer (Tahap 5)
 * will draw sprites from the same numbers, so the view out of the window
 * never disagrees with the map.
 *
 * Distances are world units. The street runs along X behind the window, so
 * vehicles only move on X; `lane` picks the row, `dir` the direction.
 * Deterministic: no clock, no randomness — `tSeconds` in, positions out.
 */

export interface StreetVehicle {
  /** Stable id, so renderers can key on it */
  id: string;
  /** Position along the street, wrapped into [-SPAN, SPAN] */
  x: number;
  /** 0 = near the window, 1 = far row */
  lane: number;
  /** Signed speed in world units per second (dir included) */
  speed: number;
  /** Body colour token, chosen for contrast against the road */
  color: string;
  /** 'car' is 1.6 units long, 'bus' is 3.2 */
  kind: 'car' | 'bus';
}

/** Half length of the visible street; traffic wraps at this edge. */
export const STREET_SPAN = 22;

const VEHICLES: Array<{
  id: string;
  offset: number;
  lane: number;
  speed: number;
  color: string;
  kind: 'car' | 'bus';
}> = [
  { id: 'v1', offset: -6, lane: 0, speed: 3.2, color: '#F59E0B', kind: 'car' },
  { id: 'v2', offset: 7, lane: 0, speed: 2.6, color: '#DDE3EA', kind: 'bus' },
  { id: 'v3', offset: 15, lane: 0, speed: 3.8, color: '#7C5CFC', kind: 'car' },
  { id: 'v4', offset: 4, lane: 1, speed: -3.4, color: '#15803D', kind: 'car' },
  { id: 'v5', offset: -13, lane: 1, speed: -2.4, color: '#DDE3EA', kind: 'car' },
  { id: 'v6', offset: -18, lane: 1, speed: -3.0, color: '#B45309', kind: 'bus' },
];

/** Wrap into [-STREET_SPAN, SPAN) without using modulo's signed surprises. */
function wrap(value: number): number {
  const span2 = STREET_SPAN * 2;
  return ((((value + STREET_SPAN) % span2) + span2) % span2) - STREET_SPAN;
}

export function streetTraffic(tSeconds: number, lowPower = false): StreetVehicle[] {
  // Rule REQ-067: ECO freezes ambient life too — the street is decoration,
  // never a reason to keep animating.
  if (lowPower) {
    return VEHICLES.map((v) => ({
      id: v.id,
      x: wrap(v.offset),
      lane: v.lane,
      speed: 0,
      color: v.color,
      kind: v.kind,
    }));
  }

  return VEHICLES.map((v) => ({
    id: v.id,
    x: wrap(v.offset + v.speed * tSeconds),
    lane: v.lane,
    speed: v.speed,
    color: v.color,
    kind: v.kind,
  }));
}
