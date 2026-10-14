/**
 * 3D Low-Poly Agent Character & Status Ring (Rule REQ-111 & REQ-112).
 * Smooth straight-path movement, status-colored ring, and floating badge.
 *
 * Tahap 3: pale toy-like bodies (they must sit on a light world, not vanish
 * into it), cast shadows, and an explicit invalidate() while walking so the
 * demand-based loop actually repaints the movement.
 *
 * Tahap 15: a department could render a CC0 character GLB INSTEAD of the
 * procedural body. Tahap 17: the model is the agent's identity —
 * `avatar_style.character` when picked, the department default otherwise.
 * Status ring, label, department colour and every movement rule above are
 * untouched. The robot body stays the whole avatar whenever the model is
 * still loading, failed to load, has no clip, or ECO/low-power skipped the
 * fetch.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Vector3, Group, BackSide, LoopOnce, LoopRepeat, type AnimationAction } from 'three';
import type { OfficeAgent } from '../../../stores/office';
import { useOfficeStore } from '../../../stores/office';
import { usePowerStore } from '../../../stores/power';
import { agentMotion, ROOM_LAYOUTS, speechLine } from '@hermes-office/shared';
import { isCameraDrag } from './cameraState';
import { characterModelFor, resolveClip } from './glbCharacter';
import { loadCharacterInstance, type CharacterInstance } from './loadCharacterModels';

/** Cross-fade between walk/idle/sit so the feet never teleport. */
const CLIP_FADE = 0.2;

interface Agent3DProps {
  agent: OfficeAgent;
  targetPos: [number, number, number];
  onSelect: (agent: OfficeAgent) => void;
  showLabel?: boolean;
}

// Rings and visors sit on a light floor: every status colour is chosen to
// keep ≥ 3:1 against #E7ECF3 (non-text contrast).
const STATUS_COLORS: Record<string, string> = {
  idle: '#94A3B8',
  thinking: '#0284C7',
  working: '#15803D',
  waiting_approval: '#B45309',
  error: '#DC2626',
  offline: '#64748B',
};

export const Agent3D: React.FC<Agent3DProps> = ({
  agent,
  targetPos,
  onSelect,
  showLabel = true,
}) => {
  const { invalidate } = useThree();
  const isLowPower = usePowerStore((s) => s.isLowPower);
  const groupRef = useRef<Group>(null);
  const ringRef = useRef<Group>(null);
  const currentPos = useRef(new Vector3(...targetPos));
  const destination = useRef(new Vector3(...targetPos));

  // Tahap 17 — this agent's CC0 character: its own pick, else the
  // department default, else `null` (procedural robot).
  const characterId = characterModelFor(agent.department, agent.avatar_style);
  const [character, setCharacter] = useState<CharacterInstance | null>(null);
  const activeClip = useRef<string | null>(null);
  const activeAction = useRef<AnimationAction | null>(null);

  // Tahap 17 — the agent's last real chat line, read from the same office
  // store the 2D sprite uses (Rule 9.1 parity: one source, one trimming rule).
  // The canvas runs frameloop="demand", so the slow tick below both re-checks
  // the TTL and asks for the repaint that shows or hides the bubble.
  const lastSpeech = useOfficeStore((s) => s.speech[agent.id]);
  const [now, setNow] = useState(() => Date.now());
  const bubble = speechLine(lastSpeech, now);

  useEffect(() => {
    if (!lastSpeech) return undefined;
    setNow(Date.now());
    const tick = setInterval(() => {
      setNow(Date.now());
      invalidate();
    }, 5000);
    return () => clearInterval(tick);
  }, [lastSpeech, invalidate]);

  // Update target destination when prop changes
  destination.current.set(...targetPos);

  useEffect(() => {
    // ECO / low-power never fetches a GLB (Rule 9.3) — procedural body only.
    if (!characterId || isLowPower) {
      setCharacter(null);
      return undefined;
    }

    let alive = true;
    loadCharacterInstance(characterId).then((instance) => {
      if (!alive) return;
      setCharacter(instance);
      activeClip.current = null;
      activeAction.current = null;
      // frameloop="demand": ask for one frame so the new geometry shows up.
      invalidate();
    });

    return () => {
      alive = false;
    };
  }, [characterId, isLowPower, invalidate]);

  // Geometry is shared with the loader cache — stop the clips, never dispose.
  useEffect(() => {
    if (!character) return undefined;
    return () => {
      character.mixer.stopAllAction();
    };
  }, [character]);

  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle;
  // Tahap 4 polish: wear your department (DESIGN_DIRECTION 3.1 "pakaian
  // berwarna per departemen") instead of eight identical grey pawns.
  const shirtColor =
    agent.department && agent.department in ROOM_LAYOUTS
      ? ROOM_LAYOUTS[agent.department as keyof typeof ROOM_LAYOUTS].color
      : '#94A3B8';

  // Smooth straight-path interpolation loop + ambient body language
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const dist = currentPos.current.distanceTo(destination.current);
    if (dist > 0.01) {
      // Interpolate towards target position smoothly
      currentPos.current.lerp(destination.current, Math.min(1, delta * 6));
      // frameloop is "demand": without this the walk would never repaint.
      invalidate();
    }

    // Tahap 15 — animate the CC0 character. `dist` is measured before the
    // lerp, so > 0.01 still means "walking to its destination". The procedural
    // body is untouched: this block only runs when a model actually loaded.
    if (character) {
      const moving = dist > 0.01;
      const sitting =
        agent.status === 'waiting_approval' && resolveClip(character.root.animations, 'SitDown');
      const wanted = moving ? 'Walk' : sitting ? 'SitDown' : 'Idle';

      if (activeClip.current !== wanted) {
        const clip =
          resolveClip(character.root.animations, wanted) ??
          resolveClip(character.root.animations, 'Idle') ??
          character.root.animations[0] ??
          null;

        if (clip) {
          const next = character.mixer.clipAction(clip);
          if (wanted === 'SitDown') {
            // Sit once and hold the seated pose instead of stand-sit looping.
            next.setLoop(LoopOnce, Infinity);
            next.clampWhenFinished = true;
          } else {
            next.setLoop(LoopRepeat, Infinity);
          }
          activeAction.current?.fadeOut(CLIP_FADE);
          next.reset().fadeIn(CLIP_FADE).play();
          activeAction.current = next;
        }
        activeClip.current = wanted;
      }

      character.mixer.update(delta);
      // The canvas is frameloop="demand": an animated clip must repaint it.
      if (!isLowPower) invalidate();
    } else {
      activeClip.current = null;
      activeAction.current = null;
    }

    // Tahap 3.5: what the agent is actually doing — stroll, type, pace,
    // bounce or glitch. Same module the 2D map uses (Rule 9.1 parity).
    const motion = agentMotion(agent.id, agent.status, state.clock.elapsedTime, isLowPower);
    groupRef.current.position.set(
      currentPos.current.x + motion.offsetX,
      currentPos.current.y + motion.bob,
      currentPos.current.z + motion.offsetZ
    );
    groupRef.current.rotation.y = motion.rotation;
    // Ambient animation must repaint the demand loop, unless ECO froze it.
    if (!isLowPower) invalidate();

    // Subtle breathing or rotation animation when active
    if (ringRef.current && (agent.status === 'working' || agent.status === 'thinking')) {
      ringRef.current.rotation.z += delta * 1.5;
    }
  });

  return (
    <group
      ref={groupRef}
      position={targetPos}
      onClick={(e) => {
        // Releasing a rotate gesture over an agent must not open its sheet.
        if (isCameraDrag()) return;
        e.stopPropagation();
        onSelect(agent);
      }}
    >
      {/* Floor Status Ring */}
      <group ref={ringRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.42, 0.54, 32]} />
          <meshBasicMaterial color={statusColor} />
        </mesh>
      </group>

      {/* Tahap 15: CC0 character for this department — normalised so its feet
          sit on y = 0 inside this agent group. Missing / loading / failed /
          ECO -> the procedural robot body below renders exactly as before. */}
      {character ? (
        <primitive object={character.root} />
      ) : (
        /* Low-Poly Robot Character Body */
        <group position={[0, 0.45, 0]}>
          {/* Inverted-hull outline (Tahap 4 polish): a dark silhouette edge, so a
              pale body still separates from the pale floor. This is the non-text
              contrast rule applied to the one graphic that carries identity. */}
          <mesh position={[0, 0.1, 0]} scale={[1.14, 1.06, 1.14]}>
            <cylinderGeometry args={[0.26, 0.22, 0.5, 12]} />
            <meshBasicMaterial color="#3F4A5C" side={BackSide} />
          </mesh>
          <mesh position={[0, 0.52, 0]} scale={1.16}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshBasicMaterial color="#3F4A5C" side={BackSide} />
          </mesh>
          {/* Torso */}
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.22, 0.5, 12]} />
            <meshStandardMaterial color={shirtColor} metalness={0.05} roughness={0.6} />
          </mesh>

          {/* Chest Accent Light */}
          <mesh position={[0, 0.15, 0.23]}>
            <boxGeometry args={[0.18, 0.12, 0.02]} />
            <meshBasicMaterial color={statusColor} />
          </mesh>

          {/* Head */}
          <mesh position={[0, 0.52, 0]} castShadow>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial color="#F1F5F9" metalness={0.05} roughness={0.55} />
          </mesh>

          {/* Glowing Visor */}
          <mesh position={[0, 0.52, 0.18]}>
            <boxGeometry args={[0.22, 0.08, 0.05]} />
            <meshBasicMaterial color={statusColor} />
          </mesh>
        </group>
      )}

      {/* Floating HTML Label (capped to 20 visible labels via distance factor) */}
      {showLabel && (
        <Html
          position={[0, 1.3, 0]}
          center
          distanceFactor={14}
          zIndexRange={[100, 0]}
        >
          <div className="flex flex-col items-center pointer-events-none select-none">
            {/* Tahap 17 — the agent's last real line from the chat sheet, same
                source and same rules as the 2D sprite (Rule 9.1 parity). */}
            {bubble && (
              <div
                data-testid="agent3d-bubble"
                title={bubble}
                className="mb-0.5 max-w-[92px] truncate rounded-[3px] border border-office-border bg-white px-1 py-px text-center font-mono text-[7px] leading-tight text-black shadow-nu-raised"
              >
                {bubble}
              </div>
            )}
            <div className="bg-office-surface/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-office-border shadow-nu-raised flex items-center space-x-1 whitespace-nowrap">
              <span className="text-xs">{agent.avatar || '🤖'}</span>
              <span className="text-[11px] font-semibold text-office-text">{agent.name}</span>
            </div>
            {agent.status === 'working' && agent.currentTool && (
              <span className="text-[9px] text-office-accent-ink bg-office-hover px-1.5 rounded border border-office-border mt-0.5">
                ⚡ {agent.currentTool}
              </span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
};
