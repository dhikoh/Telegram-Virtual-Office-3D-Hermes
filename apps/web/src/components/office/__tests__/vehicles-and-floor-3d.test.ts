/**
 * Unit test for 3D Vehicles (Kenney Car Kit) and Floor Tiles (Kenney Mini Market).
 * Verifies asset presence, self-contained formats, manifest paths, loaders, and scene integration.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  VEHICLE_MODEL_IDS,
  VEHICLE_MODEL_URLS,
  vehicleModelForKind,
} from '../office-3d/glbVehicles';
import { FLOOR_MODEL_URL } from '../office-3d/glbFloor';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const PUBLIC_3D = fileURLToPath(new URL('../../../../public/assets/3d/', import.meta.url));
const backdrop = read('../office-3d/Backdrop.tsx');
const furniture = read('../office-3d/Furniture.tsx');
const vehicleLoader = read('../office-3d/loadVehicleModels.ts');
const floorLoader = read('../office-3d/loadFloorModel.ts');
const assetsDoc = read('../../../../../../docs/ASSETS.md');

describe('Kenney Car Kit 3D Assets', () => {
  it('all 3 vehicle GLBs exist with valid glTF headers and non-zero sizes', () => {
    for (const id of VEHICLE_MODEL_IDS) {
      const glbPath = `${PUBLIC_3D}vehicles/${id}.glb`;
      expect(existsSync(glbPath), `Missing ${glbPath}`).toBe(true);
      expect(statSync(glbPath).size).toBeGreaterThan(50000); // 180KB - 260KB
      const magic = readFileSync(glbPath).subarray(0, 4).toString('latin1');
      expect(magic).toBe('glTF');
    }
  });

  it('license and provenance documentation exist in vehicles directory', () => {
    const licPath = `${PUBLIC_3D}vehicles/LICENSE-Kenney.txt`;
    const provPath = `${PUBLIC_3D}vehicles/PROVENANCE.md`;
    expect(existsSync(licPath)).toBe(true);
    expect(existsSync(provPath)).toBe(true);
    expect(readFileSync(licPath, 'utf8')).toMatch(/CC0|Creative Commons/i);
  });

  it('manifest URLs strictly use local origin without CDN or external network requests (Rule 9.4)', () => {
    for (const url of Object.values(VEHICLE_MODEL_URLS)) {
      expect(url).toMatch(/^\/assets\/3d\/vehicles\/.*\.glb$/);
      expect(url).not.toMatch(/^https?:\/\//);
    }
  });

  it('vehicleModelForKind maps buses to delivery van and cars to sedan/suv', () => {
    expect(vehicleModelForKind('bus', 'v2')).toBe('delivery');
    expect(vehicleModelForKind('bus', 'v6')).toBe('delivery');
    expect(vehicleModelForKind('car', 'v1')).toBe('sedan');
    expect(vehicleModelForKind('car', 'v3')).toBe('suv');
    expect(vehicleModelForKind('car', 'v4')).toBe('suv');
    expect(vehicleModelForKind('car', 'v5')).toBe('sedan');
  });

  it('dynamic GLTFLoader is used to avoid inflating initial bundle size', () => {
    expect(vehicleLoader).toContain("import('three/examples/jsm/loaders/GLTFLoader.js')");
    expect(vehicleLoader).toContain('loadVehicleScenes');
  });

  it('Backdrop.tsx integrates 3D vehicles without overlapping with legacy boxes', () => {
    expect(backdrop).toContain('loadVehicleScenes');
    expect(backdrop).toContain('vehicleModelForKind');
    expect(backdrop).toContain('VEHICLE_SCALE');
    expect(backdrop).toContain('sourceScene.clone(true)');
  });
});

describe('Kenney Mini Market Floor Asset', () => {
  it('floor GLB exists with valid glTF header', () => {
    const glbPath = `${PUBLIC_3D}floor/floor.glb`;
    expect(existsSync(glbPath), `Missing ${glbPath}`).toBe(true);
    expect(statSync(glbPath).size).toBeGreaterThan(10000);
    const magic = readFileSync(glbPath).subarray(0, 4).toString('latin1');
    expect(magic).toBe('glTF');
  });

  it('license and provenance documentation exist in floor directory', () => {
    const licPath = `${PUBLIC_3D}floor/LICENSE-Kenney.txt`;
    const provPath = `${PUBLIC_3D}floor/PROVENANCE.md`;
    expect(existsSync(licPath)).toBe(true);
    expect(existsSync(provPath)).toBe(true);
    expect(readFileSync(licPath, 'utf8')).toMatch(/CC0|Creative Commons/i);
  });

  it('manifest URL uses local origin without remote network calls', () => {
    expect(FLOOR_MODEL_URL).toBe('/assets/3d/floor/floor.glb');
    expect(FLOOR_MODEL_URL).not.toMatch(/^https?:\/\//);
  });

  it('floorLoader loads via dynamic GLTFLoader with safe fallback to null', () => {
    expect(floorLoader).toContain("import('three/examples/jsm/loaders/GLTFLoader.js')");
    expect(floorLoader).toContain('loadFloorModel');
  });

  it('Furniture.tsx integrates GLTFFloor and eliminates overlapping coffee table', () => {
    expect(furniture).toContain('GLTFFloor');
    expect(furniture).toContain('<GLTFFloor />');
    // Ensure redundant cylinder table is not rendered inside Central Lounge
    expect(furniture).not.toContain('cylinderGeometry args={[0.9, 0.9, 0.15, 16]}');
  });

  it('eliminates legacy neon wireframes in favour of soft executive carpet pads', () => {
    expect(furniture).not.toContain('wireframe');
    expect(furniture).toContain('Room Carpet Border Trim');
    expect(furniture).toContain('Room Base Carpet Pad');
  });
});

describe('docs/ASSETS.md provenance', () => {
  it('documents Kenney Car Kit and Mini Market floor assets with CC0 attribution', () => {
    expect(assetsDoc).toContain('Kenney Car Kit');
    expect(assetsDoc).toContain('kenney.nl/assets/car-kit');
    expect(assetsDoc).toContain('Kenney Mini Market');
    expect(assetsDoc).toContain('kenney.nl/assets/mini-market');
  });
});
