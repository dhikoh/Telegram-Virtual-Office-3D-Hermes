import type Database from 'better-sqlite3';
import type { AuditLog } from '@hermes-office/shared';

export class AuditRepository {
  constructor(private db: Database.Database) {}

  public logAction(telegramUserId: number, action: string, target: string, detailJson = '{}'): void {
    this.db
      .prepare(
        'INSERT INTO audit_log (telegram_user_id, action, target, detail_json, ts) VALUES (?, ?, ?, ?, ?)'
      )
      .run(telegramUserId, action, target, detailJson, Date.now());
  }

  public getAll(limit = 100): AuditLog[] {
    return this.db
      .prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?')
      .all(limit) as AuditLog[];
  }
}
