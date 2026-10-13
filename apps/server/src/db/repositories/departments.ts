/**
 * Tahap 10 — departments (office rooms) as data.
 *
 * The eight original rooms are seeded rows (is_system = 1); the owner can
 * rename/recolor/reorder/hide them and create custom rooms from the More
 * screen. Every agent write must resolve its department through here.
 */
import type { Database } from 'better-sqlite3';

export interface DepartmentRow {
  id: string;
  name: string | null;
  color: string;
  sort_order: number;
  is_system: 0 | 1;
  hidden: 0 | 1;
  created_at: number;
}

export interface DepartmentInput {
  name?: string;
  color?: string;
  sort_order?: number;
  hidden?: number;
}

export function listDepartments(db: Database): DepartmentRow[] {
  return db
    .prepare('SELECT * FROM departments ORDER BY sort_order ASC, id ASC')
    .all() as DepartmentRow[];
}

export function getDepartment(db: Database, id: string): DepartmentRow | undefined {
  return db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as
    | DepartmentRow
    | undefined;
}

/** True when the id resolves to a live department row (dynamic dept validation). */
export function departmentExists(db: Database, id: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM departments WHERE id = ?').get(id));
}

export function createDepartment(db: Database, id: string, row: DepartmentInput): DepartmentRow {
  const nextOrder =
    row.sort_order ??
    ((db.prepare('SELECT MAX(sort_order) AS m FROM departments').get() as { m: number | null })
      .m ?? 0) + 10;
  db.prepare(
    `INSERT INTO departments (id, name, color, sort_order, is_system, hidden, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).run(id, row.name ?? null, row.color ?? '#94A3B8', nextOrder, row.hidden ?? 0, Date.now());
  return getDepartment(db, id)!;
}

const PATCHABLE = new Set(['name', 'color', 'sort_order', 'hidden']);

export function updateDepartment(
  db: Database,
  id: string,
  patch: DepartmentInput
): DepartmentRow | undefined {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!PATCHABLE.has(key) || value === undefined) continue;
    sets.push(`${key} = ?`);
    params.push(value);
  }
  if (sets.length > 0) {
    params.push(id);
    db.prepare(`UPDATE departments SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }
  return getDepartment(db, id);
}

/** Agents currently living in a room (hiring guard for deletion). */
export function countAgentsInDepartment(db: Database, id: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM agents WHERE department = ? AND active = 1")
    .get(id) as { n: number };
  return row.n;
}

export function deleteDepartment(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM departments WHERE id = ?').run(id).changes > 0;
}
