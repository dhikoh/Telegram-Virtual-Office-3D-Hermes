import fs from 'node:fs';
import path from 'node:path';
import type { GapCheckContext, CheckResult } from './types.js';
import { run as runC3a } from './c3a-endpoints.js';
import { run as runC3b } from './c3b-tables.js';
import { run as runC3c } from './c3c-i18n.js';
import { run as runC3d } from './c3d-env.js';
import { run as runC3e } from './c3e-hygiene.js';
import { run as runC3f } from './c3f-mock-security.js';
import { run as runC3g } from './c3g-ledger.js';
import { run as runC3h } from './c3h-screen-states.js';

export function readCurrentPhase(rootDirOrContent: string): number {
  let content = rootDirOrContent;
  if (!content.includes('Current Phase:')) {
    const progressPath = path.join(rootDirOrContent, 'docs', 'PROGRESS.md');
    if (!fs.existsSync(progressPath)) return 0;
    content = fs.readFileSync(progressPath, 'utf-8');
  }
  const match = content.match(/Current Phase:\s*(?:Tahap|Phase|Stage)\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

export async function runAllGapChecks(ctx: GapCheckContext): Promise<{
  results: CheckResult[];
  allPassed: boolean;
  totalChecksExecuted: number;
}> {
  const checks = [
    { code: 'C3a', fn: () => runC3a(ctx) },
    { code: 'C3b', fn: () => Promise.resolve(runC3b(ctx)) },
    { code: 'C3c', fn: () => Promise.resolve(runC3c(ctx)) },
    { code: 'C3d', fn: () => Promise.resolve(runC3d(ctx)) },
    { code: 'C3e', fn: () => Promise.resolve(runC3e(ctx)) },
    { code: 'C3f', fn: () => Promise.resolve(runC3f(ctx)) },
    { code: 'C3g', fn: () => Promise.resolve(runC3g(ctx)) },
    { code: 'C3h', fn: () => Promise.resolve(runC3h(ctx)) },
  ];

  const results: CheckResult[] = [];
  for (const check of checks) {
    const res = await check.fn();
    results.push(res);
  }

  // Meta-check: Exactly C3a..C3h must have executed
  const expectedCodes = ['C3a', 'C3b', 'C3c', 'C3d', 'C3e', 'C3f', 'C3g', 'C3h'];
  const executedCodes = expectedCodes.filter((code) =>
    results.some((r) => r.category.includes(code))
  );

  const metaCheckPassed =
    executedCodes.length === 8 && results.length === 8;

  const allPassed = metaCheckPassed && results.every((r) => r.passed);

  return {
    results,
    allPassed,
    totalChecksExecuted: results.length,
  };
}

export async function main(): Promise<void> {
  const rootDir = process.cwd();
  const currentPhase = readCurrentPhase(rootDir);
  const ctx: GapCheckContext = { rootDir, currentPhase };

  process.stdout.write(`\n======================================================\n`);
  process.stdout.write(`       HERMES VIRTUAL OFFICE — GAP-CHECK (C3)          \n`);
  process.stdout.write(`       Active Evaluation Phase: PHASE ${currentPhase}  \n`);
  process.stdout.write(`======================================================\n\n`);

  const { results, allPassed, totalChecksExecuted } = await runAllGapChecks(ctx);

  for (const r of results) {
    const icon = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
    process.stdout.write(`${icon} ${r.category}: ${r.message}\n`);
    if (r.details && r.details.length > 0) {
      r.details.slice(0, 10).forEach((d) => process.stdout.write(`     - ${d}\n`));
      if (r.details.length > 10) {
        process.stdout.write(`     ... (${r.details.length - 10} more)\n`);
      }
    }
  }

  process.stdout.write(`\nMeta-Check: ${totalChecksExecuted}/8 checks executed (C3a..C3h)\n`);
  process.stdout.write(`======================================================\n`);

  if (!allPassed) {
    process.stdout.write(`🚨 GAP-CHECK FAILED: Fix the items above before phase completion.\n`);
    process.exit(1);
  } else {
    process.stdout.write(`🎉 GAP-CHECK PASSED: Phase ${currentPhase} meets all 8 completeness criteria.\n`);
    process.exit(0);
  }
}
