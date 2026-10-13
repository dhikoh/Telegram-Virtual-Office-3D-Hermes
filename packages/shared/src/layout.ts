/**
 * Single source of truth for Office Floor Plan layout (Rule 9.1).
 * Used by both 2D SVG Map and 3D WebGL Scene.
 */

import { DEPARTMENTS, type Department } from './constants.js';

export interface RoomLayout {
  id: string;
  department?: Department;
  nameKey: string;
  color: string;
  pos2d: { x: number; y: number; width: number; height: number };
  pos3d: [number, number, number]; // [x, y, z] in 3D world space
  desk2d: { x: number; y: number };
  desk3d: [number, number, number];
}

export interface AgentPlacement {
  zone: string;
  roomNameKey: string;
  pos2d: { x: number; y: number };
  pos3d: [number, number, number];
}

// 2D Canvas is 380 x 420.
// 3D coordinates are centered at [0, 0, 0] with range approx [-9, 9] on X and [-10, 10] on Z.
export const ROOM_LAYOUTS: Record<Department, RoomLayout> = {
  command: {
    id: 'command',
    department: 'command',
    nameKey: 'office.rooms.command',
    color: '#22D3EE',
    pos2d: { x: 130, y: 15, width: 120, height: 75 },
    pos3d: [0, 0, -6.5],
    desk2d: { x: 190, y: 55 },
    desk3d: [0, 0, -6],
  },
  social: {
    id: 'social',
    department: 'social',
    nameKey: 'office.rooms.social',
    color: '#8B5CF6',
    pos2d: { x: 12, y: 15, width: 98, height: 75 },
    pos3d: [-6.5, 0, -6.5],
    desk2d: { x: 61, y: 56 },
    desk3d: [-6.5, 0, -6],
  },
  marketing: {
    id: 'marketing',
    department: 'marketing',
    nameKey: 'office.rooms.marketing',
    color: '#EC4899',
    pos2d: { x: 270, y: 15, width: 98, height: 75 },
    pos3d: [6.5, 0, -6.5],
    desk2d: { x: 319, y: 56 },
    desk3d: [6.5, 0, -6],
  },
  sales: {
    id: 'sales',
    department: 'sales',
    nameKey: 'office.rooms.sales',
    color: '#34D399',
    pos2d: { x: 12, y: 100, width: 98, height: 75 },
    pos3d: [-6.5, 0, -2],
    desk2d: { x: 61, y: 140 },
    desk3d: [-6.5, 0, -1.8],
  },
  analytics: {
    id: 'analytics',
    department: 'analytics',
    nameKey: 'office.rooms.analytics',
    color: '#38BDF8',
    pos2d: { x: 270, y: 100, width: 98, height: 75 },
    pos3d: [6.5, 0, -2],
    desk2d: { x: 319, y: 140 },
    desk3d: [6.5, 0, -1.8],
  },
  finance: {
    id: 'finance',
    department: 'finance',
    nameKey: 'office.rooms.finance',
    color: '#FBBF24',
    pos2d: { x: 12, y: 185, width: 98, height: 75 },
    pos3d: [-6.5, 0, 2.5],
    desk2d: { x: 61, y: 225 },
    desk3d: [-6.5, 0, 2.5],
  },
  support: {
    id: 'support',
    department: 'support',
    nameKey: 'office.rooms.support',
    color: '#A78BFA',
    pos2d: { x: 270, y: 185, width: 98, height: 75 },
    pos3d: [6.5, 0, 2.5],
    desk2d: { x: 319, y: 225 },
    desk3d: [6.5, 0, 2.5],
  },
  hr: {
    id: 'hr',
    department: 'hr',
    nameKey: 'office.rooms.hr',
    color: '#F43F5E',
    pos2d: { x: 12, y: 275, width: 98, height: 75 },
    pos3d: [-6.5, 0, 7],
    desk2d: { x: 61, y: 315 },
    desk3d: [-6.5, 0, 7],
  },
};

export const APPROVAL_GATE: {
  pos2d: { x: number; y: number };
  pos3d: [number, number, number];
  nameKey: string;
} = {
  pos2d: { x: 190, y: 108 },
  pos3d: [0, 0, -3.5],
  nameKey: 'office.rooms.approvalGate',
};

export const LOUNGE_AREA = {
  pos2d: { x: 130, y: 145, width: 120, height: 180 },
  pos3d: [0, 0, 2.5] as [number, number, number],
  nameKey: 'office.rooms.lounge',
};

/**
 * 8 idle slots as a strict 2 columns x 4 rows grid (P2 of the 2026-10-13
 * review). The old layout put slots 7-8 on x=190, between the two columns,
 * so with 8 idle demo agents every avatar overlapped its neighbour.
 *
 * 2D: columns 150/230 (80 px apart, avatar is 40 px wide), rows 170/210/250/290
 * (40 px apart, avatar is 40 px tall — name pills are suppressed for the
 * idle cluster). The coffee table at (190, 225) spans x 172-208, which the
 * columns clear.
 * 3D: x +/-2 clears the same coffee table (radius 0.9 at the room origin).
 */
export const LOUNGE_SLOTS: Array<{
  pos2d: { x: number; y: number };
  pos3d: [number, number, number];
}> = [
  { pos2d: { x: 150, y: 170 }, pos3d: [-2, 0, 0.6] },
  { pos2d: { x: 230, y: 170 }, pos3d: [2, 0, 0.6] },
  { pos2d: { x: 150, y: 210 }, pos3d: [-2, 0, 2.2] },
  { pos2d: { x: 230, y: 210 }, pos3d: [2, 0, 2.2] },
  { pos2d: { x: 150, y: 250 }, pos3d: [-2, 0, 3.8] },
  { pos2d: { x: 230, y: 250 }, pos3d: [2, 0, 3.8] },
  { pos2d: { x: 150, y: 290 }, pos3d: [-2, 0, 5.4] },
  { pos2d: { x: 230, y: 290 }, pos3d: [2, 0, 5.4] },
];

/**
 * Pure function computing 2D and 3D placements for an agent based on status (Rule 9.1).
 */
export function getAgentPlacement(
  agent: { id: string; department?: string },
  status: string,
  slotIndex = 0
): AgentPlacement {
  if (status === 'waiting_approval') {
    return {
      zone: 'approval_gate',
      roomNameKey: APPROVAL_GATE.nameKey,
      pos2d: APPROVAL_GATE.pos2d,
      pos3d: APPROVAL_GATE.pos3d,
    };
  }

  if (status === 'idle') {
    const slot = LOUNGE_SLOTS[Math.abs(slotIndex) % LOUNGE_SLOTS.length];
    return {
      zone: 'lounge',
      roomNameKey: LOUNGE_AREA.nameKey,
      pos2d: slot.pos2d,
      pos3d: slot.pos3d,
    };
  }

  // Thinking, working, error, offline -> placed in department room
  const dept = (agent.department || 'command') as Department;
  const room = ROOM_LAYOUTS[dept] || ROOM_LAYOUTS.command;

  return {
    zone: dept,
    roomNameKey: room.nameKey,
    pos2d: room.desk2d,
    pos3d: room.desk3d,
  };
}

/**
 * Room focus (Tahap 4b, docs/DESIGN_DIRECTION.md 7.4 "Konsekuensi Konsep A").
 *
 * Konsep A ends the "ten rooms at once" navigation: the world shows one active
 * room and a chip row to jump between them. The focus target lives here,
 * next to the placements, so 2D and 3D agree on which room the chips mean
 * (Rule 9.1) instead of each renderer inventing its own centre.
 */
export type RoomFocusId = 'all' | Department | 'lounge' | 'approvalGate';

/** Chip row order: overview first, then departments, then the shared rooms. */
export const ROOM_FOCUS_IDS: RoomFocusId[] = ['all', ...DEPARTMENTS, 'lounge', 'approvalGate'];

export function isRoomFocusId(value: string): value is RoomFocusId {
  return (ROOM_FOCUS_IDS as string[]).includes(value);
}

/** 3D camera look-at for a focus id; 'all' is the full-diorama overview. */
export function getRoomFocusTarget(id: RoomFocusId): [number, number, number] {
  if (id === 'all') return [0, 0, 0];
  if (id === 'lounge') return LOUNGE_AREA.pos3d;
  if (id === 'approvalGate') return APPROVAL_GATE.pos3d;
  const room = ROOM_LAYOUTS[id];
  return room ? room.pos3d : [0, 0, 0];
}

/** i18n key for a focus id; 'all' has no entry in ROOM_LAYOUTS. */
export function getRoomFocusNameKey(id: RoomFocusId): string {
  if (id === 'all') return 'office.rooms.all';
  if (id === 'lounge') return LOUNGE_AREA.nameKey;
  if (id === 'approvalGate') return APPROVAL_GATE.nameKey;
  const room = ROOM_LAYOUTS[id];
  return room ? room.nameKey : 'office.rooms.all';
}

/** 2D highlight bounds in the 380x420 canvas; null means "no focus". */
export function getRoomFocusRect2d(
  id: RoomFocusId
): { x: number; y: number; width: number; height: number } | null {
  if (id === 'all') return null;
  if (id === 'lounge') return LOUNGE_AREA.pos2d;
  if (id === 'approvalGate') {
    const { x, y } = APPROVAL_GATE.pos2d;
    return { x: x - 45, y: y - 20, width: 90, height: 40 };
  }
  const room = ROOM_LAYOUTS[id];
  return room ? room.pos2d : null;
}
