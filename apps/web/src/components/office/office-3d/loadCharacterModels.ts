/**
 * Tahap 15 — lazy GLB loader for the CC0 character pack.
 *
 * Mirrors loadFurnitureModels.ts, with two extras a skinned character needs:
 *
 *  1. GLTFLoader (and SkeletonUtils, for one skeleton per agent) come in via
 *     dynamic `import()`, so neither rides in the Office3D chunk and neither
 *     blocks first paint (Rule 9.2).
 *  2. Every model is normalised once: feet on y = 0, height 1.0 unit, centred
 *     on x/z — the office lays agents out in ~1-unit bodies (Agent3D's
 *     procedural robot is 1.17 units tall).
 *
 * Any failure — 404, CSP block, decode error, offline, a department with no
 * character — resolves to `null` instead of throwing, so the procedural robot
 * body stays the whole scene (fallback utuh).
 */

import { AnimationClip, AnimationMixer, Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { CHARACTER_IDS, CHARACTER_URLS, type CharacterId } from './glbCharacter';

/** Target standing height in world units (the pack's raw models are ~3 units). */
export const CHARACTER_HEIGHT = 1.0;

export interface CharacterInstance {
  /** Normalised, feet on y = 0 — parent it straight under the agent group. */
  root: Group;
  /** Drives the clips below; call `mixer.update(delta)` every frame. */
  mixer: AnimationMixer;
  /** `Idle`, `Walk`, `SitDown` — clip names the source actually carries. */
  clipNames: string[];
}

const cache = new Map<CharacterId, Promise<Group | null>>();

/**
 * Quaternius characters ship textured-less PBR with their origin at the
 * armature root and ~3 units tall. Bake in the office key light and re-origin
 * so the standing bounding box lands on y = 0 with its centre on [0, 0].
 */
function prepareForScene(scene: Group, clips: readonly AnimationClip[]): Group {
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial) {
        material.roughness = 0.8;
        material.metalness = 0.0;
        material.needsUpdate = true;
      }
    }
  });

  // World matrices must be resolved first: the loader only sets local ones.
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = size.y > 1e-6 ? CHARACTER_HEIGHT / size.y : 1;

  scene.position.set(-center.x, -box.min.y, -center.z);

  const root = new Group();
  root.add(scene);
  // Scale lives on the wrapper, so the offset above stays in source units and
  // the feet still land on y = 0 after scaling.
  root.scale.setScalar(scale);
  // Carried on the root so Object3D.clone() / SkeletonUtils.clone() copy them.
  root.animations = [...clips];
  return root;
}

/**
 * Resolves to `null` on any failure — never rejects, never throws.
 * The returned group is a shared source; clone it per instance.
 */
export function loadCharacterModel(id: CharacterId): Promise<Group | null> {
  const cached = cache.get(id);
  if (cached) return cached;

  const pending = (async (): Promise<Group | null> => {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(CHARACTER_URLS[id]);
      return prepareForScene(gltf.scene, gltf.animations);
    } catch {
      // Fallback utuh: the procedural robot body already describes this agent.
      return null;
    }
  })();

  cache.set(id, pending);
  return pending;
}

/**
 * A private copy for one agent: several agents share a department, and two
 * mixers must never drive the same skeleton.
 */
export async function loadCharacterInstance(id: CharacterId): Promise<CharacterInstance | null> {
  const source = await loadCharacterModel(id);
  if (!source) return null;

  let root = source;
  try {
    const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
    root = clone(source) as Group;
  } catch {
    // Sharing the source skeleton is still better than no character at all.
    root = source;
  }

  return {
    root,
    mixer: new AnimationMixer(root),
    clipNames: root.animations.map((clip) => clip.name),
  };
}

/** Fire every character at once; missing ones simply stay absent. */
export function loadCharacterInstances(
  ids: readonly CharacterId[] = CHARACTER_IDS
): Promise<Partial<Record<CharacterId, CharacterInstance>>> {
  return Promise.all(
    ids.map(async (id) => [id, await loadCharacterInstance(id)] as const)
  ).then(
    (entries) =>
      Object.fromEntries(
        entries.filter(([, instance]) => instance !== null)
      ) as Partial<Record<CharacterId, CharacterInstance>>
  );
}

/** Test/dev helper: drop the memoised promises so a retry really re-fetches. */
export function resetCharacterCache(): void {
  cache.clear();
}
