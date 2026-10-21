/**
 * CC0 3D Vehicle manifest (Kenney Car Kit, docs/ASSETS.md).
 * Models stored in public/assets/3d/vehicles/ with self-contained embedded texture.
 * Zero CDN/network request at runtime (Rule 9.4).
 */

export const VEHICLE_MODEL_IDS = ['sedan', 'suv', 'delivery'] as const;

export type VehicleModelId = (typeof VEHICLE_MODEL_IDS)[number];

const VEHICLE_BASE = '/assets/3d/vehicles/';

export const VEHICLE_MODEL_URLS: Record<VehicleModelId, string> = {
  sedan: `${VEHICLE_BASE}sedan.glb`,
  suv: `${VEHICLE_BASE}suv.glb`,
  delivery: `${VEHICLE_BASE}delivery.glb`,
};

/** Mapping vehicle ID to Kenney model */
export function vehicleModelForKind(kind: 'car' | 'bus', id: string): VehicleModelId {
  if (kind === 'bus') return 'delivery';
  // Alternate between sedan and suv based on id
  return id === 'v3' || id === 'v4' ? 'suv' : 'sedan';
}
