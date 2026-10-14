/**
 * Tahap 13 acceptance — aset 3D CC0 (docs/DESIGN_DIRECTION.md §13, Rule R3).
 *
 * Mengunci:
 *  - GLB furnitur CC0 benar-benar ada di repo, format valid, dari origin sendiri;
 *  - loader lazy (dynamic import GLTFLoader) dengan fallback utuh ke primitif;
 *  - ECO/low-power tidak pernah fetch GLB;
 *  - provenance + lisensi terdokumentasi di docs/ASSETS.md (Rule R3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const furniture = read('../office-3d/Furniture.tsx');
const glbProps = read('../office-3d/GLTFurniture.tsx');
const loader = read('../office-3d/loadFurnitureModels.ts');
const manifest = read('../office-3d/glbFurniture.ts');
const assetsDoc = read('../../../../../../docs/ASSETS.md');

const PUBLIC_DIR = fileURLToPath(new URL('../../../../public/assets/3d/', import.meta.url));
const FURNITURE_GLBS = [
  'bookcaseOpen.glb',
  'chairModernCushion.glb',
  'lampRoundFloor.glb',
  'loungeSofa.glb',
  'pottedPlant.glb',
  'sideTable.glb',
];

describe('GLB CC0 ada dan valid di repo', () => {
  it('6 furnitur tersimpan dengan isi bukan kosong dan header glTF', () => {
    for (const name of FURNITURE_GLBS) {
      const path = `${PUBLIC_DIR}furniture/${name}`;
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(1000);
      const magic = readFileSync(path).subarray(0, 4).toString('latin1');
      expect(magic, `${name} bukan GLB valid`).toBe('glTF');
    }
    // Tahap 17 — karakter pindah ke pack Kenney (12 GLB); kontraknya dikunci
    // di character-3d.test.ts. KayKit knight dihapus bersama pack Quaternius.
    expect(existsSync(`${PUBLIC_DIR}character/knight.glb`)).toBe(false);
  });

  it('lisensi teks ikut ter-commit di sebelah modelnya', () => {
    const kenneyLicense = `${PUBLIC_DIR}furniture/LICENSE-Kenney.txt`;
    const charLicense = `${PUBLIC_DIR}character/LICENSE-Kenney.txt`;
    expect(existsSync(kenneyLicense)).toBe(true);
    expect(existsSync(charLicense)).toBe(true);
    expect(readFileSync(kenneyLicense, 'utf8')).toMatch(/CC0|Creative Commons/i);
    expect(readFileSync(charLicense, 'utf8')).toMatch(/CC0|Creative Commons/i);
  });
});

describe('manifest & loader', () => {
  it('URL manifest hanya origin sendiri — tanpa CDN/jaringan eksternal (Rule 9.4)', () => {
    expect(manifest).toContain("/assets/3d/furniture/");
    expect(manifest).not.toMatch(/https?:\/\//);
  });

  it('GLTFLoader dimuat lazy via dynamic import sehingga tak menaikkan chunk Office3D (Rule 9.2)', () => {
    expect(loader).toContain("await import('three/examples/jsm/loaders/GLTFLoader.js')");
    expect(loader).toMatch(/import\('three\/examples/);
  });

  it('kegagalan load jatuh ke null, bukan melempar — primitif tetap utuh', () => {
    expect(loader).toMatch(/Promise<Group \| null>/);
    expect(loader).toContain('never rejects');
    expect(loader).toMatch(/catch/);
    expect(glbProps).toContain('loadFurnitureScenes');
  });

  it('ECO/low-power tidak pernah fetch GLB', () => {
    expect(glbProps).toContain('usePowerStore');
    expect(glbProps).toMatch(/isLowPower/);
  });
});

describe('integrasi ke scene', () => {
  it('Furniture.tsx memasang prop GLB secara aditif — meja/sofa prosedural tidak dihapus', () => {
    expect(furniture).toContain("from './GLTFurniture'");
    expect(furniture).toContain('<GLTFurniture');
    expect(furniture).toMatch(/boxGeometry/); // primitif lama masih ada (JSX r3f lowercase)
    expect(furniture).toMatch(/desk3d|ROOM_LAYOUTS/);
  });
});

describe('provenance (Rule R3)', () => {
  it('docs/ASSETS.md mencatat sumber, penulis, dan lisensi CC0', () => {
    expect(assetsDoc).toContain('CC0');
    expect(assetsDoc).toContain('Kenney');
    expect(assetsDoc).toContain('kenney.nl/assets/furniture-kit');
    // Tahap 17 — pack karakter sekarang juga Kenney (Mini Characters 1.0).
    expect(assetsDoc).toContain('Mini Characters 1.0');
  });

  it('mengakui penggantian pack karakter apa adanya (bukan gap tersembunyi)', () => {
    // Alasan Quaternius dibuang (material hampir hitam) dan di mana buktinya.
    expect(assetsDoc).toMatch(/Why the previous pack was replaced/);
    expect(assetsDoc).toContain('PROVENANCE.md');
    expect(assetsDoc).toMatch(/Quaternius/);
  });
});
