/**
 * Tahap 3.5 — ambient agent behaviour, the module both renderers share.
 *
 * The point of the module is that one set of rules drives the 2D map and the
 * 3D scene: if these tests go red, the two views drift apart (in both senses).
 */

import { describe, it, expect } from 'vitest';
import {
  agentMotion,
  approach,
  gaitFor,
  PX_PER_UNIT,
  LOUNGE_SLOTS,
  turnTowards,
  WALK_SPEED,
} from '@hermes-office/shared';

const STATUSES = ['idle', 'working', 'thinking', 'waiting_approval', 'error', 'offline'];
const SAMPLE_TIMES = Array.from({ length: 24 }, (_, i) => i * 0.7);

describe('agentMotion', () => {
  it('is pure: same inputs give the same output', () => {
    const a = agentMotion('agent-1', 'idle', 12.5);
    const b = agentMotion('agent-1', 'idle', 12.5);
    expect(a).toEqual(b);
  });

  it('gives every agent its own phase', () => {
    // Agents now stand, take a stroll and stand again (see `patrol`), so two of
    // them can legitimately both be resting at the same instant. The contract
    // is that their *trajectories* differ — not that one sample does.
    const track = (id: string) =>
      SAMPLE_TIMES.map((t) => {
        const m = agentMotion(id, 'idle', t);
        return `${m.offsetX.toFixed(4)},${m.offsetZ.toFixed(4)}`;
      }).join('|');
    expect(track('agent-1')).not.toBe(track('agent-2'));
  });

  it('walks idle agents at the clip’s own stride speed, never by sliding', () => {
    // The walk clip can only stride at WALK_SPEED, so a body moving at another
    // speed would have to skate its feet. Sample the patrol finely: every frame
    // covers at most one honest stride, and the strides really do reach it.
    const DT = 1 / 60;
    let fastest = 0;
    let walking = 0;
    let resting = 0;
    let previous = agentMotion('agent-1', 'idle', 0);
    for (let t = DT; t < 60; t += DT) {
      const m = agentMotion('agent-1', 'idle', t);
      const covered = Math.hypot(m.offsetX - previous.offsetX, m.offsetZ - previous.offsetZ);
      const speed = covered / DT;
      // Never faster than the clip can stride — that is what skating looks like.
      expect(speed).toBeLessThanOrEqual(WALK_SPEED + 1e-6);
      // A leg can end mid-frame, so the last frame of a leg is a partial stride.
      if (speed > 1e-6) walking++;
      else resting++;
      fastest = Math.max(fastest, speed);
      previous = m;
    }
    // The full stride speed is actually reached (not a permanent slow shuffle).
    expect(fastest).toBeCloseTo(WALK_SPEED, 3);
    // And the stroll is a stroll, not a treadmill: real rest between legs.
    expect(walking).toBeGreaterThan(0);
    expect(resting).toBeGreaterThan(walking);
  });

  it('returns to zero for every status when low power is on (Rule 9.3 / REQ-067)', () => {
    for (const status of STATUSES) {
      for (const t of SAMPLE_TIMES) {
        expect(agentMotion('agent-1', status, t, true)).toEqual({
          offsetX: 0,
          offsetZ: 0,
          bob: 0,
          rotation: 0,
        });
      }
    }
  });

  it('keeps offline agents still', () => {
    for (const t of SAMPLE_TIMES) {
      expect(agentMotion('agent-1', 'offline', t)).toEqual({
        offsetX: 0,
        offsetZ: 0,
        bob: 0,
        rotation: 0,
      });
    }
  });

  it('emits only finite numbers for every status and time', () => {
    for (const status of STATUSES) {
      for (const t of SAMPLE_TIMES) {
        const m = agentMotion('agent-1', status, t);
        for (const [key, value] of Object.entries(m)) {
          expect(Number.isFinite(value), `${status}@${t}.${key} = ${value}`).toBe(true);
        }
      }
    }
  });

  it('actually moves idle agents (they were frozen before)', () => {
    const travelled = SAMPLE_TIMES.some((t) => {
      const m = agentMotion('agent-1', 'idle', t);
      return Math.hypot(m.offsetX, m.offsetZ) > 0.1;
    });
    expect(travelled).toBe(true);
  });

  it('faces the way it walks, and stands facing where it will walk next', () => {
    // The character model faces +Z (measured off the GLB geometry), so the yaw
    // for a direction (dx, dz) is atan2(dx, dz) — never a wobble.
    for (let t = 0; t < 30; t += 1 / 30) {
      const m = agentMotion('agent-1', 'idle', t);
      expect(Number.isFinite(m.rotation)).toBe(true);
      expect(Math.abs(m.rotation)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
    // Both the outbound and the return leg are represented over a full cycle.
    const yaws = new Set<string>();
    for (let t = 0; t < 40; t += 1 / 30) {
      yaws.add(agentMotion('agent-1', 'idle', t).rotation.toFixed(3));
    }
    expect(yaws.size).toBeGreaterThan(1);
  });

  it('never wanders far enough to collide with the neighbouring lounge slot', () => {
    // Lounge rows are 40 px apart in 2D and 4 units apart in 3D.
    let maxRadius = 0;
    for (const t of SAMPLE_TIMES) {
      const m = agentMotion('agent-1', 'idle', t);
      maxRadius = Math.max(maxRadius, Math.hypot(m.offsetX, m.offsetZ));
    }
    expect(maxRadius).toBeLessThanOrEqual(0.5); // world units
    expect(maxRadius * PX_PER_UNIT).toBeLessThanOrEqual(10); // <= 10 px in 2D
    expect(maxRadius).toBeLessThan(4); // 3D slots are 4 units apart
  });

  it('keeps working agents at their desk (no lateral drift into the aisle)', () => {
    for (const t of SAMPLE_TIMES) {
      const m = agentMotion('agent-1', 'working', t);
      expect(m.offsetZ).toBe(0);
      expect(Math.abs(m.offsetX)).toBeLessThanOrEqual(0.05);
    }
  });

  it('bounces waiting agents and shakes error agents', () => {
    const bounces = SAMPLE_TIMES.some((t) => agentMotion('agent-1', 'waiting_approval', t).bob > 0);
    const shakes = SAMPLE_TIMES.some((t) => Math.abs(agentMotion('agent-1', 'error', t).offsetX) > 0.01);
    expect(bounces).toBe(true);
    expect(shakes).toBe(true);
  });

  it('keeps the idle radius inside the lounge slot grid (parity with layout.ts)', () => {
    expect(LOUNGE_SLOTS.length).toBeGreaterThanOrEqual(8);
    const sameSlotTwice = LOUNGE_SLOTS.filter(
      (s) => s.pos2d.x === LOUNGE_SLOTS[0].pos2d.x && s.pos2d.y === LOUNGE_SLOTS[0].pos2d.y
    );
    expect(sameSlotTwice.length).toBe(1);
  });
});

/**
 * The gait rules that keep the feet from skating. These lock the *contract*
 * between the shared speed constant and the renderer: the walk clip can only
 * stride at WALK_SPEED, so every other speed has to be paid for with a
 * timeScale — never by sliding the body.
 */
describe('gait', () => {
  it('reports no movement below the threshold', () => {
    expect(gaitFor(0).moving).toBe(false);
    expect(gaitFor(0.1).moving).toBe(false);
    expect(gaitFor(-0.1).moving).toBe(false);
    expect(gaitFor(0.2).moving).toBe(true);
    // Sign never matters: a body backing up still walks.
    expect(gaitFor(-0.2).moving).toBe(true);
  });

  it('plays the clip at 1.0 exactly when the body moves at the clip speed', () => {
    expect(gaitFor(WALK_SPEED).timeScale).toBeCloseTo(1, 6);
  });

  it('clamps the cadence instead of spinning or crawling', () => {
    // A body barely moving must not march in slow motion...
    expect(gaitFor(0.001).timeScale).toBe(0.35);
    // ...and one outrunning the clip must not blur its legs.
    expect(gaitFor(100).timeScale).toBe(1.6);
    // In between the ratio is honest: half speed, half cadence.
    expect(gaitFor(WALK_SPEED / 2).timeScale).toBeCloseTo(0.5, 6);
    expect(gaitFor(WALK_SPEED * 1.5).timeScale).toBeCloseTo(1.5, 6);
  });

  it('approaches a target without ever overshooting', () => {
    expect(approach(0, 1, 0.3)).toBeCloseTo(0.3, 6);
    expect(approach(0, 1, 5)).toBe(1);
    expect(approach(1, 0, 0.3)).toBeCloseTo(0.7, 6);
    expect(approach(1, 0, 5)).toBe(0);
    expect(approach(0.5, 0.5, 0.3)).toBe(0.5);
  });

  it('turns the short way round and stops at the target', () => {
    // 0.1 rad *before* a full turn is -0.1 rad the short way, so the body turns
    // backwards — never the 6.18 rad scenic route.
    const nearlyFull = turnTowards(0, Math.PI * 2 - 0.1, 0.05);
    expect(nearlyFull).toBeCloseTo(-0.05, 6);
    // Rate-limited: a 180° about-face takes many frames, not one.
    expect(turnTowards(0, Math.PI, 0.1)).toBeCloseTo(0.1, 6);
    // Already facing the right way: no drift.
    expect(turnTowards(1, 1, 0.1)).toBe(1);
    // Wraps the other way round too: 3.0 → -3.0 is +0.283 rad forwards.
    expect(turnTowards(3.0, -3.0, 0.1)).toBeCloseTo(3.1, 6);
  });
});
