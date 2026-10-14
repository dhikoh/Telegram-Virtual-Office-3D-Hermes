/**
 * Tahap 15 acceptance — karakter 3D CC0 (Quaternius) di-wire ke Agent3D.
 *
 * Mengunci:
 *  - manifest menutup tepat 8 departemen ROOM_LAYOUTS dan hanya menunjuk file
 *    yang benar-benar ada, self-contained, di bawah budget (500 KB / 4 MB);
 *  - hasil konversi quantize-only (KHR_mesh_quantization), tanpa Draco/meshopt,
 *    dengan clip Idle/Walk/SitDown yang dipakai mixer;
 *  - loader lazy, selalu resolve (tidak pernah reject), ternormalisasi;
 *  - ECO/low-power tidak pernah fetch;
 *  - badan prosedural robot tetap menjadi fallback;
 *  - provenance + lisensi terdokumentasi di sebelah file-nya (Rule R3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOM_LAYOUTS } from '@hermes-office/shared';
import {
  CHARACTER_CLIPS,
  CHARACTER_IDS,
  CHARACTER_SOURCES,
  CHARACTER_URLS,
  characterIdFor,
} from '../office-3d/glbCharacter';
import {
  CHARACTER_HEIGHT,
  loadCharacterInstance,
  loadCharacterModel,
  resetCharacterCache,
} from '../office-3d/loadCharacterModels';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const manifest = read('../office-3d/glbCharacter.ts');
const loader = read('../office-3d/loadCharacterModels.ts');
const agent3d = read('../office-3d/Agent3D.tsx');

const PUBLIC_DIR = fileURLToPath(new URL('../../../../public/assets/3d/', import.meta.url));
const CHAR_DIR = `${PUBLIC_DIR}character/`;

/** GLB = 12-byte header, then a JSON chunk whose length is the first uint32. */
function glbJson(path: string): {
  buffers: { uri?: string }[];
  animations: { name: string }[];
  skins?: unknown[];
  extensionsRequired?: string[];
} {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 4).toString('latin1'), `${path} bukan GLB valid`).toBe('glTF');
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
}

const GLB_PATH: Record<string, string> = Object.fromEntries(
  CHARACTER_IDS.map((id) => [id, `${CHAR_DIR}${CHARACTER_URLS[id].split('/').pop()}`])
);

describe('manifest menutup tepat 8 departemen', () => {
  it('kuncinya identik dengan ROOM_LAYOUTS (Rule 9.1)', () => {
    expect([...CHARACTER_IDS].sort()).toEqual(Object.keys(ROOM_LAYOUTS).sort());
    expect(Object.keys(CHARACTER_URLS).sort()).toEqual(Object.keys(ROOM_LAYOUTS).sort());
    expect(Object.keys(CHARACTER_SOURCES).sort()).toEqual(Object.keys(ROOM_LAYOUTS).sort());
  });

  it('URL hanya origin sendiri — tanpa CDN/jaringan eksternal (Rule 9.4)', () => {
    for (const url of Object.values(CHARACTER_URLS)) {
      expect(url.startsWith('/assets/3d/character/')).toBe(true);
      expect(url.endsWith('.glb')).toBe(true);
    }
    expect(manifest).not.toMatch(/https?:\/\//);
    expect(manifest).toContain("const CHARACTER_BASE = '/assets/3d/character/';");
  });

  it('characterIdFor menolak departemen di luar layout', () => {
    expect(characterIdFor('command')).toBe('command');
    expect(characterIdFor('hr')).toBe('hr');
    expect(characterIdFor('zombie')).toBeNull();
    expect(characterIdFor(undefined)).toBeNull();
    expect(characterIdFor(null)).toBeNull();
  });
});

describe('8 GLB benar-benar ada, valid, dan di bawah budget', () => {
  it('setiap file ada, > 1 KB, dan <= 500 KB', () => {
    for (const [id, path] of Object.entries(GLB_PATH)) {
      expect(existsSync(path), path).toBe(true);
      const size = statSync(path).size;
      expect(size, `${id} terlalu kecil`).toBeGreaterThan(1000);
      expect(size, `${id} melebihi 500 KB`).toBeLessThanOrEqual(500 * 1024);
    }
  });

  it('semua 8 bersama-sama di bawah 4 MB', () => {
    const total = Object.values(GLB_PATH).reduce((sum, path) => sum + statSync(path).size, 0);
    expect(total).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(total).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('self-contained: buffer GLB tanpa uri eksternal, tanpa file .bin pendamping', () => {
    const binFiles = readdirSync(CHAR_DIR).filter((name) => name.endsWith('.bin'));
    expect(binFiles).toEqual([]);
    for (const path of Object.values(GLB_PATH)) {
      const json = glbJson(path);
      expect(json.buffers.length).toBeGreaterThan(0);
      for (const buffer of json.buffers) expect(buffer.uri).toBeUndefined();
    }
  });

  it('quantize-only: KHR_mesh_quantization dipakai, Draco/meshopt tidak', () => {
    for (const path of Object.values(GLB_PATH)) {
      const json = glbJson(path);
      expect(json.extensionsRequired ?? []).toContain('KHR_mesh_quantization');
      expect(json.extensionsRequired ?? []).not.toContain('KHR_draco_mesh_compression');
      expect(JSON.stringify(json.extensionsRequired ?? [])).not.toMatch(/meshopt/i);
      expect(json.skins?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('clip persis Idle/Walk/SitDown — yang di-drive mixer', () => {
    for (const path of Object.values(GLB_PATH)) {
      const names = glbJson(path).animations.map((clip) => clip.name).sort();
      expect(names).toEqual([...CHARACTER_CLIPS].sort());
    }
  });
});

describe('provenance & lisensi (Rule R3)', () => {
  it('lisensi CC0 asli Quaternius ikut ter-commit', () => {
    const licence = `${CHAR_DIR}LICENSE-Quaternius.txt`;
    expect(existsSync(licence)).toBe(true);
    const text = readFileSync(licence, 'utf8');
    expect(text).toMatch(/CC0 1\.0 Universal/);
    expect(text).toMatch(/Quaternius/);
    expect(text).toMatch(/creativecommons\.org\/publicdomain\/zero\/1\.0/);
  });

  it('PROVENANCE.md mencatat pack, penulis, tanggal unduh, konversi, dan ukuran', () => {
    const provenance = readFileSync(`${CHAR_DIR}PROVENANCE.md`, 'utf8');
    expect(provenance).toContain('Ultimate Animated Character Pack');
    expect(provenance).toContain('Quaternius');
    expect(provenance).toContain('CC0 1.0');
    expect(provenance).toContain('2026-10-14');
    expect(provenance).toContain('gltf-transform');
    expect(provenance).toContain('KHR_mesh_quantization');
    // Setiap sumber & file tercatat dengan ukurannya.
    for (const source of Object.values(CHARACTER_SOURCES)) {
      expect(provenance).toContain(source);
    }
    for (const path of Object.values(GLB_PATH)) {
      expect(provenance).toContain(String(statSync(path).size));
    }
  });
});

describe('loader', () => {
  it('GLTFLoader + SkeletonUtils dimuat lazy via dynamic import (Rule 9.2)', () => {
    expect(loader).toContain("await import('three/examples/jsm/loaders/GLTFLoader.js')");
    expect(loader).toContain("await import('three/examples/jsm/utils/SkeletonUtils.js')");
    expect(loader).not.toMatch(/^import .*GLTFLoader/m);
  });

  it('setiap kegagalan resolve null — tidak pernah reject', () => {
    expect(loader).toMatch(/Promise<Group \| null>/);
    expect(loader).toContain('never rejects');
    expect(loader).toContain('catch');
    expect(loader).toContain('return null');
  });

  it('menormalkan model: tinggi 1.0 unit, kaki di y = 0, terpusat di x/z', () => {
    expect(loader).toContain('export const CHARACTER_HEIGHT = 1.0;');
    expect(CHARACTER_HEIGHT).toBe(1.0);
    expect(loader).toContain('scene.updateMatrixWorld(true)');
    expect(loader).toContain('new Box3().setFromObject(scene)');
    expect(loader).toContain('scene.position.set(-center.x, -box.min.y, -center.z)');
    expect(loader).toContain('root.scale.setScalar(scale)');
  });

  it('di-cache per id dan punya reset untuk test', () => {
    expect(loader).toContain('const cache = new Map<CharacterId, Promise<Group | null>>();');
    expect(loader).toContain('cache.set(id, pending)');
    expect(loader).toContain('export function resetCharacterCache()');
  });

  it('resolve null (bukan reject) saat URL tak bisa diambil', async () => {
    resetCharacterCache();
    const first = loadCharacterModel('command');
    expect(loadCharacterModel('command')).toBe(first); // cache per id
    await expect(first).resolves.toBeNull();
    await expect(loadCharacterInstance('command')).resolves.toBeNull();
    await expect(loadCharacterInstance('nonexistent' as never)).resolves.toBeNull();
    resetCharacterCache();
  });
});

describe('Agent3D: model menggantikan badan prosedural, fallback tetap utuh', () => {
  it('badan prosedural robot masih ada persis seperti sebelumnya', () => {
    expect(agent3d).toContain('<group position={[0, 0.45, 0]}>');
    expect(agent3d).toContain('<cylinderGeometry args={[0.26, 0.22, 0.5, 12]} />');
    expect(agent3d).toContain('<sphereGeometry args={[0.2, 16, 16]} />');
    // Cuma dirender saat belum ada model.
    expect(agent3d).toContain('{character ? (');
    expect(agent3d).toContain('<primitive object={character.root} />');
    expect(agent3d).toContain(') : (');
    expect(agent3d).toContain(')}');
  });

  it('cincin status, label, warna departemen, dan klik tetap dipakai', () => {
    expect(agent3d).toContain('<ringGeometry args={[0.42, 0.54, 32]} />');
    expect(agent3d).toContain('onSelect(agent)');
    expect(agent3d).toContain('isCameraDrag()');
    expect(agent3d).toContain('ROOM_LAYOUTS');
    expect(agent3d).toContain('<Html');
  });

  it('ECO/low-power tidak pernah fetch karakter', () => {
    expect(agent3d).toContain('if (!characterId || isLowPower) {');
    expect(agent3d).toContain('setCharacter(null)');
    expect(agent3d).toContain('loadCharacterInstance(characterId)');
    expect(agent3d).toMatch(/usePowerStore\(\((s|state)\) => \1\.isLowPower\)/);
  });

  it('AnimationMixer memilih clip: Walk saat bergerak, Idle berdiri, SitDown menunggu', () => {
    expect(agent3d).toContain('const wanted = moving ? \'Walk\' : sitting ? \'SitDown\' : \'Idle\';');
    expect(agent3d).toContain('dist > 0.01');
    expect(agent3d).toContain("agent.status === 'waiting_approval'");
    expect(agent3d).toContain("character.clipNames.includes('SitDown')");
    expect(agent3d).toContain('character.mixer.update(delta)');
    expect(agent3d).toContain('loadCharacterInstance');
    // canvas frameloop="demand": animasi yang jalan harus me-repaint.
    expect(agent3d).toContain('if (!isLowPower) invalidate();');
    expect(agent3d).toMatch(/if \(!groupRef\.current\) return;/);
  });
});
