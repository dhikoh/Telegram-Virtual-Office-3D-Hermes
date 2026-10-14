/**
 * Tahap 17 acceptance — denah & lantai bervariasi (2D + 3D satu tabel).
 *
 * Owner: "Bentuk Lantai sangat kaku tidak seperti ruangan, selain itu tiap
 * ruangan tampak sama." The fix has to be real variation, not decoration, and
 * it has to live in ONE table (Rule 9.1) so the 2D plan and the 3D diorama
 * cannot disagree. These assertions cover both halves: the shared data itself,
 * and the fact that each renderer reads it instead of drawing its own room.
 *
 * Source-assertion style, same as map-defects.test.ts / layout-collisions.test.ts:
 * the geometry is asserted against the source, not by rendering WebGL.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ROOM_LAYOUTS,
  ROOM_VARIANTS,
  NEUTRAL_ROOM_VARIANT,
  GLAZING,
  roomVariant,
  roomShapePoints,
  roomShapeBoxes,
  roomCutStyle,
} from '@hermes-office/shared';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const map = read('../Map.tsx');
const furniture = read('../office-3d/Furniture.tsx');
const scene = read('../office-3d/Scene.tsx');
const backdrop = read('../office-3d/Backdrop.tsx');

/** Every department id the floor plan actually draws. */
const DEPT_IDS = Object.keys(ROOM_LAYOUTS);

describe('roomVariants — one table for every department', () => {
  it('has a variant for every department in ROOM_LAYOUTS', () => {
    expect(DEPT_IDS.length).toBe(8);
    for (const id of DEPT_IDS) {
      const variant = ROOM_VARIANTS[id];
      expect(variant, `no variant for "${id}"`).toBeDefined();
      expect(variant.id).toBe(id);
      expect(variant.floor.tile).toBeGreaterThan(0);
      expect(variant.floor.base).toMatch(/^#|^rgba/);
    }
  });

  it('never returns undefined, even for a custom department id', () => {
    // Tahap 10 lets departments be created by the user, so the lookup must
    // fall back to a sensible room rather than blow up a renderer.
    const unknown = roomVariant('warehouse-42');
    expect(unknown).toBeDefined();
    expect(unknown).toBe(NEUTRAL_ROOM_VARIANT);
    expect(unknown.shape.kind).toBe('rect');
    expect(unknown.partition).toBe('none');
  });

  it('uses at least three distinct footprint shapes, and not one flat rect', () => {
    const kinds = new Set(DEPT_IDS.map((id) => roomVariant(id).shape.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    // A rigid plan is exactly what the owner complained about: the majority
    // of rooms must be cut, so a single rect room (the vault) stays the
    // exception rather than the rule.
    const cut = DEPT_IDS.filter((id) => roomVariant(id).shape.kind !== 'rect');
    expect(cut.length).toBeGreaterThanOrEqual(6);
  });

  it('gives at least six distinct floor functions with distinct recipes', () => {
    const fns = new Set(DEPT_IDS.map((id) => roomVariant(id).floor.fn));
    expect(fns.size).toBeGreaterThanOrEqual(6);

    // Finance (vault) and Social (studio) are the pair the owner called out
    // as identical: they must differ in function, pattern, ink and tile size.
    const vault = roomVariant('finance').floor;
    const studio = roomVariant('social').floor;
    expect(vault.fn).not.toBe(studio.fn);
    expect(vault.pattern).not.toBe(studio.pattern);
    expect(vault.base).not.toBe(studio.base);
    expect(vault.tile).not.toBe(studio.tile);
  });

  it('declares a partition style per room, from the shared enum', () => {
    const styles = new Set(DEPT_IDS.map((id) => roomVariant(id).partition));
    expect(styles.size).toBeGreaterThanOrEqual(2);
    for (const style of styles) {
      expect(['none', 'glass-front', 'half-wall']).toContain(style);
    }
    expect(GLAZING.partitionOpacity).toBeGreaterThan(0);
    expect(GLAZING.partitionOpacity).toBeLessThan(1);
  });

  it('turns the shape data into a polygon and into 3D boxes consistently', () => {
    const rect = { x: 0, y: 0, width: 100, height: 80 };
    // A rect is a plain 4-point polygon; a cut shape is not.
    const plain = roomShapePoints(roomVariant('finance').shape, rect);
    expect(plain).toHaveLength(4);
    const cut = roomShapePoints(roomVariant('social').shape, rect);
    expect(cut.length).toBeGreaterThan(4);
    // Cut corners never leave the original rectangle.
    for (const [px, py] of cut) {
      expect(px).toBeGreaterThanOrEqual(rect.x);
      expect(px).toBeLessThanOrEqual(rect.x + rect.width);
      expect(py).toBeGreaterThanOrEqual(rect.y);
      expect(py).toBeLessThanOrEqual(rect.y + rect.height);
    }

    // 3D: one slab only where nothing is cut; more than one where it is.
    const rectBoxes = roomShapeBoxes(roomVariant('finance').shape, 4.8, 3.8);
    expect(rectBoxes).toHaveLength(1);
    expect(roomShapeBoxes(roomVariant('marketing').shape, 4.8, 3.8).length).toBeGreaterThan(1);
    expect(roomCutStyle('rounded')).toBe('chamfer');
    expect(roomCutStyle('notch')).toBe('step');
    expect(roomCutStyle('rect')).toBe('none');
  });
});

describe('2D plan — Map.tsx draws the shared variant', () => {
  it('consumes roomVariant / roomShapePoints / GLAZING from the shared table', () => {
    expect(map).toContain('roomVariant');
    expect(map).toContain('roomShapePoints');
    expect(map).toContain('roomFrontEdge');
    expect(map).toContain('GLAZING');
    expect(map).toContain("from '@hermes-office/shared'");
    // One shell component for every room: no room draws its own polygon.
    expect(map).toContain('const RoomShell');
    expect(map).toContain('<polygon points={points}');
  });

  it('defines a floor pattern per room instead of one shared fill', () => {
    expect(map).toContain('id={`room-floor-${id}`}');
    expect(map).toContain('floorPatternBody');
    // The Tahap 5 pixel tile the whole plan sits on is untouched.
    expect(map).toContain('id="pixel-tile"');
    expect(map).toContain('fill="url(#pixel-tile)"');
    // The old one-fill-fits-all room rects are gone.
    expect(map).not.toContain('fill="#FBFDFF"');
  });

  it('keeps the street strip, the room ids and the tap targets intact', () => {
    expect(map).toContain('<StreetStrip />');
    expect(map).toContain('id="street-strip"');
    expect(map).toContain('streetTraffic');
    for (const id of ['command', 'social', 'marketing', 'sales', 'analytics', 'finance', 'support', 'hr', 'lounge']) {
      expect(map, `room-${id} group missing`).toContain(`id="room-${id}"`);
    }
    expect(map).toContain('left-[96px] top-[312px]');
    expect(map).toContain('showLabel={agent.status !== \'idle\' || agent.id === selectedAgentId}');
    expect(map).toContain('MAP_ROOM_IDS.includes(focusKey)');
  });
});

describe('3D diorama — same table, same rooms', () => {
  it('builds each pad from roomShapeBoxes instead of one flat slab', () => {
    expect(furniture).toContain('roomShapeBoxes');
    expect(furniture).toContain('roomVariant(room.id)');
    expect(furniture).toContain('ROOM_PAD');
    // The single 4.8 x 3.8 slab every department used to share is gone.
    expect(furniture).not.toContain('boxGeometry args={[4.8, 0.04, 3.8]}');
    expect(furniture).toContain('boxes.map(');
  });

  it('paints the pad with the room floor recipe and adds glazed partitions', () => {
    expect(furniture).toContain('roomFloorStrips');
    expect(furniture).toContain('roomFloorBand3d');
    expect(furniture).toContain('color={variant.floor.base}');
    expect(furniture).toContain('roomFrontEdge3d');
    expect(furniture).toContain('GLAZING.color');
    expect(furniture).toContain('transparent');
    expect(furniture).toContain('depthWrite={false}');
    // Taps still reach the room: the handler survived the reshape.
    expect(furniture).toContain('onSelectRoom?.(nameKey)');
    // The additive CC0 props are untouched.
    expect(furniture).toContain('<GLTFurniture />');
  });

  it('keeps the world floor, the glass and the palette on shared light-world tokens', () => {
    expect(scene).toContain('WORLD_FLOOR');
    expect(scene).toContain('color={WORLD_FLOOR.base}');
    expect(scene).toContain('WORLD_FLOOR.divisions');
    expect(backdrop).toContain('WORLD_FLOOR.wall');
    expect(backdrop).toContain('GLAZING.frame');
    expect(backdrop).toContain('opacity={GLAZING.opacity}');

    // theme-guard.test.ts rejects these across the web sources; assert them
    // here too so a Tahap 17 edit cannot slip one in unnoticed.
    const banned = ['#070B14', '#0B132B', '#0F172A', '#1E293B', '#22D3EE'];
    for (const file of [map, furniture, scene, backdrop]) {
      for (const colour of banned) {
        expect(file, `banned colour ${colour} found`).not.toContain(colour);
      }
    }
  });
});
