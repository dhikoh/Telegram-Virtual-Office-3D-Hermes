import type Database from 'better-sqlite3';
import type { Agent, AgentProvisionState } from '@hermes-office/shared';

export const coalesce = <T>(incoming: T | undefined, current: T | null): T | null =>
  incoming === undefined ? current : incoming;

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
        `INSERT INTO agents (id, name, role, department, avatar, soul_summary, hermes_base_url, api_key_env, hermes_profile, active, hired_at, created_at, is_system, avatar_style, provision_state, provision_error, provisioned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        agent.created_at,
        agent.is_system ?? 0,
        agent.avatar_style ?? null,
        agent.provision_state ?? 'unprovisioned',
        agent.provision_error ?? null,
        agent.provisioned_at ?? null
      );
  }

  public update(id: string, updates: Partial<Agent>): void {
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
    this.db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  /**
   * Fase 3 — update status provisioning profil Hermes per agen
   */
  public updateProvisionState(
    id: string,
    state: AgentProvisionState,
    error?: string | null,
    provisionedAt?: number | null
  ): void {
    const now = Date.now();
    const resolvedProvisionedAt =
      provisionedAt !== undefined ? provisionedAt : state === 'ready' ? now : null;

    this.db
      .prepare(
        `UPDATE agents
         SET provision_state = ?,
             provision_error = ?,
             provisioned_at = CASE
               WHEN ? IS NOT NULL THEN ?
               WHEN ? = 'ready' AND provisioned_at IS NULL THEN ?
               ELSE provisioned_at
             END
         WHERE id = ?`
      )
      .run(state, error ?? null, resolvedProvisionedAt, resolvedProvisionedAt, state, now, id);
  }

  /** Tahap 8 — hapus agen dari roster (kunci API & sesi ikut dibersihkan di route). */
  public delete(id: string): number {
    return this.db.prepare('DELETE FROM agents WHERE id = ?').run(id).changes;
  }
}

