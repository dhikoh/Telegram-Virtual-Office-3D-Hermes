/**
 * Tahap 4a regression: the window must actually show the street.
 *
 * The first cut of the backdrop put the sill at y=1.1 and the lanes four
 * units further out, and the default camera looked straight over the traffic
 * — the wall read as a blank slab. These tests solve the sight line from the
 * default framing through the opening and fail if the street slips out of
 * view again, which is invisible to every other test in the suite.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_VIEW } from '../office-3d/CameraController';
import { WALL_Z, WINDOW_SILL, WINDOW_HEAD, WINDOW_HALF_WIDTH, LANE_Z } from '../office-3d/Backdrop';

/** Camera position produced by CameraController.apply() for the default view. */
const camera: [number, number, number] = (() => {
  const { azimuth, elevation, radius } = DEFAULT_VIEW;
  const cosEl = Math.cos(elevation);
  return [
    radius * Math.sin(azimuth) * cosEl,
    radius * Math.sin(elevation),
    radius * Math.cos(azimuth) * cosEl,
  ];
})();

/** Height of the sight line to `point` where it crosses the wall plane. */
function heightAtWall(point: [number, number, number]): [number, number] {
  const dz = point[2] - camera[2];
  const t = (WALL_Z - camera[2]) / dz;
  const x = camera[0] + (point[0] - camera[0]) * t;
  const y = camera[1] + (point[1] - camera[1]) * t;
  return [x, y];
}

describe('diorama window sight line (Tahap 4a)', () => {
  it('sees both traffic lanes through the opening', () => {
    for (const laneZ of LANE_Z) {
      const [x, y] = heightAtWall([0, 0.45, laneZ]);
      expect(Math.abs(x)).toBeLessThanOrEqual(WINDOW_HALF_WIDTH);
      expect(y).toBeGreaterThanOrEqual(WINDOW_SILL);
      expect(y).toBeLessThanOrEqual(WINDOW_HEAD);
    }
  });

  it('sees the road surface itself, not just the cars', () => {
    for (const laneZ of LANE_Z) {
      const [, y] = heightAtWall([0, 0, laneZ]);
      expect(y).toBeGreaterThanOrEqual(WINDOW_SILL);
    }
  });

  it('sees the lower storeys of the skyline behind the road', () => {
    const [, y] = heightAtWall([1, 1, -18.8]);
    expect(y).toBeGreaterThanOrEqual(WINDOW_SILL);
    expect(y).toBeLessThanOrEqual(WINDOW_HEAD);
  });

  it('keeps the opening tall enough to matter', () => {
    expect(WINDOW_HEAD - WINDOW_SILL).toBeGreaterThanOrEqual(2.5);
    expect(WINDOW_SILL).toBeLessThan(1); // low enough to look down at the road
  });

  it('keeps the camera outside the wall', () => {
    expect(camera[2]).toBeGreaterThan(WALL_Z);
    expect(camera[1]).toBeGreaterThan(WINDOW_HEAD);
  });
});
