/**
 * Modular Office Architecture & Layout Component.
 *
 * Places KayKit Prototype Bits modular walls, glass windows, pillars,
 * work desks, meeting tables, and storage boxes into the virtual office.
 *
 * Fully modular and expandable for adding future rooms.
 * Zero-load on ECO/low-power mode; failure-tolerant (Rule 9.3 & 9.4).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { ROOM_LAYOUTS, LOUNGE_AREA, APPROVAL_GATE } from '@hermes-office/shared';
import type { Group } from 'three';
import { usePowerStore } from '../../../stores/power';
import type { ModularModelId } from './glbModular';
import { loadModularScenes, type ModularScenes } from './loadModularModels';

export const MODULAR_SCALE = 1.1;

export interface ModularSlot {
  model: ModularModelId;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
}

export function buildModularOfficeSlots(): ModularSlot[] {
  const slots: ModularSlot[] = [];

  // 1. Department Rooms: modular rear walls, corner pillars, and desks
  for (const [dept, room] of Object.entries(ROOM_LAYOUTS)) {
    const [rx, ry, rz] = room.pos3d;
    const isLeftWing = rx < 0;
    const isCommand = dept === 'command';

    // Rear wall or window
    const wallModel: ModularModelId = isCommand
      ? 'wall_window'
      : dept === 'analytics' || dept === 'social'
      ? 'wall_window'
      : 'wall';

    slots.push({
      model: wallModel,
      position: [rx, ry, rz - 1.8],
      rotationY: 0,
      scale: MODULAR_SCALE,
    });

    // Outer corner pillar
    const pillarX = isLeftWing ? rx - 2.2 : rx + 2.2;
    slots.push({
      model: 'pillar',
      position: [pillarX, ry, rz - 1.8],
      rotationY: 0,
      scale: MODULAR_SCALE,
    });

    // Half-wall divider between adjacent rooms
    slots.push({
      model: 'wall_half',
      position: [isLeftWing ? rx + 2.1 : rx - 2.1, ry, rz],
      rotationY: Math.PI / 2,
      scale: MODULAR_SCALE,
    });

    // Archive storage box near desk
    slots.push({
      model: 'box_archive',
      position: [room.desk3d[0] + (isLeftWing ? 0.9 : -0.9), ry, room.desk3d[2] - 0.4],
      rotationY: isLeftWing ? 0.2 : -0.2,
      scale: 0.85,
    });
  }

  // 2. Central Lounge / Meeting Area: Conference Table
  slots.push({
    model: 'table_meeting',
    position: [LOUNGE_AREA.pos3d[0], LOUNGE_AREA.pos3d[1], LOUNGE_AREA.pos3d[2]],
    rotationY: 0,
    scale: 1.2,
  });

  // 3. Approval Gate: Entrance Doorway & Pillars
  slots.push({
    model: 'wall_doorway',
    position: [APPROVAL_GATE.pos3d[0], APPROVAL_GATE.pos3d[1], APPROVAL_GATE.pos3d[2] - 0.8],
    rotationY: 0,
    scale: MODULAR_SCALE,
  });
  slots.push({
    model: 'pillar',
    position: [APPROVAL_GATE.pos3d[0] - 1.6, APPROVAL_GATE.pos3d[1], APPROVAL_GATE.pos3d[2] - 0.8],
    rotationY: 0,
    scale: MODULAR_SCALE,
  });
  slots.push({
    model: 'pillar',
    position: [APPROVAL_GATE.pos3d[0] + 1.6, APPROVAL_GATE.pos3d[1], APPROVAL_GATE.pos3d[2] - 0.8],
    rotationY: 0,
    scale: MODULAR_SCALE,
  });

  return slots;
}

export const MODULAR_OFFICE_SLOTS = buildModularOfficeSlots();

export const GLTModularOffice: React.FC = () => {
  const isLowPower = usePowerStore((state) => state.isLowPower);
  const invalidate = useThree((state) => state.invalidate);
  const [scenes, setScenes] = useState<ModularScenes | null>(null);

  useEffect(() => {
    if (isLowPower) return undefined;

    let alive = true;
    loadModularScenes().then((loaded) => {
      if (!alive) return;
      setScenes(loaded);
      invalidate();
    });

    return () => {
      alive = false;
    };
  }, [isLowPower, invalidate]);

  const instances = useMemo(() => {
    if (!scenes) return [];
    return MODULAR_OFFICE_SLOTS.map((slot) => {
      const source = scenes[slot.model];
      return source ? { slot, object: source.clone(true) } : null;
    }).filter((entry): entry is { slot: ModularSlot; object: Group } => entry !== null);
  }, [scenes]);

  if (instances.length === 0) return null;

  return (
    <group name="kaykit-modular-office">
      {instances.map(({ slot, object }, index) => (
        <primitive
          key={`${slot.model}-${index}`}
          object={object}
          position={slot.position}
          rotation={[0, slot.rotationY, 0]}
          scale={slot.scale ?? MODULAR_SCALE}
        />
      ))}
    </group>
  );
};

export default GLTModularOffice;
