/**
 * Tahap 17 — CC0 3D character manifest (Kenney "Mini Characters 1.0",
 * docs/ASSETS.md + public/assets/3d/character/PROVENANCE.md).
 *
 * Same contract as glbFurniture.ts: the GLBs live in
 * `public/assets/3d/character/`, so Vite copies them to
 * `dist/assets/3d/character/` verbatim — served from the app's own origin,
 * never bundled into a JS chunk (Rule 9.2), never fetched from a CDN
 * (Rule 9.4 / CSP: zero remote 3D requests).
 *
 * Two orthogonal id spaces, deliberately separate (Rule 9.1 parity):
 *
 *  - CHARACTER_MODEL_IDS — the 12 committed models. This is what an agent
 *    picks as its identity (`avatar_style.character`) and what the loader
 *    resolves to a URL.
 *  - DEPARTMENT_IDS — the 8 office departments from @hermes-office/shared
 *    ROOM_LAYOUTS, each with a default model so a legacy agent (or one that
 *    never picked) still gets a character.
 *
 * An agent's model is `avatar_style.character` when it is a known model id,
 * otherwise the department default. Every accessor returns `null` for
 * anything outside those tables, which is exactly what the procedural robot
 * fallback expects.
 */

import {
  CHARACTER_MODEL_IDS,
  ROOM_LAYOUTS,
  isCharacterModelId,
  type CharacterModelId,
} from '@hermes-office/shared';

/* The id list itself lives in @hermes-office/shared/characters.ts — the
   server validates against it, so it must not be redeclared here. */
export { CHARACTER_MODEL_IDS, isCharacterModelId, type CharacterModelId } from '@hermes-office/shared';

const CHARACTER_BASE = '/assets/3d/character/';

/* ------------------------------------------------------------------ models */

export const CHARACTER_MODEL_URLS: Record<CharacterModelId, string> = {
  'female-a': `${CHARACTER_BASE}character-female-a.glb`,
  'female-b': `${CHARACTER_BASE}character-female-b.glb`,
  'female-c': `${CHARACTER_BASE}character-female-c.glb`,
  'female-d': `${CHARACTER_BASE}character-female-d.glb`,
  'female-e': `${CHARACTER_BASE}character-female-e.glb`,
  'female-f': `${CHARACTER_BASE}character-female-f.glb`,
  'male-a': `${CHARACTER_BASE}character-male-a.glb`,
  'male-b': `${CHARACTER_BASE}character-male-b.glb`,
  'male-c': `${CHARACTER_BASE}character-male-c.glb`,
  'male-d': `${CHARACTER_BASE}character-male-d.glb`,
  'male-e': `${CHARACTER_BASE}character-male-e.glb`,
  'male-f': `${CHARACTER_BASE}character-male-f.glb`,
};

/**
 * Entry inside the source archive for every model above. Documentation only
 * (PROVENANCE.md mirrors it) — nothing in the app fetches these.
 */
export const CHARACTER_MODEL_SOURCES: Record<CharacterModelId, string> = Object.fromEntries(
  CHARACTER_MODEL_IDS.map((id) => [id, `Models/GLB format/character-${id}.glb`])
) as Record<CharacterModelId, string>;

/**
 * Picker labels. Deskriptif berdasarkan bentuk fisik, potongan rambut,
 * dan aksesori khas model 3D (misal: "Wanita Kuncir Kuda", "Pria Bertopi").
 */
export const CHARACTER_MODEL_LABELS: Record<CharacterModelId, string> = {
  'female-a': 'Wanita Kuncir Kuda',
  'female-b': 'Wanita Bob Pendek',
  'female-c': 'Wanita Sanggul Rapi',
  'female-d': 'Wanita Berponi',
  'female-e': 'Wanita Terurai',
  'female-f': 'Wanita Kuncir Dua',
  'male-a': 'Pria Sisir Samping',
  'male-b': 'Pria Bertopi',
  'male-c': 'Pria Jambul',
  'male-d': 'Pria Ikal',
  'male-e': 'Pria Cepak',
  'male-f': 'Pria Kasual',
};

/* -------------------------------------------------------------- departments */

export const DEPARTMENT_IDS = [
  'command',
  'social',
  'marketing',
  'sales',
  'analytics',
  'finance',
  'support',
  'hr',
] as const;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

/**
 * One default model per department, recorded in PROVENANCE.md. Only consulted
 * when an agent carries no `avatar_style.character`.
 */
export const DEPARTMENT_DEFAULT_MODEL: Record<DepartmentId, CharacterModelId> = {
  command: 'male-a',
  social: 'female-a',
  marketing: 'female-b',
  sales: 'male-b',
  analytics: 'male-c',
  finance: 'female-c',
  support: 'male-d',
  hr: 'female-d',
};

export function isDepartmentId(value: unknown): value is DepartmentId {
  return typeof value === 'string' && (DEPARTMENT_IDS as readonly string[]).includes(value);
}

/** Department id -> model id, or `null` for anything outside the layout. */
export function departmentDefaultModel(department?: string | null): CharacterModelId | null {
  if (!department) return null;
  // Same guard the procedural body uses: ids only exist if ROOM_LAYOUTS knows them.
  if (!(department in ROOM_LAYOUTS)) return null;
  return isDepartmentId(department) ? DEPARTMENT_DEFAULT_MODEL[department] : null;
}

/**
 * The model this agent renders: an explicit pick wins, the department default
 * fills the gap (legacy rows, agents that never chose), `null` means "keep the
 * procedural robot".
 */
export function characterModelFor(
  department?: string | null,
  avatarStyle?: { character?: string | null } | null
): CharacterModelId | null {
  const picked = avatarStyle?.character;
  if (isCharacterModelId(picked)) return picked;
  return departmentDefaultModel(department);
}

/* ---------------------------------------------------------------- animations */

/**
 * Clips the app asks for, and the names each committed GLB actually carries.
 * Kenney names them lower-case (`idle`, `walk`, `sit`), so every lookup goes
 * through `resolveClip` instead of a raw `===`.
 */
export const CHARACTER_CLIPS = ['Idle', 'Walk', 'SitDown'] as const;
export type CharacterClipName = (typeof CHARACTER_CLIPS)[number];

export const CHARACTER_CLIP_ALIASES: Record<CharacterClipName, readonly string[]> = {
  Idle: ['Idle', 'idle'],
  Walk: ['Walk', 'walk'],
  // Kenney ships `sit` as a loop; Agent3D clamps it once and holds the pose,
  // which is what Quaternius' one-shot SitDown clip used to do.
  SitDown: ['SitDown', 'sit'],
};

/** First clip matching `wanted`'s aliases, else `null`. */
export function resolveClip<T extends { name: string }>(
  clips: readonly T[],
  wanted: CharacterClipName
): T | null {
  for (const alias of CHARACTER_CLIP_ALIASES[wanted]) {
    const hit = clips.find((clip) => clip.name === alias);
    if (hit) return hit;
  }
  return null;
}

/** True when the model carries every clip the app plays (checked by tests). */
export function hasAllClips(clips: readonly { name: string }[]): boolean {
  return CHARACTER_CLIPS.every((wanted) => resolveClip(clips, wanted) !== null);
}
