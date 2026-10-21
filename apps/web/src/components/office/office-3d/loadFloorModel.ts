import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { FLOOR_MODEL_URL } from './glbFloor';

let cachedPromise: Promise<Group | null> | null = null;

function prepareFloorForScene(scene: Group): Group {
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial) {
        material.roughness = 0.9;
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

export function loadFloorModel(): Promise<Group | null> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async (): Promise<Group | null> => {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(FLOOR_MODEL_URL);
      return prepareFloorForScene(gltf.scene);
    } catch {
      return null;
    }
  })();

  return cachedPromise;
}
