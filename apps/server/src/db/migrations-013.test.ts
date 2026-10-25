/**
 * Migrasi 013 — indeks run nyangkut & satu-task-per-run.
 *
 * Kebenaran yang dijaga: migrasi benar-benar terpasang saat `runMigrations`
 * berjalan (bukan cuma ada berkasnya), dan indeksnya terbentuk seperti yang
 * dijanjikan:
 *  - `idx_agent_runs_status_started` — query reaper tidak jadi table scan.
 *  - `idx_tasks_run_id_unique` (partial, WHERE run_id IS NOT NULL) — jaring
 *    pengaman tingkat database untuk "satu run = satu task".
 *
 * Migrasi lama (001..012) harus tetap terpasang: 013 tidak boleh menggeser
 * atau menggantikan apa pun yang sudah ada.
 */
import { describe, it, expect } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from './migrator.js';

describe('Migrasi 013 — indeks run nyangkut & task per run', () => {
  it('tercatam sebagai terpasang setelah runMigrations', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      runMigrations(db);
      const row = db
        .prepare('SELECT name FROM _migrations WHERE name = ?')
        .get('013_stale_runs.sql') as { name: string } | undefined;
      expect(row?.name).toBe('013_stale_runs.sql');
    } finally {
      db.close();
    }
  });

  it('migrasi 001..012 tetap terpasang (tidak ada yang tergeser)', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      runMigrations(db);
      const names = (
        db.prepare('SELECT name FROM _migrations ORDER BY name').all() as { name: string }[]
      ).map((r) => r.name);
      expect(names).toContain('001_initial_schema.sql');
      expect(names).toContain('010_agent_chat.sql');
      expect(names).toContain('011_agent_provisioning.sql');
      expect(names).toContain('012_tasks_visibility.sql');
      expect(names).toContain('013_stale_runs.sql');
    } finally {
      db.close();
    }
  });

  it('idx_agent_runs_status_started terbentuk di tabel agent_runs', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      runMigrations(db);
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='agent_runs'")
        .all() as { name: string }[];
      expect(idx.map((i) => i.name)).toContain('idx_agent_runs_status_started');
    } finally {
      db.close();
    }
  });

  it('idx_tasks_run_id_unique terbentuk dan benar-benar UNIQUE', () => {
    const db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    try {
      runMigrations(db);
      const now = Date.now();
      db.prepare(
        `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
           hermes_profile, active, hired_at, created_at)
         VALUES ('agent_mig013', 'Bagas', 'Distributor', 'marketing', 'bot', '{}', 'zeolit',
                 'default', 1, ?, ?)`
      ).run(now, now);

      const insert = db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md,
           due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, 't', '', 'agent_mig013', 'normal', 'done', ?, NULL, NULL, 1, ?, ?, 'chat', 0)`
      );
      insert.run('task_mig_a', 'run_mig013', now, now);

      // run_id yang sama untuk task kedua harus DITOLAK database.
      expect(() => insert.run('task_mig_b', 'run_mig013', now, now)).toThrow();

      // run_id NULL tetap boleh berulang (task manual tidak punya run).
      insert.run('task_mig_c', null, now, now);
      insert.run('task_mig_d', null, now, now);
      const count = db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number };
      expect(count.c).toBe(3);
    } finally {
      db.close();
    }
  });

  it('idempoten — runMigrations dua kali tidak error dan tidak menduplikasi catatan', () => {
    const db = new BetterSqlite3(':memory:');
    try {
      runMigrations(db);
      runMigrations(db);
      const rows = db
        .prepare("SELECT COUNT(*) AS c FROM _migrations WHERE name = '013_stale_runs.sql'")
        .get() as { c: number };
      expect(rows.c).toBe(1);
    } finally {
      db.close();
    }
  });
});
