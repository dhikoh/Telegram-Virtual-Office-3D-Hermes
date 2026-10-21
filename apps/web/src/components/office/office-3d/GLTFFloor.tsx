/**
 * CC0 Floor Tiles from Kenney Mini Market (docs/ASSETS.md, Rule 9.4).
 * Modular floor tiles for Central Lounge area.
 * Zero remote/CDN requests, safe fallback to null when loading or in ECO mode.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { usePowerStore } from '../../../stores/power';
import { loadFloorModel } from './loadFloorModel';

export const TILE_POSITIONS: Array<[number, number]> = (() => {
  const positions: Array<[number, number]> = [];
  const xs = [-1.5, -0.5, 0.5, 1.5];
  const zs = [-3, -2, -1, 0, 1, 2, 3];
  for (const x of xs) {
    for (const z of zs) {
      positions.push([x, z]);
    }
  }
  return positions;
})();

export const GLTFFloor: React.FC = () => {
  const isLowPower = usePowerStore((state) => state.isLowPower);
  const invalidate = useThree((state) => state.invalidate);
  const [model, setModel] = useState<Group | null>(null);

  useEffect(() => {
    if (isLowPower) return undefined;
    let alive = true;
    loadFloorModel().then((loaded) => {
      if (!alive) return;
      setModel(loaded);
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [isLowPower, invalidate]);

  const tileInstances = useMemo(() => {
    if (!model) return [];
    return TILE_POSITIONS.map(([x, z]) => ({
      position: [x, 0.02, z] as [number, number, number],
      object: model.clone(true),
    }));
  }, [model]);

  if (tileInstances.length === 0) return null;

  return (
    <group name="kenney-mini-market-floor">
      {tileInstances.map(({ position, object }, idx) => (
        <primitive
          key={`tile-${idx}`}
          object={object}
          position={position}
          scale={[1, 1, 1]}
        />
      ))}
    </group>
  );
};

export default GLTFFloor;
