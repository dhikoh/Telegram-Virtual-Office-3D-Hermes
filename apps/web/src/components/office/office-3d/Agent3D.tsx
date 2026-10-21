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
import { agentMotion, approach, gaitFor, ROOM_LAYOUTS, speechLine, turnTowards, WALK_SPEED } from '@hermes-office/shared';
import { isCameraDrag } from './cameraState';
import { characterModelFor, CHARACTER_MODEL_LABELS, resolveClip } from './glbCharacter';
import { loadCharacterInstance, type CharacterInstance } from './loadCharacterModels';

/** Cross-fade between walk/idle/sit so the feet never teleport. */
const CLIP_FADE = 0.2;

/** How fast an agent can turn, in radians per second. A 180° about-face takes
 *  ~0.9 s, which reads as a turn rather than a snap. */
const TURN_RATE = Math.PI * 1.1;

interface Agent3DProps {
  agent: OfficeAgent;
  targetPos: [number, number, number];
  onSelect: (agent: OfficeAgent) => void;
  /**
   * `true` draws the full name pill, `false` the compact one — the idle lounge
   * packs slots 40 px apart and REQ-111 bounds how many labels are drawn wide.
   * Either way the name is DRAWN: this prop picks a width, never visibility.
   * Same contract as the 2D `Avatar` (Rule 9.1 parity) — the 3D scene used to
   * drop the label entirely, which is why idle agents had no name at all.
   */
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

  // `destination` is recomputed every frame in `useFrame` (placement + ambient
  // offset), so there is nothing to seed here.

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
  // The label under the name names the model the agent actually wears, from the
  // same table the picker draws (Rule 9.1 parity with the 2D sprite).
  const characterLabel = characterId ? CHARACTER_MODEL_LABELS[characterId] : null;
  // Tahap 4 polish: wear your department (DESIGN_DIRECTION 3.1 "pakaian
  // berwarna per departemen") instead of eight identical grey pawns.
  const shirtColor =
    agent.department && agent.department in ROOM_LAYOUTS
      ? ROOM_LAYOUTS[agent.department as keyof typeof ROOM_LAYOUTS].color
      : '#94A3B8';

  // Smooth straight-path interpolation loop + ambient body language
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // What the agent is actually doing — stroll, type, pace, bounce or glitch.
    // Same module the 2D map uses (Rule 9.1 parity).
    const motion = agentMotion(agent.id, agent.status, state.clock.elapsedTime, isLowPower);

    // Tahap 17b — the destination is the placement PLUS the ambient offset, and
    // a patrolling agent's offset moves at a constant `WALK_SPEED`. Tracking a
    // target that moves at walking pace is what makes the body move at walking
    // pace: the old `lerp(target, delta * 6)` eased in over ~1 s and slid the
    // feet, because the walk clip can only stride at one honest speed.
    destination.current.set(
      targetPos[0] + motion.offsetX,
      targetPos[1],
      targetPos[2] + motion.offsetZ
    );

    const dx = destination.current.x - currentPos.current.x;
    const dz = destination.current.z - currentPos.current.z;
    const gap = Math.hypot(dx, dz);
    // Close the gap by at most one frame of honest walking — never overshoot.
    const step = approach(0, gap, WALK_SPEED * delta);
    if (gap > 1e-6) {
      currentPos.current.x += (dx / gap) * step;
      currentPos.current.z += (dz / gap) * step;
      // frameloop is "demand": without this the walk would never repaint.
      invalidate();
    }

    // The speed the feet actually travelled this frame, in units/s.
    const speed = delta > 0 ? step / delta : 0;
    const gait = gaitFor(speed);

    // Tahap 15 — animate the CC0 character. `gap` is measured before the step,
    // so the procedural body is untouched: this block only runs when a model
    // actually loaded.
    if (character) {
      const sitting =
        agent.status === 'waiting_approval' && resolveClip(character.root.animations, 'SitDown');
      const wanted = gait.moving ? 'Walk' : sitting ? 'SitDown' : 'Idle';

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

      // Match the clip's cadence to the ground actually covered: the `walk`
      // clip strides at `WALK_SPEED`, so anything slower or faster is paid for
      // here instead of by sliding the feet (measured off the GLB: leg joint
      // 0.176 units above the sole, ±60° swing, 0.667 s cycle).
      if (activeAction.current && wanted === 'Walk') {
        activeAction.current.timeScale = gait.timeScale;
      }

      character.mixer.update(delta);
      // The canvas is frameloop="demand": an animated clip must repaint it.
      if (!isLowPower) invalidate();
    } else {
      activeClip.current = null;
      activeAction.current = null;
    }

    groupRef.current.position.set(
      currentPos.current.x,
      currentPos.current.y + motion.bob,
      currentPos.current.z
    );
    // Face the way it is going while walking; face the ambient direction while
    // standing. The model faces +Z (measured off the GLB geometry), so a
    // direction (dx, dz) is `atan2(dx, dz)`. Turning is rate-limited so a
    // 180° turnaround reads as a turn, not a snap.
    const facing = gait.moving ? Math.atan2(dx, dz) : motion.rotation;
    groupRef.current.rotation.y = turnTowards(
      groupRef.current.rotation.y,
      facing,
      TURN_RATE * delta
    );
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

      {/* Floating HTML Label — the name is NEVER hidden: `showLabel` picks the
          wide pill or the compact 38 px one (the idle lounge packs slots 40 px
          apart, REQ-111 caps how many are wide). Same rule as the 2D sprite;
          a nameless agent was the Tahap 17 regression this restores. */}
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
              className={`mb-0.5 truncate rounded-[3px] border border-office-border bg-white px-1 py-px text-center font-mono text-[7px] leading-tight text-black shadow-nu-raised ${
                showLabel ? 'max-w-[92px]' : 'max-w-[54px]'
              }`}
            >
              {bubble}
            </div>
          )}
          <div
            data-testid="agent3d-name"
            title={agent.name}
            className={`bg-office-surface/90 backdrop-blur-md py-0.5 rounded-full border border-office-border shadow-nu-raised flex items-center space-x-1 ${
              showLabel ? 'px-2 max-w-[92px]' : 'px-1.5 max-w-[54px]'
            }`}
          >
            <span className="text-xs">{agent.avatar || '🤖'}</span>
            <span className="text-[11px] font-semibold text-office-text truncate">
              {agent.name}
            </span>
          </div>
          {/* Nama karakter 3D tidak dimunculkan visual di atas karakter (digantikan fokus nama agen) */}
          {characterLabel && (
            <span
              data-testid="agent3d-character"
              className="sr-only"
            >
              {characterLabel}
            </span>
          )}
          {agent.status === 'working' && agent.currentTool && (
            <span className="text-[9px] text-office-accent-ink bg-office-hover px-1.5 rounded border border-office-border mt-0.5">
              ⚡ {agent.currentTool}
            </span>
          )}
        </div>
      </Html>
    </group>
  );
};
