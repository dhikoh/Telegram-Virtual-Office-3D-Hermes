/**
 * Tahap 5 — pixel-art sprites stored as text maps (DESIGN_DIRECTION.md 4).
 *
 * One sprite = an array of strings of equal width, plus a palette. Nothing is
 * drawn by hand in a binary file: the strings *are* the asset, which is what
 * keeps Rule 9.4 (zero external assets) true for the 2D world too, and lets
 * the frames be unit-tested like any other data.
 *
 * Characters are 10x15 cells; four walk frames per facing (legs together,
 * apart, one step, mid step) = 16 effective frames over the four directions,
 * with east/west reusing the front view mirrored.
 */

export type SpriteMap = readonly string[];

/** Every row of every map below is exactly this many cells wide. */
export const SPRITE_CELLS = 10;
/** Character height in cells; vehicles are 5. */
export const CHAR_ROWS = 15;

/**
 * Fixed palette keys. `b` (body/shirt), `l` (its lighter shade) and `c`
 * (vehicle body) are NOT here: they come from the department colour of the
 * wearer, or from streetTraffic() for the cars in the strip.
 */
export const SPRITE_PALETTE: Readonly<Record<string, string>> = {
  o: '#2B3444', // outline — every silhouette edge
  h: '#4B3A2A', // hair
  s: '#F2CBA6', // skin
  e: '#1F2937', // eye
  p: '#4B5563', // trousers
  d: '#374151', // shoes
  w: '#BFE3F5', // glass
  k: '#1F2937', // tyre / trim
};

/** Facing south — face, eyes and all four leg poses. */
export const CHAR_FRONT_FRAMES: readonly SpriteMap[] = [
  [
    '...oooo...',
    '..ohhhho..',
    '..ohhhho..',
    '..osssso..',
    '..oesseo..',
    '..osssso..',
    '...osso...',
    '.ollllllo.',
    '.obbbbbbo.',
    '..obbbbo..',
    '..opp.ppo.',
    '..opp.ppo.',
    '..opp.ppo.',
    '..dd..dd..',
    '..........',
  ],
  [
    '...oooo...',
    '..ohhhho..',
    '..ohhhho..',
    '..osssso..',
    '..oesseo..',
    '..osssso..',
    '...osso...',
    '.ollllllo.',
    '.obbbbbbo.',
    '..obbbbo..',
    '..oppppo..',
    '..oppppo..',
    '..oppppo..',
    '..dd..dd..',
    '..........',
  ],
  [
    '...oooo...',
    '..ohhhho..',
    '..ohhhho..',
    '..osssso..',
    '..oesseo..',
    '..osssso..',
    '...osso...',
    '.ollllllo.',
    '.obbbbbbo.',
    '..obbbbo..',
    '..opp.ppo.',
    '..opp.ppo.',
    '..opp.ppo.',
    '..pp..pp..',
    '..........',
  ],
  [
    '...oooo...',
    '..ohhhho..',
    '..ohhhho..',
    '..osssso..',
    '..oesseo..',
    '..osssso..',
    '...osso...',
    '.ollllllo.',
    '.obbbbbbo.',
    '..obbbbo..',
    '..oppppo..',
    '..opp.ppo.',
    '..opp.ppo.',
    '..dd..dd..',
    '..........',
  ],
];

/** Facing north — same body, back of the head. */
export const CHAR_BACK_FRAMES: readonly SpriteMap[] = [
  [
    '...oooo...',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '...ohho...',
    '.ollllllo.',
    '.obbbbbbo.',
    '..obbbbo..',
    '..opp.ppo.',
    '..opp.ppo.',
    '..opp.ppo.',
    '..dd..dd..',
    '..........',
  ],
  [
    '...oooo...',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '...ohho...',
    '.ollllllo.',
    '.obbbbbbo.',
    '..obbbbo..',
    '..oppppo..',
    '..oppppo..',
    '..oppppo..',
    '..dd..dd..',
    '..........',
  ],
  [
    '...oooo...',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '...ohho...',
    '.ollllllo.',
    '.obbbbbbo.',
    '..obbbbo..',
    '..opp.ppo.',
    '..opp.ppo.',
    '..opp.ppo.',
    '..pp..pp..',
    '..........',
  ],
  [
    '...oooo...',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '..ohhhho..',
    '...ohho...',
    '.ollllllo.',
    '.obbbbbbo.',
    '..obbbbo..',
    '..oppppo..',
    '..opp.ppo.',
    '..opp.ppo.',
    '..dd..dd..',
    '..........',
  ],
];

/** Street strip: 10x5 car. Body colour comes from streetTraffic(). */
export const VEHICLE_CAR: SpriteMap = [
  '..oooo....',
  '.owwwwo...',
  'occcccco..',
  'occcccco..',
  '.kk..kk...',
];

/** Street strip: 10x5 bus / van. */
export const VEHICLE_BUS: SpriteMap = [
  'owwwwwwwwo',
  'owwwwwwwwo',
  'occcccccco',
  'occcccccco',
  '.kk..kk...',
];

export interface SpriteGrid {
  width: number;
  height: number;
}

/** Dimensions of a map. Throws on a ragged map — a typo must fail loudly. */
export function spriteGrid(map: SpriteMap): SpriteGrid {
  if (map.length === 0) throw new Error('sprite: empty map');
  const width = map[0].length;
  if (width === 0) throw new Error('sprite: zero-width map');
  for (const [i, row] of map.entries()) {
    if (row.length !== width) {
      throw new Error(`sprite: row ${i} is ${row.length} cells, expected ${width}`);
    }
  }
  return { width, height: map.length };
}

/** Every palette key a map actually uses ('.' is transparency, not a key). */
export function usedKeys(map: SpriteMap): Set<string> {
  const keys = new Set<string>();
  for (const row of map) for (const cell of row) if (cell !== '.') keys.add(cell);
  return keys;
}

/** Lighten a hex colour by 0..1 (used for the shirt's lit side). */
export function lighten(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const step = (v: number) => Math.min(255, Math.round(v + (255 - v) * amount));
  const r = step((n >> 16) & 255);
  const g = step((n >> 8) & 255);
  const b = step(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Full palette for one sprite: fixed keys plus the wearer's shirt colour. */
export function spritePalette(map: SpriteMap, shirt?: string): Record<string, string> {
  const palette: Record<string, string> = { ...SPRITE_PALETTE };
  const body = shirt ?? '#94A3B8';
  palette.b = body;
  palette.l = lighten(body, 0.45);
  palette.c = body; // vehicle body uses the same slot
  const missing = [...usedKeys(map)].filter((k) => palette[k] === undefined);
  if (missing.length > 0) throw new Error(`sprite: no colour for ${missing.join(', ')}`);
  return palette;
}

export type SpriteDirection = 'south' | 'north' | 'east' | 'west';

/** Four walk frames plus the horizontal flip each facing needs. */
export function directionFrames(direction: SpriteDirection): {
  frames: readonly SpriteMap[];
  flipX: boolean;
} {
  if (direction === 'north') return { frames: CHAR_BACK_FRAMES, flipX: false };
  if (direction === 'east') return { frames: CHAR_FRONT_FRAMES, flipX: true };
  if (direction === 'west') return { frames: CHAR_FRONT_FRAMES, flipX: false };
  return { frames: CHAR_FRONT_FRAMES, flipX: false };
}
