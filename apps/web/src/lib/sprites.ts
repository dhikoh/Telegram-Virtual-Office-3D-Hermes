/**
 * Tahap 5 — text map to data URL (DESIGN_DIRECTION.md 4).
 *
 * The sprite maps live in @hermes-office/shared so both renderers and the
 * unit tests read the same strings; this module is the browser half: it paints
 * a map into a tiny canvas with nearest-neighbour scaling and caches the PNG
 * data URL per (map, palette, scale). Ten agents over four departments share
 * the same handful of cached images.
 *
 * No canvas (SSR, tests, ECO webview): returns null and callers fall back to
 * the emoji they already render today.
 */

import { spriteGrid, type SpriteMap } from '@hermes-office/shared';

const cache = new Map<string, string | null>();

function cacheKey(map: SpriteMap, palette: Record<string, string>, scale: number): string {
  const pal = Object.entries(palette)
    .map(([k, v]) => k + v)
    .sort()
    .join(',');
  return `${scale}|${map.join('')}|${pal}`;
}

export function spriteDataUrl(
  map: SpriteMap,
  palette: Record<string, string>,
  scale = 2
): string | null {
  if (typeof document === 'undefined') return null;
  const key = cacheKey(map, palette, scale);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let out: string | null = null;
  try {
    const { width, height } = spriteGrid(map);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Nearest-neighbour only: a smoothed pixel sprite is not pixel art.
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const cell = map[y][x];
          if (cell === '.') continue;
          ctx.fillStyle = palette[cell] ?? '#2B3444';
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
      out = canvas.toDataURL('image/png');
    }
  } catch {
    out = null;
  }
  cache.set(key, out);
  return out;
}

export default spriteDataUrl;
