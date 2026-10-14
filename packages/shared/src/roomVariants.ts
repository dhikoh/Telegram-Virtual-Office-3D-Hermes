/**
 * Tahap 17 — bentuk denah, lantai, dan partisi per ruangan (Rule 9.1).
 *
 * Owner: "Bentuk Lantai sangat kaku tidak seperti ruangan, selain itu tiap
 * ruangan tampak sama." Both renderers read THIS table and nothing else:
 *
 *  - `shape`     — the footprint. Corner cuts as fractions of the room's own
 *                  width/depth, so the very same numbers become an SVG polygon
 *                  in Map.tsx and 2-3 boxes in Furniture.tsx. No renderer
 *                  declares a footprint of its own.
 *  - `floor`     — the surface *function* (what the room is for) plus the
 *                  procedural pattern parameters that paint it (tile size,
 *                  line, accent). Finance cannot end up looking like Social.
 *  - `partition` — glazing style along the room's front edge.
 *
 * Light world only (docs/DESIGN_DIRECTION.md 3.1, 7.1): every colour below is
 * a light-surface token, so the theme guard has nothing to reject.
 */

/** How the room footprint is cut. At least three kinds are in use. */
export type RoomShapeKind = 'rect' | 'rounded' | 'l-shape' | 'notch';

/**
 * How a cut corner is finished:
 *  - `chamfer` — a straight diagonal across the corner (a soft, rounded room);
 *  - `step`    — a square bite out of the corner (an L-shape / notched room);
 *  - `none`    — nothing is cut.
 * Derived from `kind`, never from a renderer's own rule.
 */
export type RoomCutStyle = 'none' | 'chamfer' | 'step';

export interface RoomInsets {
  /** Back-left cut, as a fraction (0..0.5) of the room's width AND depth. */
  tl: number;
  /** Back-right cut. */
  tr: number;
  /** Front-right cut (front = toward the camera in 3D, toward the street in 2D). */
  br: number;
  /** Front-left cut. */
  bl: number;
}

export interface RoomShape {
  kind: RoomShapeKind;
  insets: RoomInsets;
}

/** The one place that decides how a `kind` cuts its corners. */
export function roomCutStyle(kind: RoomShapeKind): RoomCutStyle {
  switch (kind) {
    case 'rounded':
      return 'chamfer';
    case 'l-shape':
    case 'notch':
      return 'step';
    case 'rect':
      return 'none';
  }
}

/**
 * What the room is *for*. Two rooms may share a function (Marketing and
 * Analytics are both labs) but never the whole variant.
 */
export type RoomFloorFunction =
  | 'office'
  | 'studio'
  | 'lab'
  | 'floor-trade'
  | 'vault'
  | 'support-desk'
  | 'people-ops'
  | 'lounge';

/** Render recipe for the floor. Both renderers implement all six. */
export type RoomFloorPattern = 'grid' | 'stripe' | 'checker' | 'dots' | 'ledger' | 'plain';

/** Where the accent band sits: on the front edge, or inset from it. */
export type RoomFloorBand = 'none' | 'front' | 'inset';

export interface RoomFloor {
  fn: RoomFloorFunction;
  pattern: RoomFloorPattern;
  /** Tile pitch: SVG user units in 2D, world units in 3D. */
  tile: number;
  /** Surface fill. */
  base: string;
  /** Tile rule / pattern ink. */
  line: string;
  /** Accent band + pattern highlight. */
  accent: string;
  band: RoomFloorBand;
}

export type RoomPartition = 'none' | 'glass-front' | 'half-wall';

export interface RoomVariant {
  id: string;
  shape: RoomShape;
  floor: RoomFloor;
  partition: RoomPartition;
  /** Outline ink for the 2D plan. */
  stroke: string;
  /** Room label ink for the 2D plan. */
  labelInk: string;
}

/** A local-space rectangle: 2D px (x, z→y) or 3D world units (x, z). */
export interface RoomFootprintBox {
  x: number;
  z: number;
  width: number;
  depth: number;
}

/** Which ink a 3D pattern strip is painted with. */
export type RoomStripTone = 'line' | 'accent';

export interface RoomFloorStrip extends RoomFootprintBox {
  tone: RoomStripTone;
}

/** 2D plan rectangle, same shape as `RoomLayout['pos2d']`. */
export interface PlanRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The neutral world floor. `base` is deliberately the same `#F1F5FA` the 2D
 * plan's `pixel-tile` uses, so the ground the 3D diorama stands on and the
 * ground the 2D map is tiled with are one token (Rule 9.1).
 */
export const WORLD_FLOOR = {
  base: '#F1F5FA',
  line: '#E2E9F2',
  /** gridHelper divisions over the 22 x 24 office plane. */
  divisions: 22,
  /** Diorama shell: back wall + skirting. */
  wall: '#F1F5F9',
  skirting: '#E2E8F0',
} as const;

/**
 * One glazing material for the whole world: the diorama window (Backdrop.tsx)
 * and every room partition (Furniture.tsx / Map.tsx) share these values, so a
 * glass front can never drift from the glass the street is seen through.
 */
export const GLAZING = {
  /** Tinted pane, never a mirror — it must not blacken what is behind it. */
  color: '#E6EEF8',
  /** Window pane opacity. */
  opacity: 0.22,
  /** Full-height room partition. */
  partitionOpacity: 0.25,
  /** Half wall: same pane, more presence. */
  halfWallOpacity: 0.55,
  frame: '#8A97A9',
  /** 2D plan fills. */
  pane: 'rgba(226, 238, 248, 0.55)',
  halfWall: 'rgba(203, 213, 225, 0.8)',
} as const;

/**
 * Room pad footprint in 3D world units (the slab used to be one 4.8 x 3.8
 * box for every department; now that is only the bounding size).
 */
export const ROOM_PAD = { width: 4.8, depth: 3.8 } as const;

/** No cut anywhere — the plain rectangle. */
const RECT: RoomInsets = { tl: 0, tr: 0, br: 0, bl: 0 };

export const ROOM_VARIANTS: Record<string, RoomVariant> = {
  /** The HQ deck: all four corners chamfered, so the console pad reads soft. */
  command: {
    id: 'command',
    shape: { kind: 'rounded', insets: { tl: 0.16, tr: 0.16, br: 0.16, bl: 0.16 } },
    floor: {
      fn: 'office',
      pattern: 'grid',
      tile: 16,
      base: '#F4F7FB',
      line: '#DCE3EC',
      accent: '#F3C88B',
      band: 'front',
    },
    partition: 'glass-front',
    stroke: '#C9D3E2',
    labelInk: '#B45309',
  },
  /** Studio: the back-left and front-left corners are open, an L-shaped room. */
  social: {
    id: 'social',
    shape: { kind: 'l-shape', insets: { tl: 0.18, tr: 0, br: 0, bl: 0.3 } },
    floor: {
      fn: 'studio',
      pattern: 'dots',
      tile: 18,
      base: '#F7F4FD',
      line: '#E2DAF6',
      accent: '#C4B5FD',
      band: 'inset',
    },
    partition: 'none',
    stroke: '#D6DEEA',
    labelInk: '#6D28D9',
  },
  /** Lab: both back corners notched — a stepped rear wall. */
  marketing: {
    id: 'marketing',
    shape: { kind: 'notch', insets: { tl: 0.18, tr: 0.18, br: 0, bl: 0 } },
    floor: {
      fn: 'lab',
      pattern: 'checker',
      tile: 12,
      base: '#F3F8FD',
      line: '#D8E6F4',
      accent: '#93C5FD',
      band: 'front',
    },
    partition: 'glass-front',
    stroke: '#D6DEEA',
    labelInk: '#64748B',
  },
  /** Trading floor: back-right and front-right cut, the aisle runs down the right. */
  sales: {
    id: 'sales',
    shape: { kind: 'l-shape', insets: { tl: 0, tr: 0.18, br: 0.3, bl: 0 } },
    floor: {
      fn: 'floor-trade',
      pattern: 'stripe',
      tile: 14,
      base: '#F2FAF6',
      line: '#D6EDE2',
      accent: '#6EE7B7',
      band: 'front',
    },
    partition: 'half-wall',
    stroke: '#D6DEEA',
    labelInk: '#64748B',
  },
  /** Data lab: opposite corners cut, a twisted footprint — not a box. */
  analytics: {
    id: 'analytics',
    shape: { kind: 'notch', insets: { tl: 0.18, tr: 0, br: 0.3, bl: 0 } },
    floor: {
      fn: 'lab',
      pattern: 'grid',
      tile: 10,
      base: '#F1F7FC',
      line: '#D2E3F2',
      accent: '#7DD3FC',
      band: 'inset',
    },
    partition: 'glass-front',
    stroke: '#D6DEEA',
    labelInk: '#64748B',
  },
  /** Vault: deliberately the only true rectangle — solid by design. */
  finance: {
    id: 'finance',
    shape: { kind: 'rect', insets: { ...RECT } },
    floor: {
      fn: 'vault',
      pattern: 'ledger',
      tile: 10,
      base: '#FBF6EA',
      line: '#EFE2C4',
      accent: '#E0A62B',
      band: 'front',
    },
    partition: 'half-wall',
    stroke: '#E4D9BE',
    labelInk: '#92610E',
  },
  /** Support desk: softly chamfered, shallower than the command deck. */
  support: {
    id: 'support',
    shape: { kind: 'rounded', insets: { tl: 0.1, tr: 0.1, br: 0.1, bl: 0.1 } },
    floor: {
      fn: 'support-desk',
      pattern: 'dots',
      tile: 14,
      base: '#F6F4FD',
      line: '#E4DEF7',
      accent: '#A78BFA',
      band: 'front',
    },
    partition: 'none',
    stroke: '#D6DEEA',
    labelInk: '#64748B',
  },
  /** People ops: one big front-left cut — that corner is the recruitment door. */
  hr: {
    id: 'hr',
    shape: { kind: 'l-shape', insets: { tl: 0, tr: 0, br: 0, bl: 0.3 } },
    floor: {
      fn: 'people-ops',
      pattern: 'stripe',
      tile: 20,
      base: '#FDF3F5',
      line: '#F6DDE3',
      accent: '#FDA4AF',
      band: 'inset',
    },
    partition: 'glass-front',
    stroke: 'rgba(124, 92, 252, 0.5)',
    labelInk: '#6D28D9',
  },
  /**
   * Shared areas. They are not departments, but they are rooms on the same
   * plan, so they read the same table instead of inventing their own look.
   */
  lounge: {
    id: 'lounge',
    shape: { kind: 'rect', insets: { ...RECT } },
    floor: {
      fn: 'lounge',
      pattern: 'grid',
      tile: 16,
      base: WORLD_FLOOR.base,
      line: WORLD_FLOOR.line,
      accent: '#C4B5FD',
      band: 'inset',
    },
    partition: 'none',
    stroke: 'rgba(124, 92, 252, 0.45)',
    labelInk: '#6D28D9',
  },
  approvalGate: {
    id: 'approvalGate',
    shape: { kind: 'rect', insets: { ...RECT } },
    floor: {
      fn: 'office',
      pattern: 'stripe',
      tile: 12,
      base: '#FDF7EC',
      line: 'rgba(180, 83, 9, 0.14)',
      accent: '#F0B429',
      band: 'front',
    },
    partition: 'none',
    stroke: 'rgba(251, 191, 36, 0.45)',
    labelInk: '#7C2D12',
  },
};

/**
 * Sensible default for an id that is not in the table: a plain office room
 * with no cut and no glazing. Tahap 10 lets departments be custom, so this
 * must never be `undefined`.
 */
export const NEUTRAL_ROOM_VARIANT: RoomVariant = {
  id: 'neutral',
  shape: { kind: 'rect', insets: { ...RECT } },
  floor: {
    fn: 'office',
    pattern: 'grid',
    tile: 16,
    base: '#F4F7FB',
    line: '#DCE3DE',
    accent: '#C3CCDA',
    band: 'none',
  },
  partition: 'none',
  stroke: '#D6DEEA',
  labelInk: '#64748B',
};

/** Variant for a department (or 'lounge' / 'approvalGate'); never undefined. */
export function roomVariant(dept: string): RoomVariant {
  return ROOM_VARIANTS[dept] ?? NEUTRAL_ROOM_VARIANT;
}

/**
 * Footprint outline in 2D canvas pixels, clockwise from the back-left corner.
 * A rectangle yields 4 points; a `chamfer` cut adds one more per cut corner
 * and a `step` cut adds two, and consecutive duplicates are dropped — so
 * `rect` really is a plain 4-point polygon.
 *
 * Each corner is described by the direction back along its incoming edge and
 * forward along its outgoing edge, both scaled by the corner's own inset
 * (x by width, y by height). That single description is what makes the shape
 * data rather than four hand-drawn cases.
 */
export function roomShapePoints(shape: RoomShape, rect: PlanRect): Array<[number, number]> {
  const { x, y, width: w, height: h } = rect;
  const { tl, tr, br, bl } = shape.insets;
  const cut = roomCutStyle(shape.kind);
  const corners = [
    { inset: tl, cx: x, cy: y, back: [0, 1], fwd: [1, 0] },
    { inset: tr, cx: x + w, cy: y, back: [-1, 0], fwd: [0, 1] },
    { inset: br, cx: x + w, cy: y + h, back: [0, -1], fwd: [-1, 0] },
    { inset: bl, cx: x, cy: y + h, back: [1, 0], fwd: [0, -1] },
  ] as const;
  const raw: Array<[number, number]> = [];

  for (const { inset, cx, cy, back, fwd } of corners) {
    if (cut === 'none' || inset <= 0) {
      raw.push([cx, cy]);
      continue;
    }
    const before: [number, number] = [cx + back[0] * inset * w, cy + back[1] * inset * h];
    const after: [number, number] = [cx + fwd[0] * inset * w, cy + fwd[1] * inset * h];
    raw.push(before);
    if (cut === 'step') {
      const dx = fwd[0] !== 0 ? fwd[0] : back[0];
      const dy = back[1] !== 0 ? back[1] : fwd[1];
      raw.push([cx + dx * inset * w, cy + dy * inset * h]);
    }
    raw.push(after);
  }

  return raw.filter(([px, py], i) => {
    const [qx, qy] = raw[(i + raw.length - 1) % raw.length];
    return Math.abs(px - qx) > 1e-6 || Math.abs(py - qy) > 1e-6;
  });
}

/**
 * The same footprint as 1-3 axis-aligned rectangles in local space, centred on
 * the room origin: a back strip, a full-width middle, and a front strip.
 *
 * `+z` is the front (toward the camera in 3D, toward the street in 2D) and the
 * insets are read exactly as `roomShapePoints` reads them, so the two
 * renderers cannot drift: a `rect` is one box, an L or a notch is three, and
 * no box ever pokes outside the outline (a chamfered corner stays open rather
 * than growing a square ear).
 */
export function roomShapeBoxes(shape: RoomShape, width: number, depth: number): RoomFootprintBox[] {
  const { tl, tr, br, bl } = shape.insets;
  const topDepth = Math.max(tl, tr) * depth;
  const bottomDepth = Math.max(bl, br) * depth;
  const halfW = width / 2;
  const halfD = depth / 2;
  const out: RoomFootprintBox[] = [];

  const push = (x0: number, x1: number, z0: number, z1: number) => {
    if (x1 - x0 <= 1e-6 || z1 - z0 <= 1e-6) return;
    out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: x1 - x0, depth: z1 - z0 });
  };

  push(-halfW + tl * width, halfW - tr * width, -halfD, -halfD + topDepth);
  push(-halfW, halfW, -halfD + topDepth, halfD - bottomDepth);
  push(-halfW + bl * width, halfW - br * width, halfD - bottomDepth, halfD);
  return out;
}

/** Surviving front edge of the footprint, in 2D canvas pixels. */
export function roomFrontEdge(
  shape: RoomShape,
  rect: PlanRect
): { x: number; y: number; width: number } {
  const { bl, br } = shape.insets;
  return {
    x: rect.x + bl * rect.width,
    y: rect.y + rect.height,
    width: rect.width * (1 - bl - br),
  };
}

/** Surviving front edge of the footprint, in 3D local world units. */
export function roomFrontEdge3d(
  shape: RoomShape,
  width: number,
  depth: number
): { x: number; z: number; width: number } {
  const { bl, br } = shape.insets;
  return { x: ((bl - br) * width) / 2, z: depth / 2, width: width * (1 - bl - br) };
}

/** Accent band across the front of a room, in 2D canvas pixels. */
export function roomFloorBand2d(
  floor: RoomFloor,
  shape: RoomShape,
  rect: PlanRect
): PlanRect | null {
  if (floor.band === 'none') return null;
  const front = roomFrontEdge(shape, rect);
  const inset = floor.band === 'inset';
  return {
    x: front.x + (inset ? 4 : 2),
    y: rect.y + rect.height - (inset ? 6 : 4),
    width: Math.max(4, front.width - (inset ? 8 : 4)),
    height: inset ? 2 : 3,
  };
}

/**
 * Thin procedural pattern strips for the 3D pad — the 3D counterpart of the
 * 2D `<pattern>` bodies, and the same six recipes: grid, stripe, checker,
 * dots, ledger, plain. At most four small boxes per room, so a phone still
 * draws the whole diorama in a handful of draw calls (Rule 9.2 / REQ-114).
 * Each strip carries its own tone, so the renderer paints an ink rather than
 * choosing a colour.
 */
export function roomFloorStrips(floor: RoomFloor, width: number, depth: number): RoomFloorStrip[] {
  const w = width - 0.6;
  const d = depth - 0.6;
  const across = (z: number, tone: RoomStripTone = 'line'): RoomFloorStrip => ({
    x: 0,
    z,
    width: w,
    depth: 0.05,
    tone,
  });
  const along = (x: number, tone: RoomStripTone = 'line'): RoomFloorStrip => ({
    x,
    z: 0,
    width: 0.05,
    depth: d,
    tone,
  });
  const dot = (x: number, z: number): RoomFloorStrip => ({
    x,
    z,
    width: 0.18,
    depth: 0.18,
    tone: 'accent',
  });
  const qw = w / 4;
  const qd = d / 4;

  switch (floor.pattern) {
    case 'grid':
      return [across(0), along(0)];
    case 'stripe':
      return [across(-qd), across(0), across(qd, 'accent')];
    case 'checker':
      return [
        { x: -qw, z: -qd, width: w / 2, depth: d / 2, tone: 'line' },
        { x: qw, z: qd, width: w / 2, depth: d / 2, tone: 'accent' },
      ];
    case 'dots':
      return [dot(-qw, -qd), dot(qw, -qd), dot(-qw, qd), dot(qw, qd)];
    case 'ledger':
      return [across(-qd), across(0), across(qd), along(-qw * 1.4, 'accent')];
    case 'plain':
      return [];
  }
}

/** Accent band rectangle in 3D local space (front edge, or inset from it). */
export function roomFloorBand3d(
  floor: RoomFloor,
  shape: RoomShape,
  width: number,
  depth: number
): RoomFootprintBox | null {
  if (floor.band === 'none') return null;
  const front = roomFrontEdge3d(shape, width, depth);
  const inset = floor.band === 'inset';
  return {
    x: front.x,
    z: depth / 2 - (inset ? 0.42 : 0.2),
    width: Math.max(0.4, front.width - (inset ? 0.7 : 0.3)),
    depth: inset ? 0.08 : 0.14,
  };
}
