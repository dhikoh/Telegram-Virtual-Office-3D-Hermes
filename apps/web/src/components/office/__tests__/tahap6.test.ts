/**
 * Tahap 6 acceptance (DESIGN_DIRECTION 5):
 *  - a penuh / rendah / otomatis graphics preset in the settings UI,
 *  - a cross-fade when switching between the 2D and 3D renderers, and no
 *    animation at all while ECO is on (Rule 9.3),
 *  - the measured 30 fps floor the "otomatis" preset lives by,
 *  - the WebGL rollback path that dumps a failed 3D view back to 2D (REQ-117).
 *
 * Layout and wiring are asserted on source; behaviour is covered by
 * perf.test.ts, fps.test.ts and power.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const more = read('../../../screens/More.tsx');
const office = read('../../../screens/Office.tsx');
const office3d = read('../office-3d/Office3D.tsx');
const powerStore = read('../../../stores/power.ts');
const indexCss = read('../../../index.css');

describe('graphics preset UI', () => {
  it('offers all three presets as a radio group', () => {
    expect(more).toContain('role="radiogroup"');
    expect(more).toContain('GRAPHICS_PRESETS.map');
    expect(more).toContain('Penuh');
    expect(more).toContain('Rendah');
    expect(more).toContain('Otomatis');
  });

  it('shows the measured frame rate while the probe decides', () => {
    expect(more).toContain('lastFps');
    expect(more).toContain('fps');
  });

  it('keeps the 44 px touch target on every preset button (section 6)', () => {
    expect(more).toMatch(/min-h-\[44px\][\s\S]{0,80}GRAPHICS_PRESETS\.map|GRAPHICS_PRESETS\.map\([\s\S]{0,400}min-h-\[44px\]/);
  });
});

describe('view-mode transition', () => {
  it('lets the incoming renderer fade in instead of hard-cutting', () => {
    expect(office).toContain('key={viewMode}');
    expect(office).toContain('view-fade-in');
    expect(indexCss).toContain('.view-fade-in');
    expect(indexCss).toContain('@keyframes view-fade-in');
  });

  it('keeps the shell chunk lean (no framer-motion import) and dies in ECO', () => {
    // framer-motion is ~40 KB: importing it in Office.tsx would push the
    // shell chunk past the 222 KB gzip budget (Rule 9.2).
    expect(office).not.toMatch(/from ['"]framer-motion['"]/);
    // Rule 9.3: .low-power kills every animation, this one included.
    expect(indexCss).toMatch(/\.low-power[\s\S]{0,400}animation:\s*none\s*!important/);
  });
});

describe('frame-rate floor', () => {
  it('is wired through the shared policy module', () => {
    expect(powerStore).toContain('resolveLowPower');
    expect(powerStore).toContain('startFpsProbe');
    expect(powerStore).toContain('presetLowPower');
  });
});

describe('WebGL rollback (Rule REQ-117)', () => {
  it('listens for context loss and remounts a healthy context', () => {
    expect(office3d).toContain("'webglcontextlost'");
    expect(office3d).toContain('recoveryKey');
    expect(office3d).toContain('lossCount');
  });

  it('gives up to the 2D fallback after the attempt cap', () => {
    expect(office3d).toContain('MAX_RECOVERY_ATTEMPTS');
    expect(office3d).toContain("setWebGLError('3D tidak tersedia");
    expect(office).toContain('retryWebGL'); // manual retry still offered
  });
});
