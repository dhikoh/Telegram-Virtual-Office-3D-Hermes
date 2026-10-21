import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { VEHICLE_MODEL_IDS, VEHICLE_MODEL_URLS, type VehicleModelId } from './glbVehicles';

export type VehicleScenes = Partial<Record<VehicleModelId, Group>>;

const cache = new Map<VehicleModelId, Promise<Group | null>>();

/**
 * Standardize Kenney Car Kit models for scene rendering.
 * Normalizes base to y = 0 and center to [0, 0, 0], activates shadow casting/receiving.
 */
function prepareVehicleForScene(scene: Group): Group {
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial) {
        material.roughness = 0.65;
        material.metalness = 0.15;
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

/** Loads single vehicle model with caching, resolves to null on failure (safe fallback). */
export function loadVehicleModel(id: VehicleModelId): Promise<Group | null> {
  const cached = cache.get(id);
  if (cached) return cached;

  const pending = (async (): Promise<Group | null> => {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(VEHICLE_MODEL_URLS[id]);
      return prepareVehicleForScene(gltf.scene);
    } catch {
      return null;
    }
  })();

  cache.set(id, pending);
  return pending;
}

/** Loads all vehicle models concurrently */
export async function loadVehicleScenes(): Promise<VehicleScenes> {
  const entries = await Promise.all(
    VEHICLE_MODEL_IDS.map(async (id) => [id, await loadVehicleModel(id)] as const)
  );
  const result: VehicleScenes = {};
  for (const [id, scene] of entries) {
    if (scene) result[id] = scene;
  }
  return result;
}
