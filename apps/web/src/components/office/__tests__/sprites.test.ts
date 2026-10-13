/**
 * Tahap 5 — pixel-art sprites and the street strip (DESIGN_DIRECTION.md 4).
 *
 * The sprites are strings, so they can be tested like data: every map must be
 * the same width, every cell must have a colour, the four walk frames must
 * actually differ (otherwise the animation is a no-op), and each facing must
 * resolve. The renderer itself needs a browser canvas, which jsdom does not
 * provide — so spriteDataUrl is only asserted not to throw and to report null.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CHAR_FRONT_FRAMES,
  CHAR_BACK_FRAMES,
  VEHICLE_CAR,
  VEHICLE_BUS,
  SPRITE_CELLS,
  SPRITE_PALETTE,
  CHAR_ROWS,
  spriteGrid,
  spritePalette,
  usedKeys,
  lighten,
  directionFrames,
  type SpriteMap,
} from '@hermes-office/shared';
import { spriteDataUrl } from '../../../lib/sprites';

const ALL: Array<[string, SpriteMap]> = [
  ...CHAR_FRONT_FRAMES.map((m, i) => [`front${i}`, m] as [string, SpriteMap]),
  ...CHAR_BACK_FRAMES.map((m, i) => [`back${i}`, m] as [string, SpriteMap]),
  ['car', VEHICLE_CAR],
  ['bus', VEHICLE_BUS],
];

describe('sprite maps', () => {
  it('are all SPRITE_CELLS wide and never ragged', () => {
    for (const [name, map] of ALL) {
      const { width } = spriteGrid(map);
      expect(width, name).toBe(SPRITE_CELLS);
      for (const row of map) expect(row.length, `${name}: ${row}`).toBe(SPRITE_CELLS);
    }
  });

  it('give characters CHAR_ROWS rows and vehicles 5', () => {
    expect(spriteGrid(CHAR_FRONT_FRAMES[0]).height).toBe(CHAR_ROWS);
    expect(spriteGrid(CHAR_BACK_FRAMES[0]).height).toBe(CHAR_ROWS);
    expect(spriteGrid(VEHICLE_CAR).height).toBe(5);
    expect(spriteGrid(VEHICLE_BUS).height).toBe(5);
  });

  it('use only palette keys (plus the wearer-supplied shirt/body slots)', () => {
    for (const [, map] of ALL) {
      for (const key of usedKeys(map)) {
        // b/l are the department shirt, c the vehicle body: all three are
        // injected by spritePalette(), never declared up front.
        const known = key in SPRITE_PALETTE || key === 'b' || key === 'l' || key === 'c';
        expect(known, `unexpected sprite key '${key}'`).toBe(true);
      }
    }
  });

  it('reject a ragged map loudly instead of drawing garbage', () => {
    expect(() => spriteGrid(['abc', 'de'])).toThrow(/row 1/);
    expect(() => spriteGrid([])).toThrow(/empty/);
  });
});

describe('walk frames', () => {
  it('are four distinct poses per facing', () => {
    expect(new Set(CHAR_FRONT_FRAMES.map((f) => f.join(''))).size).toBe(4);
    expect(new Set(CHAR_BACK_FRAMES.map((f) => f.join(''))).size).toBe(4);
  });

  it('differ between front and back on the head rows only', () => {
    for (let i = 0; i < CHAR_FRONT_FRAMES.length; i += 1) {
      expect(CHAR_FRONT_FRAMES[i]).not.toEqual(CHAR_BACK_FRAMES[i]);
      // rows 0-6 are the head; rows 7+ (body and legs) are shared
      expect(CHAR_FRONT_FRAMES[i].slice(7)).toEqual(CHAR_BACK_FRAMES[i].slice(7));
    }
  });
});

describe('palette', () => {
  it('adds the department shirt colour to every map', () => {
    for (const shirt of ['#22D3EE', '#F59E0B', '#8B5CF6']) {
      const palette = spritePalette(CHAR_FRONT_FRAMES[0], shirt);
      expect(palette.b).toBe(shirt);
      expect(palette.l).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.o).toBe(SPRITE_PALETTE.o);
    }
  });

  it('lightens deterministically and stays a valid hex', () => {
    const a = lighten('#112233', 0.5);
    expect(a).toBe(lighten('#112233', 0.5));
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
    expect(a).not.toBe('#112233');
    expect(lighten('not-a-colour', 0.5)).toBe('not-a-colour');
  });

  it('throws when a map asks for a colour nobody defined', () => {
    expect(() => spritePalette(['zz'], '#22D3EE')).toThrow(/no colour for z/);
  });
});

describe('directionFrames', () => {
  it('returns four frames for every facing', () => {
    for (const dir of ['south', 'north', 'east', 'west'] as const) {
      expect(directionFrames(dir).frames.length, dir).toBe(4);
    }
  });

  it('mirrors only the sideways facing', () => {
    expect(directionFrames('east').flipX).toBe(true);
    expect(directionFrames('west').flipX).toBe(false);
    expect(directionFrames('south').flipX).toBe(false);
    expect(directionFrames('north').frames[0]).toBe(CHAR_BACK_FRAMES[0]);
  });
});

describe('spriteDataUrl', () => {
  it('never throws, with or without a canvas', () => {
    const out = spriteDataUrl(CHAR_FRONT_FRAMES[0], spritePalette(CHAR_FRONT_FRAMES[0], '#22D3EE'));
    expect(out === null || out.startsWith('data:image/png')).toBe(true);
  });
});

describe('2D world wiring', () => {
  const map = readFileSync(fileURLToPath(new URL('../Map.tsx', import.meta.url)), 'utf8');
  const avatar = readFileSync(fileURLToPath(new URL('../Avatar.tsx', import.meta.url)), 'utf8');
  const indexCss = readFileSync(fileURLToPath(new URL('../../../index.css', import.meta.url)), 'utf8');

  it('draws the street strip from the shared traffic module', () => {
    expect(map).toContain('streetTraffic');
    expect(map).toContain('id="street-strip"');
    expect(map).toContain('<StreetStrip />');
  });

  it('floors the plan on 16 px pixel tiles', () => {
    expect(map).toContain('id="pixel-tile"');
    expect(map).toContain('width="16" height="16"');
  });

  it('paints agents as sprites instead of emoji-only pawns', () => {
    expect(avatar).toContain('spriteDataUrl');
    expect(avatar).toContain('sprite-cycle');
    // emoji path stays as the no-canvas fallback
    expect(avatar).toContain('agent.avatar');
  });

  it('defines the shared four-frame cycle that ECO can disable', () => {
    expect(indexCss).toContain('@keyframes sprite-cycle');
    expect(indexCss).toContain('.sprite-cycle');
    expect(indexCss).toContain('step-end');
  });
});
