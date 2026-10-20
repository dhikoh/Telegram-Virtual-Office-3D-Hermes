import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const applied = new Set(appliedRows.map((r) => r.name));

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(__dirname, '..', '..', 'src', 'db', 'migrations'),
    path.resolve(process.cwd(), 'apps/server/src/db/migrations'),
    path.resolve(process.cwd(), 'src/db/migrations'),
  ];

  let migrationsDir: string | null = null;
  let maxSqlFiles = -1;

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const sqlFiles = fs.readdirSync(candidate).filter((f) => f.endsWith('.sql'));
      if (sqlFiles.length > maxSqlFiles) {
        maxSqlFiles = sqlFiles.length;
        migrationsDir = candidate;
      }
    }
  }

  if (!migrationsDir) return;

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (!applied.has(file)) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
      })();
    }
  }
}

/**
 * Prune run_events older than 14 days (Section 6 Data Model requirement)
 */
export function pruneOldRunEvents(db: Database.Database, retentionDays = 14): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result = db.prepare('DELETE FROM run_events WHERE ts < ?').run(cutoff);
  return result.changes;
}
