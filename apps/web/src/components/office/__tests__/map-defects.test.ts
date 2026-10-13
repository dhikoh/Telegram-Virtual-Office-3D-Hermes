/**
 * Regressions for the four defects the Tahap 5 screenshots exposed
 * (2026-10-13 review): labels sitting under sprites, a button over a label, a
 * label wider than its box, and a chip row that clips with no scroll cue.
 *
 * These are geometry, so they are asserted on the source coordinates rather
 * than by rendering — the same style layout-collisions.test.ts uses.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const map = read('../Map.tsx');
const chips = read('../RoomChips.tsx');
const css = read('../../../index.css');

describe('Map.tsx label geometry', () => {
  it('keeps the lounge label clear of the idle sprite rows', () => {
    // idle slots sit at y 170/210/250/290 and each sprite box rises 24 px
    // above its slot, so the old y=152 label was under the top row.
    const match = /<text x="190" y="(\d+)"[^>]*>\s*\{t\('rooms\.lounge'\)\s*\}/.exec(map);
    expect(match, 'lounge label not found').not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(300);
    expect(Number(match![1])).toBeLessThan(316); // still inside the room box
  });

  it('fits the approval-gate label inside its 90 px box', () => {
    const match = /<text x="190" y="103"[^>]*fontSize="([\d.]+)"/.exec(map);
    expect(match, 'approval gate label not found').not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(7.5);
  });

  it('moves the HR "+" door clear of the "Ruang Rekrutmen" label', () => {
    // label spans x 27-95 at y 279; the old door at (92,266) sat on top of it.
    expect(map).not.toContain('left-[92px] top-[266px]');
    expect(map).toContain('left-[96px] top-[312px]');
  });
});

describe('RoomChips scroll cue', () => {
  it('fades the clipped edge while there is more to scroll', () => {
    expect(chips).toContain('chip-row-fade');
    expect(chips).toContain('onScroll');
    expect(chips).toContain('setAtEnd');
  });

  it('defines the fade in the stylesheet, not inline', () => {
    expect(css).toContain('.chip-row-fade');
    expect(css).toContain('mask-image: linear-gradient(to right');
  });
});
