import { describe, it, expect } from 'vitest';
import {
  getAgentPlacement,
  DEPARTMENTS,
  ROOM_LAYOUTS,
  APPROVAL_GATE,
  LOUNGE_SLOTS,
} from './index.js';

describe('Shared Layout & getAgentPlacement (Rule 9.1 & REQ-106)', () => {
  it('covers every department when status is working or thinking', () => {
    DEPARTMENTS.forEach((dept) => {
      const placement = getAgentPlacement({ id: `agent-${dept}`, department: dept }, 'working');
      expect(placement.zone).toBe(dept);
      expect(placement.pos2d).toEqual(ROOM_LAYOUTS[dept].desk2d);
      expect(placement.pos3d).toEqual(ROOM_LAYOUTS[dept].desk3d);
      expect(placement.roomNameKey).toBe(ROOM_LAYOUTS[dept].nameKey);
    });
  });

  it('routes waiting_approval to Approval Gate with exact 2D and 3D coordinates', () => {
    const placement = getAgentPlacement({ id: 'agent-finance', department: 'finance' }, 'waiting_approval');
    expect(placement.zone).toBe('approval_gate');
    expect(placement.pos2d).toEqual(APPROVAL_GATE.pos2d);
    expect(placement.pos3d).toEqual(APPROVAL_GATE.pos3d);
    expect(placement.roomNameKey).toBe(APPROVAL_GATE.nameKey);
  });

  it('routes idle agents to Lounge slots distributed by slotIndex', () => {
    const p0 = getAgentPlacement({ id: 'agent-1', department: 'sales' }, 'idle', 0);
    expect(p0.zone).toBe('lounge');
    expect(p0.pos2d).toEqual(LOUNGE_SLOTS[0].pos2d);
    expect(p0.pos3d).toEqual(LOUNGE_SLOTS[0].pos3d);

    const p1 = getAgentPlacement({ id: 'agent-2', department: 'social' }, 'idle', 1);
    expect(p1.zone).toBe('lounge');
    expect(p1.pos2d).toEqual(LOUNGE_SLOTS[1].pos2d);
    expect(p1.pos3d).toEqual(LOUNGE_SLOTS[1].pos3d);

    // Tests modulo wrap around
    const pWrap = getAgentPlacement({ id: 'agent-9', department: 'hr' }, 'idle', 8);
    expect(pWrap.pos2d).toEqual(LOUNGE_SLOTS[0].pos2d);
  });

  it('handles error, offline, and unknown statuses inside department desk', () => {
    const pError = getAgentPlacement({ id: 'agent-analytics', department: 'analytics' }, 'error');
    expect(pError.zone).toBe('analytics');
    expect(pError.pos2d).toEqual(ROOM_LAYOUTS.analytics.desk2d);

    const pOffline = getAgentPlacement({ id: 'agent-command', department: 'command' }, 'offline');
    expect(pOffline.zone).toBe('command');
    expect(pOffline.pos2d).toEqual(ROOM_LAYOUTS.command.desk2d);
  });

  it('falls back to command department if agent has no department', () => {
    const pUnknown = getAgentPlacement({ id: 'orphan' }, 'working');
    expect(pUnknown.zone).toBe('command');
    expect(pUnknown.pos2d).toEqual(ROOM_LAYOUTS.command.desk2d);
  });
});
