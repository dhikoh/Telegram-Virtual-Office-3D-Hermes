/**
 * Tahap 16 acceptance — Kenney "RPG Urban Pack 1.0" (CC0) tiles in the 2D
 * street strip.
 *
 * Locks:
 *  - every PNG the tile module points at really exists, is a valid 16×16 PNG,
 *    and the whole folder stays far under the 150 KB budget;
 *  - the strip still declares its lane geometry (STRIP_TOP / CURB_Y /
 *    ROAD_BOTTOM / LANE_Y) so the animated fleet keeps its lanes;
 *  - the tiled layer sits on top of the old flat fills — a 404 has to leave
 *    the flat street, not a hole;
 *  - props are drawn before the vehicles, so nothing covers a moving car;
 *  - licence + provenance ship next to the pixels (Rule R3);
 *  - no remote URL in the tile module (Rule 9.4), no per-frame work added.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STREET_PROPS, STREET_TILES, STREET_PROP_SIZE, streetTileUrl } from '../../../lib/streetTiles';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const map = read('../Map.tsx');
const tiles = read('../../../lib/streetTiles.ts');

const PUBLIC_DIR = fileURLToPath(new URL('../../../../public/assets/2d/', import.meta.url));
const STREET_DIR = `${PUBLIC_DIR}street/`;

/** Minimal PNG header read: signature, then IHDR width/height. */
function pngSize(path: string): { w: number; h: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).toString('latin1'), `${path} bukan PNG valid`).toBe('\x89PNG\r\n\x1a\n');
  expect(buf.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const PNG_PATHS = Object.values(STREET_TILES).map((file) => `${STREET_DIR}${file}`);

describe('nine Kenney tiles exist, are 16×16, and stay tiny', () => {
  it('setiap file ada, PNG valid, 16×16, dan berukuran wajar', () => {
    expect(PNG_PATHS.length).toBe(9);
    for (const path of PNG_PATHS) {
      expect(existsSync(path), path).toBe(true);
      const size = statSync(path).size;
      expect(size, `${path} terlalu kecil`).toBeGreaterThan(60);
      expect(size, `${path} terlalu besar untuk satu tile`).toBeLessThan(4096);
      expect(pngSize(path), path).toEqual({ w: 16, h: 16 });
    }
  });

  it('folder street/ (PNG + LICENSE + PROVENANCE) di bawah 150 KB', () => {
    const total = readdirSync(STREET_DIR).reduce((sum, name) => sum + statSync(`${STREET_DIR}${name}`).size, 0);
    expect(total).toBeLessThan(150 * 1024);
    expect(total).toBeGreaterThan(500);
  });

  it('tidak ada file lain yang ikut ter-bundle (hanya 9 tile + 2 dokumen)', () => {
    const files = readdirSync(STREET_DIR).sort();
    expect(files).toEqual(
      [
        'LICENSE-Kenney.txt',
        'PROVENANCE.md',
        'prop-bush.png',
        'prop-hydrant.png',
        'prop-street-lamp.png',
        'prop-tree-planter.png',
        'road-asphalt.png',
        'road-edge-bottom.png',
        'road-edge-top.png',
        'road-lane-dash.png',
        'sidewalk-slab.png',
      ].sort()
    );
  });
});

describe('the tile module serves local files only (Rule 9.4)', () => {
  it('semua URL di bawah origin sendiri, tanpa http jarak jauh', () => {
    for (const id of Object.keys(STREET_TILES) as (keyof typeof STREET_TILES)[]) {
      const url = streetTileUrl(id);
      expect(url.startsWith('/assets/2d/street/')).toBe(true);
      expect(url.endsWith('.png')).toBe(true);
    }
    expect(tiles).not.toMatch(/https?:\/\//);
    expect(tiles).toContain("const STREET_BASE = '/assets/2d/street/';");
  });

  it('manifest mencatat indeks atlas, baris/kolom, dan isi tiap tile', () => {
    // The identification table is the point of the exercise — keep it honest.
    for (const marker of ['441', '433', '406', '460', '63', '164', '291', '238', '251']) {
      expect(tiles).toMatch(new RegExp(`\\|\\s*${marker}\\s*\\|`));
    }
    expect(tiles).toContain('index = row * 27 + col');
    expect(tiles).toContain('**no** standalone kerb tile');
  });
});

describe('lane geometry is untouched', () => {
  it('konstanta strip tetap 354 / 366 / 414 dan lajur 372 / 396', () => {
    expect(map).toContain('const STRIP_TOP = 354;');
    expect(map).toContain('const CURB_Y = 366;');
    expect(map).toContain('const ROAD_BOTTOM = 414;');
    expect(map).toContain('const LANE_Y = [372, 396];');
    expect(map).toContain('const STRIP_UNIT_PX = 380 / (2 * STREET_SPAN);');
  });

  it('armada tetap dianimasikan seperti sebelumnya (Rule 9.3 ECO di depan)', () => {
    expect(map).toContain('if (isLowPower) return;');
    expect(map).toContain('streetTraffic(tMs / 1000, false)');
    expect(map).toContain('groupRefs.current[v.id]');
  });

  it('garis tengah lama (8 dash di y = 389) tetap ada sebagai fallback', () => {
    expect(map).toContain('Array.from({ length: 8 })');
    expect(map).toMatch(/y=\{?389\}?/);
  });
});

describe('tiled layer over the flat street, never instead of it', () => {
  it('warna datar lama digambar lebih dulu di bawah tiap fill berpola', () => {
    const flatSidewalk = map.indexOf('height={CURB_Y - STRIP_TOP} fill="#D2D8E2"');
    const tiledSidewalk = map.indexOf('fill="url(#tile-sidewalk-near)"');
    const flatRoad = map.indexOf('height={ROAD_BOTTOM - CURB_Y} fill="#B9C0CD"');
    const tiledRoad = map.indexOf('fill="url(#tile-asphalt)"');
    const flatFar = map.indexOf('y={ROAD_BOTTOM} width="380" height="6" fill="#D2D8E2"');
    const tiledFar = map.indexOf('fill="url(#tile-sidewalk-far)"');
    for (const [flat, tiled] of [
      [flatSidewalk, tiledSidewalk],
      [flatRoad, tiledRoad],
      [flatFar, tiledFar],
    ] as const) {
      expect(flat).toBeGreaterThan(-1);
      expect(tiled).toBeGreaterThan(-1);
      expect(flat, 'fill datar harus di bawah fill berpola').toBeLessThan(tiled);
    }
  });

  it('enam fill berpola memakai kelima tile jalan + paving (aspal, dash, 2 edge, paving)', () => {
    for (const id of ['sidewalk-near', 'sidewalk-far', 'asphalt', 'edge-top', 'lane-dash', 'edge-bottom']) {
      expect(map).toContain(`url(#tile-${id})`);
      expect(map).toContain(`id="tile-${id}"`);
    }
    expect(map).toContain('imageRendering: \'pixelated\'');
    expect(map).toContain('patternUnits="userSpaceOnUse"');
    expect(map).toContain('patternTransform=');
  });

  it('empat properti jalan dipasang di trotoar, sebelum armada digambar', () => {
    const propIds = new Set(STREET_PROPS.map((p) => p.id));
    expect([...propIds].sort()).toEqual(['bush', 'hydrant', 'streetLamp', 'tree']);
    expect(STREET_PROPS.length).toBeGreaterThanOrEqual(4);
    // Inside the strip, clear of the lanes: base on the curb, 12 px tall.
    expect(STREET_PROP_SIZE).toBe(12);
    for (const prop of STREET_PROPS) {
      expect(prop.x).toBeGreaterThanOrEqual(0);
      expect(prop.x + STREET_PROP_SIZE).toBeLessThanOrEqual(380);
    }
    expect(map.indexOf('STREET_PROPS.map')).toBeLessThan(map.indexOf('fleet.map'));
    expect(map).toContain('y={CURB_Y - STREET_PROP_SIZE}');
    expect(map).toContain('href={streetTileUrl(prop.id)}');
  });

  it('tidak ada kerja per-frame baru: tidak ada requestAnimationFrame/useEffect di strip', () => {
    const strip = map.slice(map.indexOf('const StreetStrip'), map.indexOf('interface MapProps'));
    expect(strip.match(/useAnimationFrame/g)?.length).toBe(1); // the fleet only
    expect(strip).not.toContain('setInterval');
    expect(strip).not.toContain('requestAnimationFrame(');
  });
});

describe('licence + provenance (Rule R3)', () => {
  it('lisensi CC0 Kenney asli ikut ter-commit, persis seperti di zip', () => {
    const licence = `${STREET_DIR}LICENSE-Kenney.txt`;
    expect(existsSync(licence)).toBe(true);
    const text = readFileSync(licence, 'utf8');
    expect(text).toContain('RPG Urban Pack 1.0');
    expect(text).toContain('Kenney (www.kenney.nl)');
    expect(text).toContain('Creative Commons Zero, CC0');
    expect(text).toContain('creativecommons.org/publicdomain/zero/1.0');
    expect(text.length).toBeGreaterThan(400);
  });

  it('PROVENANCE.md mencatat pack, penulis, tanggal, indeks atlas, dan ukuran', () => {
    const provenance = readFileSync(`${STREET_DIR}PROVENANCE.md`, 'utf8');
    expect(provenance).toContain('RPG Urban Pack 1.0');
    expect(provenance).toContain('Kenney');
    expect(provenance).toContain('CC0');
    expect(provenance).toContain('2026-10-14');
    expect(provenance).toContain('row * 27 + col');
    expect(provenance).toContain('No standalone kerb tile exists in this pack');
    for (const file of Object.values(STREET_TILES)) {
      expect(provenance, file).toContain(file);
    }
    expect(provenance).toContain('streetTiles.ts');
  });
});
