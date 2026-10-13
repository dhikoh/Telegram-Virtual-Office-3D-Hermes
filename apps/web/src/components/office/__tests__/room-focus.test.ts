/**
 * Tahap 4b — room focus / chip navigation.
 *
 * Konsekuensi Konsep A: navigation is "active room + chips", so the focus
 * target, the label key and the 2D highlight all come from layout.ts. If a
 * room is added there and nobody wires it into the chips or the map, these
 * tests fail instead of the room silently staying unreachable.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEPARTMENTS,
  ROOM_FOCUS_IDS,
  ROOM_LAYOUTS,
  LOUNGE_AREA,
  APPROVAL_GATE,
  getRoomFocusTarget,
  getRoomFocusNameKey,
  getRoomFocusRect2d,
  isRoomFocusId,
} from '@hermes-office/shared';

const I18N = readFileSync(
  fileURLToPath(new URL('../../../i18n/index.ts', import.meta.url)),
  'utf8'
);
const MAP_TSX = readFileSync(
  fileURLToPath(new URL('../Map.tsx', import.meta.url)),
  'utf8'
);

describe('ROOM_FOCUS_IDS', () => {
  it('covers every department plus overview, lounge and gate', () => {
    expect(ROOM_FOCUS_IDS).toEqual(['all', ...DEPARTMENTS, 'lounge', 'approvalGate']);
    expect(new Set(ROOM_FOCUS_IDS).size).toBe(ROOM_FOCUS_IDS.length);
    expect(ROOM_FOCUS_IDS.length).toBe(11); // overview + 8 departments + lounge + gate
  });

  it('rejects unknown ids', () => {
    expect(isRoomFocusId('command')).toBe(true);
    expect(isRoomFocusId('lounge')).toBe(true);
    expect(isRoomFocusId('warehouse')).toBe(false);
    expect(isRoomFocusId('')).toBe(false);
  });
});

describe('getRoomFocusTarget', () => {
  it('centres the overview on the world origin', () => {
    expect(getRoomFocusTarget('all')).toEqual([0, 0, 0]);
  });

  it('reuses the placement coordinates instead of inventing centres (Rule 9.1)', () => {
    for (const dept of DEPARTMENTS) {
      expect(getRoomFocusTarget(dept)).toEqual(ROOM_LAYOUTS[dept].pos3d);
    }
    expect(getRoomFocusTarget('lounge')).toEqual(LOUNGE_AREA.pos3d);
    expect(getRoomFocusTarget('approvalGate')).toEqual(APPROVAL_GATE.pos3d);
  });

  it('stays inside the office footprint for every chip', () => {
    for (const id of ROOM_FOCUS_IDS) {
      const [x, y, z] = getRoomFocusTarget(id);
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(9.5);
      expect(Math.abs(z)).toBeLessThanOrEqual(10.5);
      expect(y).toBe(0);
    }
  });
});

describe('getRoomFocusNameKey', () => {
  it('resolves to a label that exists in both languages', () => {
    for (const id of ROOM_FOCUS_IDS) {
      const key = getRoomFocusNameKey(id); // e.g. office.rooms.command
      const leaf = key.split('.').pop() as string;
      // i18n/index.ts declares the key once per block, four blocks in total
      // (top-level + nested, id + en); at least four entries must exist.
      const occurrences = I18N.split(`${leaf}:`).length - 1;
      expect(occurrences, `${key} missing from i18n/index.ts`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('getRoomFocusRect2d', () => {
  it('returns nothing for the overview', () => {
    expect(getRoomFocusRect2d('all')).toBeNull();
  });

  it('returns a real, in-bounds box for every focused room', () => {
    for (const id of ROOM_FOCUS_IDS) {
      const rect = getRoomFocusRect2d(id);
      if (!rect) continue;
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(380);
      expect(rect.y + rect.height).toBeLessThanOrEqual(420);
    }
  });

  it('boxes the approval gate around its own point', () => {
    const rect = getRoomFocusRect2d('approvalGate');
    expect(rect).not.toBeNull();
    const { x, y, width, height } = rect!;
    expect(APPROVAL_GATE.pos2d.x).toBeGreaterThanOrEqual(x);
    expect(APPROVAL_GATE.pos2d.x).toBeLessThanOrEqual(x + width);
    expect(APPROVAL_GATE.pos2d.y).toBeGreaterThanOrEqual(y);
    expect(APPROVAL_GATE.pos2d.y).toBeLessThanOrEqual(y + height);
  });
});

describe('2D map reaction to the active room', () => {
  it('dims every room group except the active one', () => {
    const groups = MAP_TSX.match(/<g id="room-[a-z-]+"/g) || [];
    expect(groups.length).toBe(10);
    const styled = MAP_TSX.match(/<g id="room-[a-z-]+" style=\{roomStyle\('[a-zA-Z]+'\)\}/g) || [];
    expect(styled.length).toBe(10);
  });

  it('wires the HR door button to the same focus dimming', () => {
    expect(MAP_TSX).toContain("style={roomStyle('hr')}");
  });
});
