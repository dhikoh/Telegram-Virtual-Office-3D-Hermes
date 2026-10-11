import type Database from 'better-sqlite3';
import type { Task } from '@hermes-office/shared';

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
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        task.updated_at
      );
  }

  public update(id: string, updates: Partial<Task>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(updates)) {
      if (key !== 'id') {
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
}
