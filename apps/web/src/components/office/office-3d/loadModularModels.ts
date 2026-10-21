/**
 * Lazy GLB loader for KayKit: Prototype Bits modular 3D models.
 *
 * Follows Rule 9.2 & 9.4: dynamic import of GLTFLoader, zero external requests,
 * and fail-safe null return on error so scene fallback remains intact.
 */

import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { MODULAR_IDS, MODULAR_URLS, type ModularModelId } from './glbModular';

export type ModularScenes = Partial<Record<ModularModelId, Group>>;

const cache = new Map<ModularModelId, Promise<Group | null>>();

function prepareModularProp(scene: Group): Group {
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial) {
        material.roughness = 0.85;
        material.metalness = 0.05;
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

export function loadModularModel(id: ModularModelId): Promise<Group | null> {
  const cached = cache.get(id);
  if (cached) return cached;

  const pending = (async (): Promise<Group | null> => {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(MODULAR_URLS[id]);
      return prepareModularProp(gltf.scene);
    } catch {
      return null;
    }
  })();

  cache.set(id, pending);
  return pending;
}

export async function loadModularScenes(): Promise<ModularScenes> {
  const entries = await Promise.all(
    MODULAR_IDS.map(async (id) => {
      const scene = await loadModularModel(id);
      return scene ? ([id, scene] as const) : null;
    })
  );
  return Object.fromEntries(
    entries.filter((entry): entry is [ModularModelId, Group] => entry !== null)
  );
}
