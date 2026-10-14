/**
 * Tahap 17 — the committed 3D character model ids.
 *
 * Shared on purpose: the server validates `avatar_style.character` against
 * this list (nothing else may be stored), and the web app turns the same ids
 * into URLs, picker labels and department defaults. One list, no duplication.
 *
 * The files themselves live in `apps/web/public/assets/3d/character/`
 * (Kenney "Mini Characters", CC0) with provenance in that folder's
 * PROVENANCE.md. This module knows nothing about HTTP — only ids.
 */

export const CHARACTER_MODEL_IDS = [
  'female-a',
  'female-b',
  'female-c',
  'female-d',
  'female-e',
  'female-f',
  'male-a',
  'male-b',
  'male-c',
  'male-d',
  'male-e',
  'male-f',
] as const;

export type CharacterModelId = (typeof CHARACTER_MODEL_IDS)[number];

export function isCharacterModelId(value: unknown): value is CharacterModelId {
  return typeof value === 'string' && (CHARACTER_MODEL_IDS as readonly string[]).includes(value);
}
