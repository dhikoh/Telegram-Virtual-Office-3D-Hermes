/**
 * 3D Office Furniture & Architectural Elements (Rule REQ-115).
 * Room perimeters, instanced desks, lounge sofas, and approval gate.
 *
 * Tahap 17 — a room pad is no longer one 4.8 x 3.8 slab shared by every
 * department. The footprint is composed from the boxes `roomShapeBoxes`
 * returns for the room's own `shape`, the pad surface carries the room's
 * `floor` recipe (base colour, accent band, thin pattern strips) and a
 * `partition` adds a glazed panel along the front edge. Shape, floor and
 * glazing all come from `roomVariants.ts` in the shared package (Rule 9.1) —
 * the same table Map.tsx draws from.
 */

import React from 'react';
import {
  ROOM_LAYOUTS,
  LOUNGE_AREA,
  APPROVAL_GATE,
  ROOM_PAD,
  GLAZING,
  roomVariant,
  roomShapeBoxes,
  roomFloorStrips,
  roomFloorBand3d,
  roomFrontEdge3d,
  type RoomVariant,
} from '@hermes-office/shared';
import { GLTFurniture } from './GLTFurniture';

interface FurnitureProps {
  onSelectRoom?: (nameKey: string) => void;
}

/** Pad slab top: the old single slab was 0.04 tall; the layers sit on top. */
const PAD_TOP = 0.02;
const PAD_LAYER = 0.012;

/**
 * One department room: footprint boxes, floor pattern, accent band, glazed
 * front, and the desk. Every piece of geometry comes from the shared variant
 * plus `ROOM_PAD`, so no shape is declared here.
 */
const RoomPad: React.FC<{
  variant: RoomVariant;
  nameKey: string;
  onSelectRoom?: (nameKey: string) => void;
}> = ({ variant, nameKey, onSelectRoom }) => {
  const { width, depth } = ROOM_PAD;
  const boxes = roomShapeBoxes(variant.shape, width, depth);
  const strips = roomFloorStrips(variant.floor, width, depth);
  const band = roomFloorBand3d(variant.floor, variant.shape, width, depth);
  const front = roomFrontEdge3d(variant.shape, width, depth);
  const paneHeight = variant.partition === 'half-wall' ? 0.7 : 1.5;
  const paneOpacity =
    variant.partition === 'half-wall' ? GLAZING.halfWallOpacity : GLAZING.partitionOpacity;

  return (
    <>
      {boxes.map((box, i) => (
        <group key={`pad-${i}`} position={[box.x, 0, box.z]}>
          {/* Room Base Floor Pad — one box per footprint piece, so an L-shape
              or a notch really is a cut slab and not a painted rectangle. */}
          <mesh
            position={[0, PAD_TOP, 0]}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom?.(nameKey);
            }}
          >
            <boxGeometry args={[box.width, 0.04, box.depth]} />
            <meshStandardMaterial color={variant.floor.base} roughness={0.9} metalness={0} />
          </mesh>

          {/* Room Perimeter Trim — the room's own ink, still a wireframe. */}
          <mesh position={[0, PAD_TOP + 0.04, 0]}>
            <boxGeometry args={[box.width + 0.1, 0.02, box.depth + 0.1]} />
            <meshBasicMaterial color={variant.floor.accent} wireframe />
          </mesh>
        </group>
      ))}

      {/* Floor pattern: thin strips in the room's line / accent ink, standing
          just above the pad so they read as a surface, never as a wall. */}
      {strips.map((strip, i) => (
        <mesh key={`strip-${i}`} position={[strip.x, PAD_TOP + PAD_LAYER, strip.z]}>
          <boxGeometry args={[strip.width, 0.006, strip.depth]} />
          <meshStandardMaterial
            color={strip.tone === 'accent' ? variant.floor.accent : variant.floor.line}
            roughness={0.95}
            metalness={0}
          />
        </mesh>
      ))}

      {/* Accent band: on the front edge, or inset from it, per `floor.band`. */}
      {band && (
        <mesh position={[band.x, PAD_TOP + PAD_LAYER, band.z]}>
          <boxGeometry args={[band.width, 0.008, band.depth]} />
          <meshStandardMaterial color={variant.floor.accent} roughness={0.9} metalness={0} />
        </mesh>
      )}

      {/* Partition glazing: one thin translucent pane along the front edge. */}
      {variant.partition !== 'none' && (
        <mesh position={[front.x, PAD_TOP + paneHeight / 2, front.z - 0.04]}>
          <boxGeometry args={[Math.max(0.4, front.width - 0.1), paneHeight, 0.05]} />
          <meshStandardMaterial
            color={GLAZING.color}
            transparent
            opacity={paneOpacity}
            depthWrite={false}
            roughness={0.15}
            metalness={0}
          />
        </mesh>
      )}
    </>
  );
};

export const Furniture: React.FC<FurnitureProps> = ({ onSelectRoom }) => {
  return (
    <group>
      {/* 8 Department Room Pads & Desk Stations */}
      {Object.values(ROOM_LAYOUTS).map((room) => (
        <group key={room.id} position={room.pos3d}>
          <RoomPad variant={roomVariant(room.id)} nameKey={room.nameKey} onSelectRoom={onSelectRoom} />

          {/* Department Work Desk */}
          <group position={[0, 0.3, 0.5]}>
            {/* Desktop Surface */}
            <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.8, 0.08, 0.9]} />
              <meshStandardMaterial color="#E2E8F0" roughness={0.55} metalness={0.05} />
            </mesh>
            {/* Holographic Monitor Screen */}
            <mesh position={[0, 0.45, -0.35]}>
              <boxGeometry args={[0.8, 0.5, 0.05]} />
              {/* Lit, not emissive: an unlit screen reads as neon on a light room */}
              <meshStandardMaterial color={room.color} roughness={0.8} metalness={0} />
            </mesh>
            {/* Desk Legs */}
            <mesh position={[-0.75, 0, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 0.55]} />
              <meshStandardMaterial color="#94A3B8" roughness={0.7} metalness={0.1} />
            </mesh>
            <mesh position={[0.75, 0, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 0.55]} />
              <meshStandardMaterial color="#94A3B8" roughness={0.7} metalness={0.1} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Approval Gate Section */}
      <group position={APPROVAL_GATE.pos3d}>
        <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 0.04, 1.6]} />
          <meshStandardMaterial
            color={roomVariant('approvalGate').floor.base}
            roughness={0.95}
            metalness={0}
          />
        </mesh>
        {/* Warning Caution Border */}
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[3.3, 0.02, 1.7]} />
          <meshBasicMaterial color="#FBBF24" wireframe />
        </mesh>
        {/* Gate Barrier Pillars */}
        <mesh position={[-1.4, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshStandardMaterial color="#F59E0B" roughness={0.6} metalness={0.1} />
        </mesh>
        <mesh position={[1.4, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshStandardMaterial color="#F59E0B" roughness={0.6} metalness={0.1} />
        </mesh>
      </group>

      {/* Central Lounge Area */}
      <group position={LOUNGE_AREA.pos3d}>
        {/* Lounge Carpet Pad */}
        <mesh position={[0, 0.015, 0]} receiveShadow>
          <boxGeometry args={[4.8, 0.03, 7.5]} />
          <meshStandardMaterial color={roomVariant('lounge').floor.base} roughness={0.95} metalness={0} />
        </mesh>
        <mesh position={[0, 0.035, 0]}>
          <boxGeometry args={[4.9, 0.01, 7.6]} />
          <meshBasicMaterial color={roomVariant('lounge').floor.accent} wireframe />
        </mesh>

        {/* Central Coffee Table */}
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.9, 0.9, 0.15, 16]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.45} metalness={0.15} />
        </mesh>
      </group>

      {/* Tahap 13 — CC0 GLB props (Kenney Furniture Kit). Purely additive:
          nothing above depends on them, and a failed load renders nothing at
          all, so the procedural desks, sofas and gate above remain the scene. */}
      <GLTFurniture />
    </group>
  );
};
