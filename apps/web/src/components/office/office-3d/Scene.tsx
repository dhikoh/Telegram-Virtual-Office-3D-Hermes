/**
 * 3D Scene Root Component (Rule REQ-110 to REQ-116).
 * Assembles lighting, floor grid, furniture, camera controller, and agent meshes.
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

      {/* Ambient & Directional Cyberpunk Lighting */}
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 20, 15]} intensity={1.2} />

      {/* Main Dark Floor Grid (22 x 24 units) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[22, 24]} />
        <meshStandardMaterial color="#070B14" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Subtle Neon Floor Grid Overlay */}
      <gridHelper args={[22, 22, '#22D3EE', '#1E293B']} position={[0, 0.005, 0]} />

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
          <div className="bg-slate-900/95 text-office-cyan border border-office-cyan/40 px-3 py-1.5 rounded-full text-xs font-mono shadow-glow-cyan flex items-center space-x-1.5 whitespace-nowrap pointer-events-none">
            <span>🏢</span>
            <span className="font-bold">{activeRoomNotice}</span>
          </div>
        </Html>
      )}
    </>
  );
};
