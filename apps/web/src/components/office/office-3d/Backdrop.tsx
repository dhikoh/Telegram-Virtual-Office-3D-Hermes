/**
 * Diorama backdrop (Tahap 4a, docs/DESIGN_DIRECTION.md §7.5 Konsep A).
 *
 * Konsep A asks for a cut-away glass-box diorama: a back wall with a window
 * onto a street that keeps moving. Without it the office floats on an endless
 * grid — with it, the room reads as a place in a city.
 *
 * Everything behind the glass comes from `streetTraffic` in
 * packages/shared/src/ambient.ts, the same pure module the 2D renderer will
 * use (Tahap 5), so the view out of the window and the map never disagree.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Mesh } from 'three';
import { streetTraffic, STREET_SPAN, type StreetVehicle } from '@hermes-office/shared';
import { usePowerStore } from '../../../stores/power';

/** Wall geometry: opening for the window is x -6.5..6.5, y 1.1..3.0. */
const WALL_Z = -11.9;
const WALL_HEIGHT = 4.2;
const WINDOW_HALF_WIDTH = 6.5;
const WINDOW_SILL = 1.1;
const WINDOW_HEAD = 3.0;
const WALL_THICKNESS = 0.3;

const WALL_COLOR = '#F1F5F9';
const WINDOW_FRAME_COLOR = '#CBD5E1';
const GLASS_COLOR = '#E6EEF8';

/** Lane centres on the street behind the glass. */
const LANE_Z = [-14.2, -16.2];

const Buildings: React.FC = () => {
  // Fixed silhouette — no animation, so a static array of boxes is enough.
  const blocks = useMemo(
    () =>
      [
        { x: -16, w: 7, h: 6.5, z: -21 },
        { x: -7, w: 6, h: 9, z: -21.5 },
        { x: 1, w: 8, h: 5.5, z: -21 },
        { x: 10, w: 7, h: 8, z: -21.5 },
        { x: 17.5, w: 6, h: 6, z: -21 },
      ],
    []
  );
  return (
    <group>
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, 1.2]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#E6E9F2' : '#EDEFF5'} roughness={0.95} />
        </mesh>
      ))}
      {/* Sky plate: behind everything, light so the diorama never darkens. */}
      <mesh position={[0, 8, -24]}>
        <planeGeometry args={[80, 40]} />
        <meshBasicMaterial color="#E9EFF8" />
      </mesh>
    </group>
  );
};

const Street: React.FC = () => {
  const isLowPower = usePowerStore((s) => s.isLowPower);
  const { invalidate } = useThree();
  const refs = useRef<Record<string, Mesh | null>>({});

  useFrame((state) => {
    if (isLowPower) return;
    const vehicles = streetTraffic(state.clock.elapsedTime, false);
    for (const v of vehicles) {
      const mesh = refs.current[v.id];
      if (mesh) mesh.position.x = v.x;
    }
    // frameloop is "demand": the street only keeps moving if we ask for frames.
    invalidate();
  });

  return (
    <group>
      {/* Sidewalk between the building and the road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -12.9]} receiveShadow>
        <planeGeometry args={[48, 1.8]} />
        <meshStandardMaterial color="#E3E8EF" roughness={0.95} />
      </mesh>
      {/* Road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, -15.4]} receiveShadow>
        <planeGeometry args={[48, 3.4]} />
        <meshStandardMaterial color="#D8DDE6" roughness={0.98} />
      </mesh>
      {/* Centre dashes */}
      {Array.from({ length: 13 }, (_, i) => -STREET_SPAN + 1.6 + i * 3.2).map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -15.4]}>
          <planeGeometry args={[1.4, 0.14]} />
          <meshStandardMaterial color="#F1F5F9" roughness={1} />
        </mesh>
      ))}

      {streetTraffic(0).map((v: StreetVehicle) => (
        <mesh
          key={v.id}
          ref={(el) => {
            refs.current[v.id] = el;
          }}
          castShadow
          position={[v.x, 0.45, LANE_Z[v.lane]]}
        >
          <boxGeometry args={v.kind === 'bus' ? [3.2, 1.1, 1.1] : [1.6, 0.7, 0.95]} />
          <meshStandardMaterial color={v.color} roughness={0.6} metalness={0} />
        </mesh>
      ))}
    </group>
  );
};

export const Backdrop: React.FC = () => (
  <group>
    {/* --- Back wall, built from four boxes so the window is a real hole --- */}
    {/* Left cheek */}
    <mesh position={[-(WINDOW_HALF_WIDTH + (11 - WINDOW_HALF_WIDTH) / 2), WALL_HEIGHT / 2, WALL_Z]} castShadow receiveShadow>
      <boxGeometry args={[11 - WINDOW_HALF_WIDTH, WALL_HEIGHT, WALL_THICKNESS]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
    </mesh>
    {/* Right cheek */}
    <mesh position={[WINDOW_HALF_WIDTH + (11 - WINDOW_HALF_WIDTH) / 2, WALL_HEIGHT / 2, WALL_Z]} castShadow receiveShadow>
      <boxGeometry args={[11 - WINDOW_HALF_WIDTH, WALL_HEIGHT, WALL_THICKNESS]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
    </mesh>
    {/* Under the window (sill wall) */}
    <mesh position={[0, WINDOW_SILL / 2, WALL_Z]} castShadow receiveShadow>
      <boxGeometry args={[WINDOW_HALF_WIDTH * 2, WINDOW_SILL, WALL_THICKNESS]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
    </mesh>
    {/* Over the window (lintel) */}
    <mesh position={[0, (WINDOW_HEAD + WALL_HEIGHT) / 2, WALL_Z]} castShadow receiveShadow>
      <boxGeometry args={[WINDOW_HALF_WIDTH * 2, WALL_HEIGHT - WINDOW_HEAD, WALL_THICKNESS]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
    </mesh>
    {/* Mullion + frame */}
    <mesh position={[0, (WINDOW_SILL + WINDOW_HEAD) / 2, WALL_Z]} castShadow>
      <boxGeometry args={[0.14, WINDOW_HEAD - WINDOW_SILL, 0.12]} />
      <meshStandardMaterial color={WINDOW_FRAME_COLOR} roughness={0.7} />
    </mesh>
    <mesh position={[0, (WINDOW_SILL + WINDOW_HEAD) / 2, WALL_Z]}>
      <boxGeometry args={[WINDOW_HALF_WIDTH * 2 + 0.2, 0.1, 0.14]} />
      <meshStandardMaterial color={WINDOW_FRAME_COLOR} roughness={0.7} />
    </mesh>
    {/* Glass: a tinted pane, not a mirror — it must not blacken the street. */}
    <mesh position={[0, (WINDOW_SILL + WINDOW_HEAD) / 2, WALL_Z - 0.02]}>
      <planeGeometry args={[WINDOW_HALF_WIDTH * 2, WINDOW_HEAD - WINDOW_SILL]} />
      <meshStandardMaterial
        color={GLASS_COLOR}
        transparent
        opacity={0.22}
        roughness={0.15}
        metalness={0}
      />
    </mesh>

    {/* --- World outside the glass --- */}
    <Buildings />
    <Street />
  </group>
);

export default Backdrop;
