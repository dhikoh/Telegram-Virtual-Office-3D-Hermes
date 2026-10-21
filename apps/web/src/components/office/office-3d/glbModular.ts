/**
 * KayKit: Prototype Bits 1.0 — Modular 3D Office Architecture & Furniture (CC0).
 *
 * Models in public/assets/3d/modular/, self-contained GLBs with embedded atlas texture.
 * Zero external CDN/network requests at runtime (Rule 9.4).
 */

const MODULAR_BASE = '/assets/3d/modular/';

export const MODULAR_IDS = [
  'wall',
  'wall_window',
  'wall_doorway',
  'wall_half',
  'floor_tile',
  'pillar',
  'table_work',
  'table_meeting',
  'door',
  'box_archive',
] as const;

export type ModularModelId = (typeof MODULAR_IDS)[number];

export const MODULAR_URLS: Record<ModularModelId, string> = {
  wall: `${MODULAR_BASE}wall.glb`,
  wall_window: `${MODULAR_BASE}wall_window.glb`,
  wall_doorway: `${MODULAR_BASE}wall_doorway.glb`,
  wall_half: `${MODULAR_BASE}wall_half.glb`,
  floor_tile: `${MODULAR_BASE}floor_tile.glb`,
  pillar: `${MODULAR_BASE}pillar.glb`,
  table_work: `${MODULAR_BASE}table_work.glb`,
  table_meeting: `${MODULAR_BASE}table_meeting.glb`,
  door: `${MODULAR_BASE}door.glb`,
  box_archive: `${MODULAR_BASE}box_archive.glb`,
};
