/**
 * Lazy-loaded 3D Office View Container (Rule 9.2, REQ-107, REQ-114 to REQ-117).
 * Capped DPR, frameloop="demand", quality tiers, pause when hidden, WebGL fallback.
 *
 * Recovery (Tahap 1.5): a lost WebGL context is not fatal. The first losses are
 * healed by remounting <Canvas>, which allocates a fresh context. Only after
 * MAX_RECOVERY_ATTEMPTS consecutive losses do we escalate to the 2D fallback,
 * so a driver hiccup no longer locks the user out of 3D for the rest of the session.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './Scene';
import { Hand, RotateCcw } from 'lucide-react';
import { useViewModeStore } from '../../../stores/view-mode';
import { requestCameraReset, getCameraGestureMode, toggleCameraGestureMode } from './cameraState';
import type { OfficeAgent } from '../../../stores/office';

interface Office3DProps {
  onSelectAgent: (agent: OfficeAgent) => void;
  onOpenRecruitment?: () => void;
  isPaused?: boolean;
}

/** Context losses healed by remounting before we give up and fall back to 2D. */
export const MAX_RECOVERY_ATTEMPTS = 2;

export const Office3D: React.FC<Office3DProps> = ({
  onSelectAgent,
  onOpenRecruitment,
  isPaused = false,
}) => {
  const { setWebGLError } = useViewModeStore();
  const [isTabHidden, setIsTabHidden] = useState(false);
  // Bumping this key remounts <Canvas>, which tears down and rebuilds the GL context.
  const [recoveryKey, setRecoveryKey] = useState(0);
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const lossCount = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // One-finger gesture: rotate or pan (a mouse gets pan from Shift/right-button,
  // a finger has no modifier — audit 2026-10-14).
  const [gestureMode, setGestureMode] = useState(getCameraGestureMode());
  const nextGestureMode = () => setGestureMode(toggleCameraGestureMode());

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

  // WebGL context loss + recovery (Rule REQ-117)
  const handleCreated = ({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
    const dom = gl.domElement;

    dom.addEventListener('webglcontextlost', (e) => {
      // preventDefault keeps the context restorable instead of permanently dead.
      e.preventDefault();

      lossCount.current += 1;

      if (lossCount.current > MAX_RECOVERY_ATTEMPTS) {
        setWebGLError('3D tidak tersedia di perangkat ini (Konteks WebGL terputus berulang).');
        return;
      }

      // Give the driver a moment to restore on its own, then remount for a fresh context.
      setRecoveryNotice(true);
      window.setTimeout(() => {
        setRecoveryNotice(false);
        setRecoveryKey((k) => k + 1);
      }, 400);
    });

    dom.addEventListener('webglcontextrestored', () => {
      lossCount.current = 0;
      setRecoveryNotice(false);
    });
  };

  const shouldPause = isPaused || isTabHidden;

  return (
    <div
      ref={containerRef}
      className="office-3d-stage relative w-full max-w-[390px] mx-auto aspect-[380/420] rounded-xl overflow-hidden border border-office-border bg-office-surface shadow-nu-raised select-none"
    >
      <Canvas
        key={recoveryKey}
        shadows
        dpr={[1, 1.5]}
        frameloop={shouldPause ? 'never' : 'demand'}
        gl={{
          antialias: qualityTier !== 'low',
          powerPreference: 'low-power',
          failIfMajorPerformanceCaveat: false,
        }}
        camera={{ position: [10, 12, 12], fov: 38 }}
        onCreated={handleCreated}
      >
        <Scene
          onSelectAgent={onSelectAgent}
          onOpenRecruitment={onOpenRecruitment}
        />
      </Canvas>

      {/* Self-healing notice: shown only during the brief window of a remount */}
      {recoveryNotice && (
        <div className="absolute inset-0 flex items-center justify-center bg-office-surface/85 pointer-events-none">
          <div className="flex items-center gap-2 text-[11px] text-office-warn font-mono">
            <span className="w-4 h-4 rounded-full border-2 border-office-warn border-t-transparent animate-spin" />
            Memulihkan tampilan 3D…
          </div>
        </div>
      )}

      {/* Control overlay hint for touch gestures — worded to match the active mode */}
      <div className="absolute bottom-2 left-2 pointer-events-none text-[10px] text-office-text/85 bg-office-surface/85 border border-office-border px-2 py-0.5 rounded backdrop-blur-sm">
        {gestureMode === 'pan' ? 'Seret: geser • 2 jari: zoom' : 'Seret: putar • 2 jari: geser & zoom'}
      </div>

      <div className="absolute bottom-2 right-2 flex gap-1.5">
        {/* One-finger gesture switch: rotate ⇄ pan (no modifier key on a phone) */}
        <button
          type="button"
          onClick={nextGestureMode}
          aria-pressed={gestureMode === 'pan'}
          aria-label={
            gestureMode === 'pan' ? 'Ganti gestur 1 jari menjadi putar' : 'Ganti gestur 1 jari menjadi geser'
          }
          title={gestureMode === 'pan' ? '1 jari: geser (klik untuk putar)' : '1 jari: putar (klik untuk geser)'}
          className="w-11 h-11 flex items-center justify-center rounded-md bg-office-surface border border-office-border text-office-text/75 hover:bg-office-accent hover:text-office-on-accent active:scale-95 transition-colors"
        >
          <Hand size={14} aria-hidden="true" />
        </button>

        {/* Reset the diorama to the framing it was cut for */}
        <button
          type="button"
          onClick={requestCameraReset}
          aria-label="Atur ulang tampilan 3D"
          title="Atur ulang tampilan 3D"
          className="w-11 h-11 flex items-center justify-center rounded-md bg-office-surface border border-office-border text-office-text/75 hover:bg-office-accent hover:text-office-on-accent active:scale-95 transition-colors"
        >
          <RotateCcw size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default Office3D;
