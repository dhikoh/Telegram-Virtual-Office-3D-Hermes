import fs from 'node:fs';
import path from 'node:path';
import type { GapCheckContext, CheckResult } from './types.js';

export interface C3gOptions {
  customLedgerContent?: string;
}

export function run(ctx: GapCheckContext, options?: C3gOptions): CheckResult {
  const ledgerPath = path.join(ctx.rootDir, 'docs', 'TRACEABILITY.md');
  const content =
    options?.customLedgerContent ??
    (fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf-8') : '');

  if (!content) {
    return {
      category: 'Ledger Integrity (C3g)',
      passed: false,
      message: 'docs/TRACEABILITY.md not found',
    };
  }

  const rows = content.split('\n').filter((l) => l.trim().startsWith('| **REQ-'));
  const remainingTodo: string[] = [];

  for (const row of rows) {
    const cols = row.split('|').map((c) => c.trim());
    if (cols.length >= 6) {
      const id = cols[1];
      const phases = cols[3].split(',').map((p) => parseInt(p.trim(), 10)).filter((n) => !isNaN(n));
      const status = cols[5];

      const minPhase = Math.min(...(phases.length > 0 ? phases : [99]));
      if (minPhase <= ctx.currentPhase && (status === 'TODO' || status === 'ASSUMED')) {
        remainingTodo.push(`${id} (Phase ${cols[3]} has status "${status}" in Phase ${ctx.currentPhase})`);
      }
    }
  }

  return {
    category: 'Ledger Integrity (C3g)',
    passed: remainingTodo.length === 0,
    message:
      remainingTodo.length === 0
        ? `All requirements due by Phase ${ctx.currentPhase} are closed or verified (${rows.length} total rows)`
        : `${remainingTodo.length} requirements due by Phase ${ctx.currentPhase} remain open`,
    details: remainingTodo,
  };
}
