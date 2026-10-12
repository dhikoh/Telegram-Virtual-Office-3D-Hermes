import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../../apps/server/src/db/migrator.js';
import { SCHEMA_SPEC, type TableSpec } from '../../packages/shared/src/schema-spec.js';
import type { GapCheckContext, CheckResult } from './types.js';

export interface C3bOptions {
  customSpec?: readonly TableSpec[];
  customDb?: BetterSqlite3.Database;
}

export function run(ctx: GapCheckContext, options?: C3bOptions): CheckResult {
  const currentPhase = ctx.currentPhase;
  if (currentPhase < 2) {
    return {
      category: 'Data Tables (C3b)',
      passed: true,
      message: `Phase ${currentPhase}: Tables due in Phase 2 (9 tables pending)`,
    };
  }

  const specs = options?.customSpec ?? SCHEMA_SPEC;
  const db = options?.customDb ?? new BetterSqlite3(':memory:');
  const shouldClose = !options?.customDb;

  if (!options?.customDb) {
    runMigrations(db);
  }

  const issues: string[] = [];

  for (const tableSpec of specs) {
    if (tableSpec.requiredPhase > currentPhase) continue;

    // Check table existence
    const tableRow = db
      .prepare<{ name: string }, { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = :name"
      )
      .get({ name: tableSpec.name });

    if (!tableRow) {
      issues.push(`Table missing: "${tableSpec.name}" (due in Phase ${tableSpec.requiredPhase})`);
      continue;
    }

    // Check table columns
    const columns = db
      .prepare<unknown[], { name: string }>(`PRAGMA table_info(${tableSpec.name})`)
      .all()
      .map((c) => c.name);

    for (const col of tableSpec.columns) {
      if (!columns.includes(col)) {
        issues.push(`Table "${tableSpec.name}" is missing column "${col}"`);
      }
    }
  }

  if (shouldClose) {
    db.close();
  }

  return {
    category: 'Data Tables (C3b)',
    passed: issues.length === 0,
    message:
      issues.length === 0
        ? `All ${specs.length} SQLite tables and columns match Section 6 data model`
        : `${issues.length} schema table/column discrepancies detected`,
    details: issues,
  };
}
