import type Database from 'better-sqlite3';
import type { Agent } from '@hermes-office/shared';

export class AgentRepository {
  constructor(private db: Database.Database) {}

  public getAll(): Agent[] {
    return this.db.prepare('SELECT * FROM agents ORDER BY created_at ASC').all() as Agent[];
  }

  public getById(id: string): Agent | null {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    return (row as Agent) || null;
  }

  public create(agent: Agent): void {
    this.db
      .prepare(
        `INSERT INTO agents (id, name, role, department, avatar, soul_summary, hermes_base_url, api_key_env, hermes_profile, active, hired_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        agent.id,
        agent.name,
        agent.role,
        agent.department,
        agent.avatar,
        agent.soul_summary,
        agent.hermes_base_url,
        agent.api_key_env,
        agent.hermes_profile,
        agent.active,
        agent.hired_at,
        agent.created_at
      );
  }

  public update(id: string, updates: Partial<Agent>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(updates)) {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  /** Tahap 8 — hapus agen dari roster (kunci API & sesi ikut dibersihkan di route). */
  public delete(id: string): number {
    return this.db.prepare('DELETE FROM agents WHERE id = ?').run(id).changes;
  }
}
