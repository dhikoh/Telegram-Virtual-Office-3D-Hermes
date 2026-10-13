/**
 * 3D Office Furniture & Architectural Elements (Rule REQ-115).
 * Room perimeters, instanced desks, lounge sofas, and approval gate.
 */

import React from 'react';
import { ROOM_LAYOUTS, LOUNGE_AREA, APPROVAL_GATE } from '@hermes-office/shared';

interface FurnitureProps {
  onSelectRoom?: (nameKey: string) => void;
}

export const Furniture: React.FC<FurnitureProps> = ({ onSelectRoom }) => {
  return (
    <group>
      {/* 8 Department Room Pads & Desk Stations */}
      {Object.values(ROOM_LAYOUTS).map((room) => (
        <group key={room.id} position={room.pos3d}>
          {/* Room Base Floor Pad */}
          <mesh
            position={[0, 0.02, 0]}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom?.(room.nameKey);
            }}
          >
            <boxGeometry args={[4.8, 0.04, 3.8]} />
            <meshStandardMaterial
              color="#F1F5F9"
              roughness={0.9}
              metalness={0}
            />
          </mesh>

          {/* Room Neon Perimeter Trim */}
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[4.9, 0.02, 3.9]} />
            <meshBasicMaterial color={room.color} wireframe />
          </mesh>

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
          <meshStandardMaterial color="#F5EBDB" roughness={0.95} metalness={0} />
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
          <meshStandardMaterial color="#E8E5F8" roughness={0.95} metalness={0} />
        </mesh>
        <mesh position={[0, 0.035, 0]}>
          <boxGeometry args={[4.9, 0.01, 7.6]} />
          <meshBasicMaterial color="#7C5CFC" wireframe />
        </mesh>

        {/* Central Coffee Table */}
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.9, 0.9, 0.15, 16]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.45} metalness={0.15} />
        </mesh>
      </group>
    </group>
  );
};
