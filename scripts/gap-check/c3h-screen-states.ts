import fs from 'node:fs';
import path from 'node:path';
import { SCREEN_MANIFEST, type ScreenManifestEntry } from '../../apps/web/src/screens/manifest.js';
import type { GapCheckContext, CheckResult } from './types.js';

export interface C3hOptions {
  customManifest?: readonly ScreenManifestEntry[];
}

const REQUIRED_SECTION8_SCREENS = [
  'office',
  'tasks',
  'inbox',
  'reports',
  'agents_registry',
  'recruitment_room',
  'audit_log',
  'settings',
  'agent_sheet',
];

const REQUIRED_SIX_STATES = [
  'loading',
  'empty',
  'error',
  'offline',
  'success',
  'low-power',
];

export function run(ctx: GapCheckContext, options?: C3hOptions): CheckResult {
  const currentPhase = ctx.currentPhase;
  if (currentPhase < 3) {
    return {
      category: 'Screen State Matrix (C3h)',
      passed: true,
      message: `Phase ${currentPhase}: UI screens due in Phase 3+ (pending)`,
    };
  }

  const manifest = options?.customManifest ?? SCREEN_MANIFEST;
  const issues: string[] = [];

  // 1. Check all required Section 8 screens exist in manifest
  for (const reqId of REQUIRED_SECTION8_SCREENS) {
    const entry = manifest.find((m) => m.id === reqId);
    if (!entry) {
      issues.push(`Screen "${reqId}" required by Section 8 is missing from manifest.ts`);
    }
  }

  // 2. For each screen entry, check component file, test file, and 6 states coverage
  for (const entry of manifest) {
    const componentFullPath = path.join(ctx.rootDir, entry.componentPath);
    if (!fs.existsSync(componentFullPath)) {
      issues.push(`Screen "${entry.id}": component file missing at ${entry.componentPath}`);
    }

    const testFullPath = path.join(ctx.rootDir, entry.testPath);
    if (!fs.existsSync(testFullPath)) {
      issues.push(`Screen "${entry.id}": state test file missing at ${entry.testPath}`);
      continue;
    }

    const testContent = fs.readFileSync(testFullPath, 'utf-8');
    for (const state of REQUIRED_SIX_STATES) {
      const stateRegex = new RegExp(`renders\\s+${state}\\s+state`, 'i');
      if (!stateRegex.test(testContent)) {
        issues.push(`Screen "${entry.id}": test ${entry.testPath} lacks "${state}" state test case`);
      }
    }
  }

  return {
    category: 'Screen State Matrix (C3h)',
    passed: issues.length === 0,
    message:
      issues.length === 0
        ? `All ${manifest.length} Section 8 screens verified with components and 6-state test coverage`
        : `${issues.length} screen state matrix defects detected`,
    details: issues,
  };
}
