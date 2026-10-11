import type Database from 'better-sqlite3';
import type { Approval, ApprovalStatus } from '@hermes-office/shared';

export class ApprovalRepository {
  constructor(private db: Database.Database) {}

  public getAll(): Approval[] {
    return this.db.prepare('SELECT * FROM approvals ORDER BY created_at DESC').all() as Approval[];
  }

  public getById(id: string): Approval | null {
    const row = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
    return (row as Approval) || null;
  }

  public getPending(): Approval[] {
    return this.db
      .prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC")
      .all() as Approval[];
  }

  public create(approval: Approval): void {
    this.db
      .prepare(
        `INSERT INTO approvals (id, run_id, agent_id, summary, payload_json, status, decided_by, decided_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        approval.id,
        approval.run_id,
        approval.agent_id,
        approval.summary,
        approval.payload_json,
        approval.status,
        approval.decided_by,
        approval.decided_at,
        approval.created_at
      );
  }

  public resolve(id: string, status: ApprovalStatus, decidedBy: number): void {
    this.db
      .prepare('UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
      .run(status, decidedBy, Date.now(), id);
  }
}
