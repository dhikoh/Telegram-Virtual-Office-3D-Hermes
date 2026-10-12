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
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom?.(room.nameKey);
            }}
          >
            <boxGeometry args={[4.8, 0.04, 3.8]} />
            <meshStandardMaterial
              color="#0B132B"
              roughness={0.8}
              metalness={0.2}
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
            <mesh position={[0, 0.28, 0]}>
              <boxGeometry args={[1.8, 0.08, 0.9]} />
              <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Holographic Monitor Screen */}
            <mesh position={[0, 0.6, -0.2]}>
              <boxGeometry args={[0.8, 0.45, 0.04]} />
              <meshBasicMaterial color={room.color} />
            </mesh>
            {/* Desk Legs */}
            <mesh position={[-0.75, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.55]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh position={[0.75, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.55]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
          </group>
        </group>
      ))}

      {/* Approval Gate Section */}
      <group position={APPROVAL_GATE.pos3d}>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[3.2, 0.04, 1.6]} />
          <meshStandardMaterial color="#1C1917" roughness={0.9} />
        </mesh>
        {/* Warning Caution Border */}
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[3.3, 0.02, 1.7]} />
          <meshBasicMaterial color="#FBBF24" wireframe />
        </mesh>
        {/* Gate Barrier Pillars */}
        <mesh position={[-1.4, 0.4, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshBasicMaterial color="#FBBF24" />
        </mesh>
        <mesh position={[1.4, 0.4, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshBasicMaterial color="#FBBF24" />
        </mesh>
      </group>

      {/* Central Lounge Area */}
      <group position={LOUNGE_AREA.pos3d}>
        {/* Lounge Carpet Pad */}
        <mesh position={[0, 0.015, 0]}>
          <boxGeometry args={[4.8, 0.03, 7.5]} />
          <meshStandardMaterial color="#1E1B4B" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.035, 0]}>
          <boxGeometry args={[4.9, 0.01, 7.6]} />
          <meshBasicMaterial color="#8B5CF6" wireframe />
        </mesh>

        {/* Central Coffee Table */}
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.9, 0.9, 0.15, 16]} />
          <meshStandardMaterial color="#312E81" roughness={0.3} metalness={0.7} />
        </mesh>
      </group>
    </group>
  );
};
