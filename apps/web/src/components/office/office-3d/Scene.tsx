/**
 * 3D Scene Root Component (Rule REQ-110 to REQ-116).
 * Assembles lighting, floor, furniture, camera controller, and agent meshes.
 *
 * Tahap 3 — light world (docs/DESIGN_DIRECTION.md §3.1): one dominant key
 * light from the top-left carrying a phone-sized shadow map, a hemisphere
 * fill instead of a flat ambient wash, and a light ground. Depth comes from
 * contact shadows, not from a neon wireframe floor.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Html } from '@react-three/drei';
import { getAgentPlacement } from '@hermes-office/shared';
import { Furniture } from './Furniture';
import { Agent3D } from './Agent3D';
import { CameraController } from './CameraController';
import { useOfficeStore, type OfficeAgent } from '../../../stores/office';

interface SceneProps {
  onSelectAgent: (agent: OfficeAgent) => void;
  onOpenRecruitment?: () => void;
}

export const Scene: React.FC<SceneProps> = ({ onSelectAgent, onOpenRecruitment }) => {
  const { t } = useTranslation();
  const { agents } = useOfficeStore();
  const [activeRoomNotice, setActiveRoomNotice] = useState<string | null>(null);

  // Compute 3D placement for each agent using shared single source of truth (Rule 9.1)
  let idleCount = 0;
  const agentPlacements = agents.map((agent, idx) => {
    const slotIdx = agent.status === 'idle' ? idleCount++ : 0;
    const placement = getAgentPlacement(agent, agent.status, slotIdx);
    return {
      agent,
      targetPos: placement.pos3d,
      showLabel: idx < 20, // Cap visible HTML labels to 20 maximum (Rule REQ-111)
    };
  });

  const handleSelectRoom = (nameKey: string) => {
    // i18n-dynamic: office.rooms
    setActiveRoomNotice(t(nameKey));
    if (nameKey.includes('hr') && onOpenRecruitment) {
      onOpenRecruitment();
    }
    setTimeout(() => {
      setActiveRoomNotice(null);
    }, 2500);
  };

  return (
    <>
      <CameraController />

      {/* Lighting: sky/ground fill + ONE dominant key light (top-left, shadow
          casting) + a weak cool fill so cast shadows never crush to black. */}
      <hemisphereLight args={['#F8FAFC', '#E4D9C8', 0.55]} />
      <directionalLight
        position={[8, 14, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-9, 7, -7]} intensity={0.3} color="#E8F1FF" />

      {/* Main Floor (22 x 24 units) — light ground, receives the key shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[22, 24]} />
        <meshStandardMaterial color="#E7ECF3" roughness={0.95} metalness={0} />
      </mesh>

      {/* Soft floor grid — measurement aid, not a neon effect */}
      <gridHelper args={[22, 22, '#C3CCDA', '#DCE3EC']} position={[0, 0.005, 0]} />

      {/* 3D Rooms & Procedural Furniture */}
      <Furniture onSelectRoom={handleSelectRoom} />

      {/* Low-Poly Agents with Smooth Movement */}
      {agentPlacements.map(({ agent, targetPos, showLabel }) => (
        <Agent3D
          key={agent.id}
          agent={agent}
          targetPos={targetPos}
          onSelect={onSelectAgent}
          showLabel={showLabel}
        />
      ))}
      {/* Floating Room Info Banner upon Tap (Rule REQ-113) */}
      {activeRoomNotice && (
        <Html position={[0, 4.5, 0]} center>
          <div className="bg-office-surface text-office-accent-ink border border-office-border px-3 py-1.5 rounded-full text-xs font-mono shadow-nu-raised flex items-center space-x-1.5 whitespace-nowrap pointer-events-none">
            <span>🏢</span>
            <span className="font-bold">{activeRoomNotice}</span>
          </div>
        </Html>
      )}
    </>
  );
};
