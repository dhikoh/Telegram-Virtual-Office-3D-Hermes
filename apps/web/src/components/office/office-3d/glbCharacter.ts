/**
 * Tahap 15 — CC0 3D character manifest (Quaternius "Ultimate Animated
 * Character Pack", docs/ASSETS.md).
 *
 * Same contract as glbFurniture.ts: the GLBs live in
 * `public/assets/3d/character/`, so Vite copies them to
 * `dist/assets/3d/character/` verbatim — served from the app's own origin,
 * never bundled into a JS chunk (Rule 9.2), never fetched from a CDN
 * (Rule 9.4 / CSP: zero remote 3D requests).
 *
 * One character per department from packages/shared/src/layout.ts (Rule 9.1):
 * the keys below are exactly the 8 department ids, and the office-appropriate
 * source model for each is recorded in CHARACTER_SOURCES for provenance.
 */

import { ROOM_LAYOUTS } from '@hermes-office/shared';

const CHARACTER_BASE = '/assets/3d/character/';

export const CHARACTER_IDS = [
  'command',
  'social',
  'marketing',
  'sales',
  'analytics',
  'finance',
  'support',
  'hr',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_URLS: Record<CharacterId, string> = {
  command: `${CHARACTER_BASE}suitMale.glb`,
  social: `${CHARACTER_BASE}casualFemale.glb`,
  marketing: `${CHARACTER_BASE}kimonoFemale.glb`,
  sales: `${CHARACTER_BASE}casual2Male.glb`,
  analytics: `${CHARACTER_BASE}oldClassyMale.glb`,
  finance: `${CHARACTER_BASE}suitFemale.glb`,
  support: `${CHARACTER_BASE}workerMale.glb`,
  hr: `${CHARACTER_BASE}casual3Female.glb`,
};

/**
 * Source `.gltf` file inside `Ultimate Animated Character Pack - Nov 2019/glTF/`
 * for every character above. Documentation only (PROVENANCE.md mirrors it) —
 * nothing in the app fetches these.
 */
export const CHARACTER_SOURCES: Record<CharacterId, string> = {
  command: 'Suit_Male.gltf',
  social: 'Casual_Female.gltf',
  marketing: 'Kimono_Female.gltf',
  sales: 'Casual2_Male.gltf',
  analytics: 'OldClassy_Male.gltf',
  finance: 'Suit_Female.gltf',
  support: 'Worker_Male.gltf',
  hr: 'Casual3_Female.gltf',
};

/** Animation clips every committed GLB carries (the loader picks by name). */
export const CHARACTER_CLIPS = ['Idle', 'Walk', 'SitDown'] as const;
export type CharacterClipName = (typeof CHARACTER_CLIPS)[number];

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}

/** Department id -> character id, or `null` for anything outside the layout. */
export function characterIdFor(department?: string | null): CharacterId | null {
  if (!department) return null;
  // Same guard the procedural body uses: ids only exist if ROOM_LAYOUTS knows them.
  if (!(department in ROOM_LAYOUTS)) return null;
  return isCharacterId(department) ? department : null;
}
