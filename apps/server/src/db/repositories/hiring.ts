import type Database from 'better-sqlite3';
import type { HiringDraft } from '@hermes-office/shared';

export class HiringRepository {
  constructor(private db: Database.Database) {}

  public getDraft(id: string): HiringDraft | null {
    const row = this.db.prepare('SELECT * FROM hiring_drafts WHERE id = ?').get(id);
    return (row as HiringDraft) || null;
  }

  public createDraft(draft: HiringDraft): void {
    this.db
      .prepare(
        `INSERT INTO hiring_drafts (id, form_json, soul_md, commands_md, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(draft.id, draft.form_json, draft.soul_md, draft.commands_md, draft.status, draft.created_at);
  }

  public markHired(id: string): void {
    this.db.prepare("UPDATE hiring_drafts SET status = 'hired' WHERE id = ?").run(id);
  }
}
