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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import {
  streetTraffic,
  STREET_SPAN,
  WORLD_FLOOR,
  GLAZING,
  type StreetVehicle,
} from '@hermes-office/shared';
import { usePowerStore } from '../../../stores/power';
import { vehicleModelForKind } from './glbVehicles';
import { loadVehicleScenes, type VehicleScenes } from './loadVehicleModels';

/** Wall geometry: opening for the window is x -6.5..6.5, y 0.7..3.4. */
export const WALL_Z = -11.9;
const WALL_HEIGHT = 4.2;
export const WINDOW_HALF_WIDTH = 6.5;
export const WINDOW_SILL = 0.7;
export const WINDOW_HEAD = 3.4;
const WALL_THICKNESS = 0.3;

/**
 * Tahap 17 — the diorama shell and its glass take the shared tokens:
 * `WORLD_FLOOR` for the wall/skirting and `GLAZING` for the pane and its
 * frame, the very same `GLAZING` every room partition in Furniture.tsx is
 * built from, so the window the street is seen through and a room's glazed
 * front can never drift apart.
 */
const WALL_COLOR = WORLD_FLOOR.wall;
const WINDOW_FRAME_COLOR = GLAZING.frame;
const GLASS_COLOR = GLAZING.color;

/** Lane centres on the street behind the glass. */
export const LANE_Z = [-13.6, -15.4];

const Buildings: React.FC = () => {
  // Fixed silhouette — no animation, so a static array of boxes is enough.
  const blocks = useMemo(
    () =>
      [
        { x: -16, w: 7, h: 6.5, z: -18.8 },
        { x: -7, w: 6, h: 9, z: -19.2 },
        { x: 1, w: 8, h: 5.5, z: -18.8 },
        { x: 10, w: 7, h: 8, z: -19.2 },
        { x: 17.5, w: 6, h: 6, z: -18.8 },
      ],
    []
  );
  return (
    <group>
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, 1.2]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#CDD3DF' : '#DCE1EB'} roughness={0.95} />
        </mesh>
      ))}
      {/* Sky plate: behind everything, light so the diorama never darkens. */}
      <mesh position={[0, 8, -21]}>
        <planeGeometry args={[80, 40]} />
        <meshBasicMaterial color="#D8E3F2" />
      </mesh>
    </group>
  );
};

export const VEHICLE_SCALE = 0.75;

const Street: React.FC = () => {
  const isLowPower = usePowerStore((s) => s.isLowPower);
  const { invalidate } = useThree();
  const refs = useRef<Record<string, Group | Mesh | null>>({});
  const [vehicleScenes, setVehicleScenes] = useState<VehicleScenes | null>(null);

  useEffect(() => {
    if (isLowPower) return undefined;
    let alive = true;
    loadVehicleScenes().then((loaded) => {
      if (!alive) return;
      setVehicleScenes(loaded);
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [isLowPower, invalidate]);

  useFrame((state) => {
    if (isLowPower) return;
    const vehicles = streetTraffic(state.clock.elapsedTime, false);
    for (const v of vehicles) {
      const obj = refs.current[v.id];
      if (obj) obj.position.x = v.x;
    }
    // frameloop is "demand": the street only keeps moving if we ask for frames.
    invalidate();
  });

  return (
    <group>
      {/* Sidewalk between the building and the road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -12.7]} receiveShadow>
        <planeGeometry args={[48, 1.6]} />
        <meshStandardMaterial color="#D2D8E2" roughness={0.95} />
      </mesh>
      {/* Road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, -14.6]} receiveShadow>
        <planeGeometry args={[48, 4.4]} />
        <meshStandardMaterial color="#B9C0CD" roughness={0.98} />
      </mesh>
      {/* Centre dashes */}
      {Array.from({ length: 13 }, (_, i) => -STREET_SPAN + 1.6 + i * 3.2).map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -14.6]}>
          <planeGeometry args={[1.4, 0.14]} />
          <meshStandardMaterial color="#FFFFFF" roughness={1} />
        </mesh>
      ))}

      {streetTraffic(0).map((v: StreetVehicle) => {
        const modelId = vehicleModelForKind(v.kind, v.id);
        const sourceScene = vehicleScenes?.[modelId];
        // Direction: speed > 0 moves right (+X) -> yaw = PI / 2. speed < 0 moves left (-X) -> yaw = -PI / 2.
        const rotY = v.speed > 0 ? Math.PI / 2 : -Math.PI / 2;

        if (sourceScene) {
          return (
            <group
              key={v.id}
              ref={(el) => {
                refs.current[v.id] = el;
              }}
              position={[v.x, 0, LANE_Z[v.lane]]}
              rotation={[0, rotY, 0]}
              scale={VEHICLE_SCALE}
            >
              <primitive object={sourceScene.clone(true)} />
            </group>
          );
        }

        // Fallback procedural box only when GLB is not yet loaded or in ECO mode (zero overlapping)
        return (
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
        );
      })}
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
    {/* Glass: a tinted pane, not a mirror — it must not blacken the street.
        Opacity comes from the shared GLAZING token, like every room front. */}
    <mesh position={[0, (WINDOW_SILL + WINDOW_HEAD) / 2, WALL_Z - 0.02]}>
      <planeGeometry args={[WINDOW_HALF_WIDTH * 2, WINDOW_HEAD - WINDOW_SILL]} />
      <meshStandardMaterial
        color={GLASS_COLOR}
        transparent
        opacity={GLAZING.opacity}
        depthWrite={false}
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
