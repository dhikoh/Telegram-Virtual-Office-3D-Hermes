/**
 * Tahap 16 — Kenney "RPG Urban Pack 1.0" (CC0) 16 px tiles for the 2D street
 * strip (DESIGN_DIRECTION: real pixel art instead of flat rects).
 *
 * The nine PNGs are byte-identical extracts of `Tiles/tile_NNNN.png` from the
 * pack archive — nothing was re-encoded, recoloured or redrawn. Atlas
 * `Tilemap/tilemap.png` is 458×305: 27 columns × 18 rows of 16 px tiles with
 * 1 px gutters, so `index = row * 27 + col`.
 *
 * Every index below was identified from the pixel data (palette + row/column
 * signatures) and then confirmed visually on a 14× nearest-neighbour
 * enlargement:
 *
 * | Index | Row × Col | File                | What the tile actually shows |
 * | ----- | --------- | ------------------- | ---------------------------- |
 * | 441   | r16 × c9  | road-asphalt.png    | Plain dark slate-blue asphalt `#5C6278`, only sparse noise specks, fully opaque, no marking |
 * | 433   | r16 × c1  | road-lane-dash.png  | Same asphalt with one lavender-white `#A09CCA` dash, rows 7–8, cols 3–12 → tiling it repeats the dash every 16 px |
 * | 406   | r15 × c1  | road-edge-top.png   | Asphalt with an unbroken lavender-white line across the full width on row 2 (edge/kerb line at the top of the road) |
 * | 460   | r17 × c1  | road-edge-bottom.png| Asphalt with an unbroken lavender-white line across the full width on row 13 (edge line at the bottom of the road) |
 * | 63    | r2 × c9   | sidewalk-slab.png   | Pale lavender-grey paving `#AAA8BD`, flat for rows 0–9, 4 px checker band rows 10–14, dark `#69717B` gutter/kerb row 15 |
 * | 164   | r6 × c2   | prop-street-lamp.png| Street lamp: pole on the right, curved arm to the left, rectangular light head (178 transparent px) |
 * | 291   | r10 × c21 | prop-tree-planter.png| Small tree with teal canopy in a tan planter box |
 * | 238   | r8 × c22  | prop-bush.png       | Rounded teal bush/canopy with highlight, no base |
 * | 251   | r9 × c8   | prop-hydrant.png    | Red `#C2504D` fire hydrant with a lavender band across the middle |
 *
 * Tiles that were inspected and rejected: 405/432/435/459 (zebra crossings),
 * 414/415 (asphalt with the edge line on row 1 — wrong row for our kerb),
 * 407 (lane dash plus a vertical seam = junction marking), 441/468/466/467
 * (plain asphalt, only 441 kept), 8/10/11/12/13/15/62/64/65/69 (paving with
 * wall edges), 36 (paving with no detail at all — 100 % one colour), 245
 * (bench) and 333 (mailbox) — both fine props, left out to keep the strip
 * quiet. The pack ships **no** standalone kerb tile: no opaque tile combines
 * paving and asphalt, and the only light→dark horizontal step band in the
 * whole atlas is 225 (a dock edge), so the kerb comes from row 15 of
 * `sidewalk-slab.png` plus the flat curb face that was already there.
 *
 * Rule 9.4: local paths only, no remote URL, no JS payload (static files, the
 * same way the GLB furniture is shipped).
 */

/** Static files under `public/`, served from this app's own origin. */
const STREET_BASE = '/assets/2d/street/';

export const STREET_TILES = {
  /** Plain asphalt — the road's base layer. */
  asphalt: 'road-asphalt.png',
  /** Asphalt + one dashed centre-line segment. */
  laneDash: 'road-lane-dash.png',
  /** Asphalt + solid line near the top of the road (kerb line). */
  edgeTop: 'road-edge-top.png',
  /** Asphalt + solid line near the bottom of the road. */
  edgeBottom: 'road-edge-bottom.png',
  /** Sidewalk paving with the checker band and dark gutter row. */
  sidewalk: 'sidewalk-slab.png',
  streetLamp: 'prop-street-lamp.png',
  tree: 'prop-tree-planter.png',
  bush: 'prop-bush.png',
  hydrant: 'prop-hydrant.png',
} as const;

export type StreetTileId = keyof typeof STREET_TILES;

export const streetTileUrl = (id: StreetTileId): string => STREET_BASE + STREET_TILES[id];

export const STREET_TILE_IDS = Object.keys(STREET_TILES) as StreetTileId[];

/**
 * Dressing props along the near sidewalk. `x` is the left edge of the 12 px
 * sprite in canvas units; `StreetStrip` puts their base on the curb line, so
 * they stay inside the strip (y 354..366) and clear of every vehicle lane
 * (LANE_Y 372/396 with the bus half-height 7.5 → nothing above y 364.5).
 */
export interface StreetProp {
  id: StreetTileId;
  x: number;
}

export const STREET_PROPS: StreetProp[] = [
  { id: 'streetLamp', x: 16 },
  { id: 'bush', x: 68 },
  { id: 'hydrant', x: 124 },
  { id: 'tree', x: 180 },
  { id: 'bush', x: 238 },
  { id: 'streetLamp', x: 294 },
  { id: 'tree', x: 346 },
];

/** Prop sprites keep 1:1 aspect (16 → 12, the height of the sidewalk band). */
export const STREET_PROP_SIZE = 12;
