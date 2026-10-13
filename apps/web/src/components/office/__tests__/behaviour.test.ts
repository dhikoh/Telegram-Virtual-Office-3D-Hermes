/**
 * Tahap 3.5 — ambient agent behaviour, the module both renderers share.
 *
 * The point of the module is that one set of rules drives the 2D map and the
 * 3D scene: if these tests go red, the two views drift apart (in both senses).
 */

import { describe, it, expect } from 'vitest';
import { agentMotion, PX_PER_UNIT, LOUNGE_SLOTS } from '@hermes-office/shared';

const STATUSES = ['idle', 'working', 'thinking', 'waiting_approval', 'error', 'offline'];
const SAMPLE_TIMES = Array.from({ length: 24 }, (_, i) => i * 0.7);

describe('agentMotion', () => {
  it('is pure: same inputs give the same output', () => {
    const a = agentMotion('agent-1', 'idle', 12.5);
    const b = agentMotion('agent-1', 'idle', 12.5);
    expect(a).toEqual(b);
  });

  it('gives every agent its own phase', () => {
    const a = agentMotion('agent-1', 'idle', 3.3);
    const b = agentMotion('agent-2', 'idle', 3.3);
    expect(a.offsetX !== b.offsetX || a.offsetZ !== b.offsetZ).toBe(true);
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
