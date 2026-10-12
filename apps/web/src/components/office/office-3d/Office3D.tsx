/**
 * Lazy-loaded 3D Office View Container (Rule 9.2, REQ-107, REQ-114 to REQ-117).
 * Capped DPR, frameloop="demand", quality tiers, pause when hidden, WebGL fallback.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './Scene';
import { useViewModeStore } from '../../../stores/view-mode';
import type { OfficeAgent } from '../../../stores/office';

interface Office3DProps {
  onSelectAgent: (agent: OfficeAgent) => void;
  onOpenRecruitment?: () => void;
  isPaused?: boolean;
}

export const Office3D: React.FC<Office3DProps> = ({
  onSelectAgent,
  onOpenRecruitment,
  isPaused = false,
}) => {
  const { setWebGLError } = useViewModeStore();
  const [isTabHidden, setIsTabHidden] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Quality Tier detection (low vs medium) based on hardware capability (Rule REQ-114)
  const qualityTier = useMemo<'low' | 'medium'>(() => {
    if (typeof navigator === 'undefined') return 'low';
    const cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;
    return cores <= 4 || mem <= 4 ? 'low' : 'medium';
  }, []);

  // Pause rendering when tab/document is hidden (Rule REQ-116)
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // WebGL context loss listener and error recovery (Rule REQ-117)
  const handleCreated = ({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
    gl.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      setWebGLError('3D tidak tersedia di perangkat ini (Konteks WebGL terputus).');
    });
  };

  const shouldPause = isPaused || isTabHidden;

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-[390px] mx-auto aspect-[380/420] rounded-xl overflow-hidden border border-office-border bg-office-bg shadow-2xl select-none"
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop={shouldPause ? 'never' : 'demand'}
        gl={{
          antialias: qualityTier !== 'low',
          powerPreference: 'low-power',
        }}
        camera={{ position: [12, 16, 16], fov: 38 }}
        onCreated={handleCreated}
      >
        <Scene
          onSelectAgent={onSelectAgent}
          onOpenRecruitment={onOpenRecruitment}
        />
      </Canvas>

      {/* Control overlay hint for touch gestures */}
      <div className="absolute bottom-2 left-2 pointer-events-none text-[10px] text-white/40 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
        3D View • Seret untuk menggeser
      </div>
    </div>
  );
};

export default Office3D;
