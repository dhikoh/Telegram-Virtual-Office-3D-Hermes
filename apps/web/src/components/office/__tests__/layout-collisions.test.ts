/**
 * Guards for the collision fixes of the 2026-10-13 screenshot review.
 *
 * 1. LOUNGE_SLOTS must not overlap: 8 idle demo agents used to be packed onto
 *    three columns (150/190/220) with 25 px rows, so avatars and their name
 *    pills stacked on top of each other.
 * 2. Every full-screen overlay must sit at z-[100] with its own stacking
 *    context: a stray z-50 (or a missing one) is what let the avatar layer
 *    paint over the agent sheet.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LOUNGE_SLOTS, LOUNGE_AREA, getAgentPlacement } from '@hermes-office/shared';

const SRC = join(__dirname, '..', '..');
const AVATAR_PX = 40; // w-10 h-10 circle in Avatar.tsx

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'office-3d') walk(full, out);
    } else if (full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
};

describe('lounge slots never overlap', () => {
  it('keeps at least one avatar width between every pair of slots (2D)', () => {
    for (let i = 0; i < LOUNGE_SLOTS.length; i++) {
      for (let j = i + 1; j < LOUNGE_SLOTS.length; j++) {
        const a = LOUNGE_SLOTS[i].pos2d;
        const b = LOUNGE_SLOTS[j].pos2d;
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        const overlapping = dx < AVATAR_PX && dy < AVATAR_PX;
        expect(
          overlapping,
          `slots ${i} (${a.x},${a.y}) and ${j} (${b.x},${b.y}) overlap`
        ).toBe(false);
      }
    }
  });

  it('keeps 8 distinct slots for the 8 demo agents', () => {
    const seen = new Set(LOUNGE_SLOTS.map((s) => `${s.pos2d.x},${s.pos2d.y}`));
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it('places every slot inside the lounge plate with 20 px clearance', () => {
    for (const slot of LOUNGE_SLOTS) {
      const { x, y } = slot.pos2d;
      expect(x).toBeGreaterThanOrEqual(LOUNGE_AREA.pos2d.x + 20);
      expect(x).toBeLessThanOrEqual(LOUNGE_AREA.pos2d.x + LOUNGE_AREA.pos2d.width - 20);
      expect(y).toBeGreaterThanOrEqual(LOUNGE_AREA.pos2d.y + 20);
      expect(y).toBeLessThanOrEqual(LOUNGE_AREA.pos2d.y + LOUNGE_AREA.pos2d.height - 20);
    }
  });

  it('keeps 1.0 world unit between 3D slots', () => {
    for (let i = 0; i < LOUNGE_SLOTS.length; i++) {
      for (let j = i + 1; j < LOUNGE_SLOTS.length; j++) {
        const [ax, , az] = LOUNGE_SLOTS[i].pos3d;
        const [bx, , bz] = LOUNGE_SLOTS[j].pos3d;
        const dist = Math.hypot(ax - bx, az - bz);
        expect(dist, `3D slots ${i} and ${j} are ${dist} apart`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('gives all 8 idle agents a slot through the shared placement function', () => {
    const agent = { id: 'a', department: 'command' };
    const slots = new Set(
      Array.from({ length: 8 }, (_, i) => {
        const p = getAgentPlacement(agent, 'idle', i);
        return `${p.pos2d.x},${p.pos2d.y}`;
      })
    );
    expect(slots.size).toBe(8);
  });
});

describe('full-screen overlays own the top of the stack', () => {
  const overlayFiles = walk(SRC).filter((file) =>
    readFileSync(file, 'utf8').includes('fixed inset-0')
  );

  it('finds the modal/sheet set', () => {
    expect(overlayFiles.length).toBeGreaterThanOrEqual(9);
  });

  it('has no overlay left at z-50 and no overlay missing z-[100]', () => {
    const offenders = overlayFiles.filter((file) => {
      const src = readFileSync(file, 'utf8');
      return src.includes('fixed inset-0') && (src.includes('z-50 ') || !src.includes('z-[100]'));
    });
    expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([]);
  });

  it('opens every overlay in its own stacking context', () => {
    const offenders = overlayFiles.filter(
      (file) => !readFileSync(file, 'utf8').includes('z-[100] isolate')
    );
    expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([]);
  });
});
