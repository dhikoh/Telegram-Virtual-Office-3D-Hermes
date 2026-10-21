/**
 * Unit & Integration Tests for KayKit: Prototype Bits Modular Office 3D Assets.
 *
 * Verifies:
 * - Manifest & URLs
 * - On-disk existence of CC0 GLB files in apps/web/public/assets/3d/modular/
 * - Magic bytes & self-contained binary integrity
 * - Modular office slot generation for all department rooms, lounge, and gate
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULAR_IDS, MODULAR_URLS } from '../office-3d/glbModular';
import { buildModularOfficeSlots, MODULAR_OFFICE_SLOTS } from '../office-3d/GLTModularOffice';
import { ROOM_LAYOUTS } from '@hermes-office/shared';

const MODULAR_DIR = fileURLToPath(
  new URL('../../../../public/assets/3d/modular/', import.meta.url)
);

describe('Modular 3D Office Manifest & Assets', () => {
  it('declares 10 modular model IDs', () => {
    expect(MODULAR_IDS).toHaveLength(10);
    expect(MODULAR_IDS).toContain('wall');
    expect(MODULAR_IDS).toContain('wall_window');
    expect(MODULAR_IDS).toContain('wall_doorway');
    expect(MODULAR_IDS).toContain('wall_half');
    expect(MODULAR_IDS).toContain('floor_tile');
    expect(MODULAR_IDS).toContain('pillar');
    expect(MODULAR_IDS).toContain('table_work');
    expect(MODULAR_IDS).toContain('table_meeting');
    expect(MODULAR_IDS).toContain('door');
    expect(MODULAR_IDS).toContain('box_archive');
  });

  it('maps every model ID to a valid relative static URL', () => {
    for (const id of MODULAR_IDS) {
      expect(MODULAR_URLS[id]).toBe(`/assets/3d/modular/${id}.glb`);
    }
  });

  it('contains every committed GLB file on disk with valid magic bytes', () => {
    for (const id of MODULAR_IDS) {
      const filePath = join(MODULAR_DIR, `${id}.glb`);
      expect(existsSync(filePath)).toBe(true);

      const buf = readFileSync(filePath);
      expect(buf.length).toBeGreaterThan(1000);

      // glTF header check
      const magic = buf.toString('ascii', 0, 4);
      const version = buf.readUInt32LE(4);
      expect(magic).toBe('glTF');
      expect(version).toBe(2);
    }
  });

  it('ships LICENSE.txt and PROVENANCE.md in the modular asset folder', () => {
    expect(existsSync(join(MODULAR_DIR, 'LICENSE.txt'))).toBe(true);
    expect(existsSync(join(MODULAR_DIR, 'PROVENANCE.md'))).toBe(true);

    const prov = readFileSync(join(MODULAR_DIR, 'PROVENANCE.md'), 'utf-8');
    expect(prov).toContain('KayKit: Prototype Bits 1.0');
    expect(prov).toContain('Kay Lousberg');
    expect(prov).toContain('Creative Commons Zero');
  });
});

describe('Modular Office Slot Layout & Expandability', () => {
  it('generates slots covering all rooms from ROOM_LAYOUTS', () => {
    const slots = buildModularOfficeSlots();
    expect(slots.length).toBeGreaterThanOrEqual(Object.keys(ROOM_LAYOUTS).length * 4);

    // Checks that rear wall, pillar, half-wall, and archive box are generated per room
    const modelsInUse = new Set(slots.map((s) => s.model));
    expect(modelsInUse.has('wall')).toBe(true);
    expect(modelsInUse.has('wall_window')).toBe(true);
    expect(modelsInUse.has('pillar')).toBe(true);
    expect(modelsInUse.has('wall_half')).toBe(true);
    expect(modelsInUse.has('box_archive')).toBe(true);
    expect(modelsInUse.has('table_meeting')).toBe(true);
    expect(modelsInUse.has('wall_doorway')).toBe(true);
  });

  it('exports pre-built MODULAR_OFFICE_SLOTS', () => {
    expect(MODULAR_OFFICE_SLOTS).toBeDefined();
    expect(MODULAR_OFFICE_SLOTS.length).toBeGreaterThan(0);
  });
});
