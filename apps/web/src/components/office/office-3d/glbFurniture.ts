/**
 * Tahap 13 — CC0 3D furniture manifest (docs/DESIGN_DIRECTION.md §13, Rule 9.4).
 *
 * The GLB files live in `public/assets/3d/furniture/`, so Vite copies them to
 * `dist/assets/3d/furniture/` verbatim: they are served as static files by the
 * app's own origin, never bundled into a JS chunk (Rule 9.2 budget) and never
 * fetched from a CDN (Rule 9.4 / CSP: zero remote 3D requests).
 *
 * Provenance and licences: docs/ASSETS.md.
 */

const FURNITURE_BASE = '/assets/3d/furniture/';

export const FURNITURE_IDS = [
  'bookcaseOpen',
  'chairModernCushion',
  'lampRoundFloor',
  'loungeSofa',
  'pottedPlant',
  'sideTable',
] as const;

export type FurnitureModelId = (typeof FURNITURE_IDS)[number];

export const FURNITURE_URLS: Record<FurnitureModelId, string> = {
  bookcaseOpen: `${FURNITURE_BASE}bookcaseOpen.glb`,
  chairModernCushion: `${FURNITURE_BASE}chairModernCushion.glb`,
  lampRoundFloor: `${FURNITURE_BASE}lampRoundFloor.glb`,
  loungeSofa: `${FURNITURE_BASE}loungeSofa.glb`,
  pottedPlant: `${FURNITURE_BASE}pottedPlant.glb`,
  sideTable: `${FURNITURE_BASE}sideTable.glb`,
};
