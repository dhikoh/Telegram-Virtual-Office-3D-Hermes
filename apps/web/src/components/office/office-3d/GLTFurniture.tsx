/**
 * Tahap 13 — CC0 props layered ON TOP of the procedural scene
 * (docs/DESIGN_DIRECTION.md §13).
 *
 * Nothing here is load-bearing. The GLB props are fetched only after this
 * component has mounted inside a live <Canvas>, so first paint is untouched;
 * ECO/low-power never fetches them at all; and a failed fetch leaves `scenes`
 * empty, which renders nothing and leaves the primitive desks, sofas and
 * approval gate exactly as they were (fallback utuh).
 *
 * Slots are deliberately parked in the corners and edges of each room: the
 * agent placements from packages/shared/src/layout.ts own the desks
 * (room.desk3d) and the lounge grid (LOUNGE_SLOTS), and props must not sit on
 * top of them.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { APPROVAL_GATE, LOUNGE_AREA, ROOM_LAYOUTS } from '@hermes-office/shared';
import type { Group } from 'three';
import { usePowerStore } from '../../../stores/power';
import type { FurnitureModelId } from './glbFurniture';
import { loadFurnitureScenes, type FurnitureScenes } from './loadFurnitureModels';

/** Kenney models are ~1.5x smaller than the office's 1-unit desks. */
export const PROP_SCALE = 1.25;

export interface FurnitureSlot {
  model: FurnitureModelId;
  position: [number, number, number];
  rotationY: number;
}

type Offset = { model: FurnitureModelId; offset: [number, number, number]; rotationY?: number };

/** Per-department props, relative to the room's own pos3d (back corners). */
const ROOM_OFFSETS: Offset[] = [
  { model: 'bookcaseOpen', offset: [-1.75, 0.03, -1.35], rotationY: Math.PI },
  { model: 'chairModernCushion', offset: [1.6, 0.03, -1.2], rotationY: Math.PI },
];

const LOUNGE_OFFSETS: Offset[] = [
  { model: 'loungeSofa', offset: [-1.1, 0.03, -0.9], rotationY: Math.PI / 2 },
  { model: 'loungeSofa', offset: [1.1, 0.03, 1.0], rotationY: -Math.PI / 2 },
  { model: 'sideTable', offset: [0, 0.03, 0] },
  { model: 'pottedPlant', offset: [0, 0.03, 3.2] },
  { model: 'pottedPlant', offset: [0, 0.03, -3.2] },
  { model: 'lampRoundFloor', offset: [-1.95, 0.03, -3.3] },
  { model: 'lampRoundFloor', offset: [1.95, 0.03, -3.3] },
];

const GATE_OFFSETS: Offset[] = [
  { model: 'pottedPlant', offset: [-2.0, 0.03, 0] },
  { model: 'pottedPlant', offset: [2.0, 0.03, 0] },
];

function place(
  base: [number, number, number],
  offsets: Offset[],
  into: FurnitureSlot[]
): void {
  for (const { model, offset, rotationY } of offsets) {
    into.push({
      model,
      position: [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]],
      rotationY: rotationY ?? 0,
    });
  }
}

export function buildFurnitureSlots(): FurnitureSlot[] {
  const slots: FurnitureSlot[] = [];
  for (const room of Object.values(ROOM_LAYOUTS)) place(room.pos3d, ROOM_OFFSETS, slots);
  place(LOUNGE_AREA.pos3d, LOUNGE_OFFSETS, slots);
  place(APPROVAL_GATE.pos3d, GATE_OFFSETS, slots);
  return slots;
}

export const FURNITURE_SLOTS = buildFurnitureSlots();

export const GLTFurniture: React.FC = () => {
  const isLowPower = usePowerStore((state) => state.isLowPower);
  const invalidate = useThree((state) => state.invalidate);
  const [scenes, setScenes] = useState<FurnitureScenes | null>(null);

  useEffect(() => {
    // ECO / low-power keeps the scene at its procedural minimum (Rule 9.3).
    if (isLowPower) return undefined;

    let alive = true;
    loadFurnitureScenes().then((loaded) => {
      if (!alive) return;
      setScenes(loaded);
      // frameloop="demand": ask for one frame so the new geometry shows up.
      invalidate();
    });

    return () => {
      alive = false;
    };
  }, [isLowPower, invalidate]);

  // Clones share geometry and materials with the cached source scene, so 24
  // props cost 24 transform nodes, not 24 copies of the geometry.
  const instances = useMemo(() => {
    if (!scenes) return [];
    return FURNITURE_SLOTS.map((slot) => {
      const source = scenes[slot.model];
      return source ? { slot, object: source.clone(true) } : null;
    }).filter((entry): entry is { slot: FurnitureSlot; object: Group } => entry !== null);
  }, [scenes]);

  if (instances.length === 0) return null;

  return (
    <group name="cc0-furniture">
      {instances.map(({ slot, object }, index) => (
        <primitive
          key={`${slot.model}-${index}`}
          object={object}
          position={slot.position}
          rotation={[0, slot.rotationY, 0]}
          scale={PROP_SCALE}
        />
      ))}
    </group>
  );
};

export default GLTFurniture;
