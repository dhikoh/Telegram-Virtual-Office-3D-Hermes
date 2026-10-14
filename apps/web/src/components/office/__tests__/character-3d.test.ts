/**
 * Tahap 17 acceptance — karakter 3D CC0 (Kenney "Mini Characters 1.0").
 *
 * Mengunci:
 *  - satu daftar id (CHARACTER_MODEL_IDS di @hermes-office/shared/characters.ts)
 *    dipakai manifest, loader, server, dan picker — tanpa duplikasi;
 *  - 12 GLB benar-benar ada, self-contained (tekstur ter-embed, tanpa .bin),
 *    di bawah budget, dan punya clip yang di-drive mixer (idle/walk/sit);
 *  - manifest menutup tepat 8 departemen ROOM_LAYOUTS + default per departemen;
 *  - loader lazy, selalu resolve (tidak pernah reject), ternormalisasi;
 *  - ECO/low-power tidak pernah fetch; badan prosedural robot tetap fallback;
 *  - provenance + lisensi CC0 terdokumentasi di sebelah file-nya (Rule R3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CHARACTER_MODEL_IDS,
  ROOM_LAYOUTS,
  isCharacterModelId,
} from '@hermes-office/shared';
import {
  CHARACTER_CLIPS,
  CHARACTER_MODEL_LABELS,
  CHARACTER_MODEL_SOURCES,
  CHARACTER_MODEL_URLS,
  DEPARTMENT_DEFAULT_MODEL,
  DEPARTMENT_IDS,
  characterModelFor,
  departmentDefaultModel,
  hasAllClips,
  resolveClip,
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
const sharedChars = read('../../../../../../packages/shared/src/characters.ts');

const PUBLIC_DIR = fileURLToPath(new URL('../../../../public/assets/3d/', import.meta.url));
const CHAR_DIR = `${PUBLIC_DIR}character/`;

/** GLB = 12-byte header, then a JSON chunk whose length is the first uint32. */
function glbJson(path: string): {
  buffers: { uri?: string }[];
  images: { uri?: string }[];
  animations: { name: string }[];
  skins?: unknown[];
} {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 4).toString('latin1'), `${path} bukan GLB valid`).toBe('glTF');
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
}

const GLB_PATH: Record<string, string> = Object.fromEntries(
  CHARACTER_MODEL_IDS.map((id) => [id, `${CHAR_DIR}${CHARACTER_MODEL_URLS[id].split('/').pop()}`])
);

describe('satu daftar id untuk seluruh aplikasi (anti-duplikasi)', () => {
  it('daftar id hidup di shared dan tidak dideklarasikan ulang di web', () => {
    expect(sharedChars).toContain('export const CHARACTER_MODEL_IDS = [');
    expect(manifest).toContain(
      "export { CHARACTER_MODEL_IDS, isCharacterModelId, type CharacterModelId } from '@hermes-office/shared';"
    );
    // Manifest menurunkan URL/label/sumber dari daftar itu, bukan menyalinnya.
    expect(manifest).toContain('CHARACTER_MODEL_IDS.map((id) =>');
    expect(manifest).not.toMatch(/^const CHARACTER_MODEL_IDS = \[/m);
  });

  it('id yang tidak dikenal ditolak di web maupun shared', () => {
    expect(isCharacterModelId('female-a')).toBe(true);
    expect(isCharacterModelId('knight')).toBe(false);
    expect(isCharacterModelId(undefined)).toBe(false);
    expect(characterModelFor('command', { character: 'knight' })).toBe(DEPARTMENT_DEFAULT_MODEL.command);
    expect(characterModelFor('zombie', null)).toBeNull();
    expect(characterModelFor(null, { character: 'male-e' })).toBe('male-e');
  });
});

describe('manifest menutup tepat 8 departemen', () => {
  it('kuncinya identik dengan ROOM_LAYOUTS (Rule 9.1)', () => {
    expect([...DEPARTMENT_IDS].sort()).toEqual(Object.keys(ROOM_LAYOUTS).sort());
    expect(Object.keys(DEPARTMENT_DEFAULT_MODEL).sort()).toEqual(Object.keys(ROOM_LAYOUTS).sort());
    expect(Object.keys(CHARACTER_MODEL_LABELS).sort()).toEqual([...CHARACTER_MODEL_IDS].sort());
    expect(Object.keys(CHARACTER_MODEL_SOURCES).sort()).toEqual([...CHARACTER_MODEL_IDS].sort());
  });

  it('setiap default departemen adalah id model yang benar-benar ada', () => {
    for (const id of Object.values(DEPARTMENT_DEFAULT_MODEL)) {
      expect(isCharacterModelId(id)).toBe(true);
    }
    expect(departmentDefaultModel('hr')).toBe(DEPARTMENT_DEFAULT_MODEL.hr);
    expect(departmentDefaultModel('zombie')).toBeNull();
    expect(departmentDefaultModel(undefined)).toBeNull();
  });

  it('URL hanya origin sendiri — tanpa CDN/jaringan eksternal (Rule 9.4)', () => {
    for (const url of Object.values(CHARACTER_MODEL_URLS)) {
      expect(url.startsWith('/assets/3d/character/')).toBe(true);
      expect(url.endsWith('.glb')).toBe(true);
    }
    expect(manifest).not.toMatch(/https?:\/\//);
    expect(manifest).toContain("const CHARACTER_BASE = '/assets/3d/character/';");
  });
});

describe('12 GLB benar-benar ada, valid, dan di bawah budget', () => {
  it('setiap file ada, > 100 KB, dan <= 500 KB', () => {
    for (const [id, path] of Object.entries(GLB_PATH)) {
      expect(existsSync(path), path).toBe(true);
      const size = statSync(path).size;
      expect(size, `${id} terlalu kecil`).toBeGreaterThan(100 * 1024);
      expect(size, `${id} melebihi 500 KB`).toBeLessThanOrEqual(500 * 1024);
    }
  });

  it('semua 12 bersama-sama di bawah 4 MB', () => {
    const total = Object.values(GLB_PATH).reduce((sum, path) => sum + statSync(path).size, 0);
    expect(total).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(total).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('tidak ada file asing tertinggal di folder karakter', () => {
    const names = readdirSync(CHAR_DIR).sort();
    const expected = [
      ...Object.values(GLB_PATH).map((path) => path.split('/').pop() as string),
      'LICENSE-Kenney.txt',
      'PROVENANCE.md',
    ].sort();
    expect(names).toEqual(expected);
  });

  it('self-contained: buffer tanpa uri, tekstur ter-embed, tanpa file .bin', () => {
    expect(readdirSync(CHAR_DIR).filter((name) => name.endsWith('.bin'))).toEqual([]);
    for (const path of Object.values(GLB_PATH)) {
      const json = glbJson(path);
      expect(json.buffers.length).toBeGreaterThan(0);
      for (const buffer of json.buffers) expect(buffer.uri).toBeUndefined();
      // Tekstur colormap di-embed sebagai data URI — tidak ada request kedua.
      expect(json.images.length).toBeGreaterThan(0);
      for (const image of json.images) {
        expect(image.uri?.startsWith('data:image/png;base64,')).toBe(true);
      }
      expect(json.skins?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('clip idle/walk/sit ada di setiap model dan alias-nya menyelesaikan', () => {
    for (const path of Object.values(GLB_PATH)) {
      const names = glbJson(path).animations.map((clip) => clip.name);
      expect(names).toContain('idle');
      expect(names).toContain('walk');
      expect(names).toContain('sit');
      // resolveClip bekerja lintas penamaan (Kenney memakai huruf kecil).
      expect(resolveClip(names.map((name) => ({ name })), 'Idle')?.name).toBe('idle');
      expect(resolveClip(names.map((name) => ({ name })), 'Walk')?.name).toBe('walk');
      expect(resolveClip(names.map((name) => ({ name })), 'SitDown')?.name).toBe('sit');
      expect(hasAllClips(names.map((name) => ({ name })))).toBe(true);
    }
    expect(CHARACTER_CLIPS).toEqual(['Idle', 'Walk', 'SitDown']);
    expect(resolveClip([{ name: 'walk' }], 'Idle')).toBeNull();
  });
});

describe('provenance & lisensi (Rule R3)', () => {
  it('lisensi CC0 asli Kenney ikut ter-commit', () => {
    const licence = `${CHAR_DIR}LICENSE-Kenney.txt`;
    expect(existsSync(licence)).toBe(true);
    const text = readFileSync(licence, 'utf8');
    expect(text).toMatch(/Creative Commons Zero, CC0/);
    expect(text).toMatch(/creativecommons\.org\/publicdomain\/zero\/1\.0/);
    expect(text).toMatch(/Kenney/);
  });

  it('PROVENANCE.md mencatat pack, penulis, tanggal unduh, dan ukuran tiap file', () => {
    const provenance = readFileSync(`${CHAR_DIR}PROVENANCE.md`, 'utf8');
    expect(provenance).toContain('Mini Characters 1.0');
    expect(provenance).toContain('Kenney');
    expect(provenance).toContain('CC0 1.0');
    expect(provenance).toContain('2026-10-14');
    for (const source of Object.values(CHARACTER_MODEL_SOURCES)) {
      expect(provenance).toContain(source.split('/').pop() as string);
    }
    for (const path of Object.values(GLB_PATH)) {
      expect(provenance).toContain(String(statSync(path).size));
    }
  });

  it('pack Quaternius yang hitam sudah tidak ada lagi', () => {
    expect(readdirSync(CHAR_DIR).some((name) => name.includes('Quaternius'))).toBe(false);
    expect(existsSync(`${CHAR_DIR}knight.glb`)).toBe(false);
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
    // Matte, non-metallic: metalness 1 tanpa env map = hitam.
    expect(loader).toContain('material.metalness = 0.0;');
    expect(loader).toContain('material.roughness = 0.8;');
  });

  it('di-cache per id dan punya reset untuk test', () => {
    expect(loader).toContain('const cache = new Map<CharacterModelId, Promise<Group | null>>();');
    expect(loader).toContain('cache.set(id, pending)');
    expect(loader).toContain('export function resetCharacterCache()');
  });

  it('resolve null (bukan reject) saat URL tak bisa diambil', async () => {
    resetCharacterCache();
    const first = loadCharacterModel('male-a');
    expect(loadCharacterModel('male-a')).toBe(first); // cache per id
    await expect(first).resolves.toBeNull();
    await expect(loadCharacterInstance('male-a')).resolves.toBeNull();
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

  it('identitas = pilihan agen, fallback default departemen', () => {
    expect(agent3d).toContain('characterModelFor(agent.department, agent.avatar_style)');
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
    expect(agent3d).toContain("const wanted = moving ? 'Walk' : sitting ? 'SitDown' : 'Idle';");
    expect(agent3d).toContain('dist > 0.01');
    expect(agent3d).toContain("agent.status === 'waiting_approval'");
    expect(agent3d).toContain('character.mixer.update(delta)');
    expect(agent3d).toContain('loadCharacterInstance');
    // canvas frameloop="demand": animasi yang jalan harus me-repaint.
    expect(agent3d).toContain('if (!isLowPower) invalidate();');
    expect(agent3d).toMatch(/if \(!groupRef\.current\) return;/);
  });
});

describe('bubble kantor 3D (Tahap 17)', () => {
  it('membaca kalimat terakhir dari store yang sama dengan sprite 2D', () => {
    expect(agent3d).toContain('useOfficeStore((s) => s.speech[agent.id])');
    expect(agent3d).toContain('speechLine(lastSpeech, now)');
    expect(agent3d).toContain('data-testid="agent3d-bubble"');
  });

  it('me-repaint canvas demand saat TTL bubble diperiksa ulang', () => {
    expect(agent3d).toMatch(/const tick = setInterval\(\(\) => \{[\s\S]*invalidate\(\);[\s\S]*\}, 5000\);/);
  });
});
