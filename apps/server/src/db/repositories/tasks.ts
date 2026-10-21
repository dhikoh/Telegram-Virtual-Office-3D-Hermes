import type Database from 'better-sqlite3';
import type { Task } from '@hermes-office/shared';

export const coalesce = <T>(incoming: T | undefined, current: T | null): T | null =>
  incoming === undefined ? current : incoming;

/**
 * Kolom `tasks` yang boleh diubah lewat `update()`.
 *
 * Identitas (`id`, `created_by`, `created_at`) sengaja tidak ada: PATCH dari
 * klien tidak boleh memutasi riwayat penciptaan task. Daftar ini juga yang
 * membuat nama kolom dari input pengguna tidak pernah menyusun string SQL —
 * kunci di luar daftar dibuang sebelum query disusun.
 */
export const UPDATABLE_TASK_COLUMNS = [
  'title',
  'description',
  'agent_id',
  'priority',
  'status',
  'run_id',
  'result_md',
  'due_at',
  'project_id',
  'depends_on',
  'source',
  'tool_calls_count',
] as const;

const UPDATABLE_TASK_COLUMN_SET: ReadonlySet<string> = new Set(UPDATABLE_TASK_COLUMNS);

export const isUpdatableTaskColumn = (key: string): boolean => UPDATABLE_TASK_COLUMN_SET.has(key);

export class TaskRepository {
  constructor(private db: Database.Database) {}

  public getAll(): Task[] {
    return this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Task[];
  }

  public getById(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return (row as Task) || null;
  }

  public create(task: Task): void {
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.id,
        task.title,
        task.description,
        task.agent_id,
        task.priority,
        task.status,
        task.run_id,
        task.result_md,
        task.due_at,
        task.created_by,
        task.created_at,
        task.updated_at,
        task.source || 'manual',
        task.tool_calls_count || 0
      );
  }

  public getByRunId(runId: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE run_id = ?').get(runId);
    return (row as Task) || null;
  }

  public getBySource(source: string): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE source = ? ORDER BY created_at DESC')
      .all(source) as Task[];
  }

  public incrementToolCalls(id: string, count = 1): void {
    this.db
      .prepare('UPDATE tasks SET tool_calls_count = tool_calls_count + ?, updated_at = ? WHERE id = ?')
      .run(count, Date.now(), id);
  }

  public update(id: string, updates: Partial<Task>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(updates)) {
      // Saringan lapis dua: `UPDATABLE_TASK_COLUMNS` menolak nama kolom yang
      // tidak dikenal, dan nilai `?` dipasok terpisah sehingga nama kolom tidak
      // pernah menyusun string SQL dari input pengguna (Rule S4: tanpa injeksi).
      if (key !== 'id' && val !== undefined && isUpdatableTaskColumn(key)) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  public deleteById(id: string): boolean {
    const info = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return info.changes > 0;
  }
}
