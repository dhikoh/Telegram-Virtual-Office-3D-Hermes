import type Database from 'better-sqlite3';
import type { Project, ProjectStatus } from '@hermes-office/shared';

/**
 * Tahap 14 — tabel `projects` (migrasi 007).
 *
 * Satu baris = satu tujuan pemilik yang dipecah orkestrator menjadi subtask
 * berantai. `decompose_error` menyimpan pesan apa adanya bila pecahan tidak
 * bisa dibaca; kolom itu sengaja ada di tabel supaya kejujurannya bertahan
 * lewat restart, bukan hanya hidup di respons POST.
 */
export const coalesce = <T>(incoming: T | undefined, current: T | null): T | null =>
  incoming === undefined ? current : incoming;

export class ProjectRepository {
  constructor(private db: Database.Database) {}

  public getAll(): Project[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[];
  }

  public getById(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return (row as Project) || null;
  }

  public create(project: Project): void {
    this.db
      .prepare(
        `INSERT INTO projects (id, title, goal, status, created_by, created_at, completed_at, summary, decompose_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        project.id,
        project.title,
        project.goal,
        project.status,
        project.created_by,
        project.created_at,
        project.completed_at,
        project.summary,
        project.decompose_error
      );
  }

  public update(id: string, updates: Partial<Project>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(updates)) {
      if (key !== 'id' && val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (fields.length === 0) return;
    values.push(id);

    this.db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  /** Subtask milik satu proyek, urut indeks dekomposisi (created_at). */
  public getTasks(projectId: string): (import('@hermes-office/shared').Task & {
    depends_on: string | null;
    project_id: string | null;
  })[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC, id ASC')
      .all(projectId) as never;
  }

  public setStatus(id: string, status: ProjectStatus): void {
    this.db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, id);
  }

  /**
   * Tahap 14 — pasang subtask ke proyeknya (migrasi 007 menambah dua kolom di
   * `tasks` yang sengaja di luar schema Task bersama: hanya proyek yang
   * memakainya, tugas biasa tetap NULL/NULL).
   */
  public attach(taskId: string, projectId: string, dependsOn: string[]): void {
    this.db
      .prepare('UPDATE tasks SET project_id = ?, depends_on = ? WHERE id = ?')
      .run(projectId, JSON.stringify(dependsOn), taskId);
  }
}
