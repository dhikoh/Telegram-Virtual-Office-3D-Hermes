/**
 * Tahap 13 — lazy GLB loader for the CC0 furniture pack.
 *
 * Three hard rules encoded here:
 *  1. GLTFLoader is pulled in with a dynamic `import()`, so its ~30 KB never
 *     rides in the Office3D chunk and never blocks first paint (Rule 9.2).
 *  2. Loading happens after the scene has mounted and only when the view is
 *     already interactive (see GLTFurniture); nothing awaits a network fetch
 *     before the procedural scene renders.
 *  3. Any failure — 404, CSP block, decode error, offline — resolves to `null`
 *     instead of throwing, so the primitive furniture stays the whole scene
 *     (fallback utuh, tahap 13 exit criteria).
 */

import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { FURNITURE_IDS, FURNITURE_URLS, type FurnitureModelId } from './glbFurniture';

export type FurnitureScenes = Partial<Record<FurnitureModelId, Group>>;

const cache = new Map<FurnitureModelId, Promise<Group | null>>();

/**
 * Kenney props ship unlit, shadowless, and with their origin at a bounding-box
 * corner. This bakes in the office key light and re-origins every model so its
 * footprint centre sits on [0, 0, 0] and its base on y = 0 — which is what the
 * slot table in GLTFurniture assumes.
 */
function preparePropForScene(scene: Group): Group {
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial) {
        material.roughness = 0.85;
        material.metalness = 0.02;
        material.needsUpdate = true;
      }
    }
  });

  const box = new Box3().setFromObject(scene);
  const center = new Vector3();
  box.getCenter(center);
  scene.position.set(-center.x, -box.min.y, -center.z);

  const root = new Group();
  root.add(scene);
  return root;
}

/** Resolves to `null` on any failure — never rejects, never throws. */
export function loadFurnitureModel(id: FurnitureModelId): Promise<Group | null> {
  const cached = cache.get(id);
  if (cached) return cached;

  const pending = (async (): Promise<Group | null> => {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(FURNITURE_URLS[id]);
      return preparePropForScene(gltf.scene);
    } catch {
      // Fallback utuh: the procedural primitives already describe this object.
      return null;
    }
  })();

  cache.set(id, pending);
  return pending;
}

/** Fire every model at once; missing models simply stay absent from the result. */
export function loadFurnitureScenes(
  ids: readonly FurnitureModelId[] = FURNITURE_IDS
): Promise<FurnitureScenes> {
  return Promise.all(ids.map(async (id) => [id, await loadFurnitureModel(id)] as const)).then(
    (entries) => Object.fromEntries(entries.filter(([, scene]) => scene !== null)) as FurnitureScenes
  );
}

/** Test/dev helper: drop the memoised promises so a retry really re-fetches. */
export function resetFurnitureCache(): void {
  cache.clear();
}
