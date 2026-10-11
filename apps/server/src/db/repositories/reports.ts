import type Database from 'better-sqlite3';
import type { Report, Department } from '@hermes-office/shared';

export class ReportRepository {
  constructor(private db: Database.Database) {}

  public getAll(department?: Department): Report[] {
    if (department) {
      return this.db
        .prepare('SELECT * FROM reports WHERE department = ? ORDER BY created_at DESC')
        .all(department) as Report[];
    }
    return this.db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all() as Report[];
  }

  public getById(id: string): Report | null {
    const row = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    return (row as Report) || null;
  }

  public create(report: Report): void {
    this.db
      .prepare(
        `INSERT INTO reports (id, agent_id, department, template, period, body_md, metrics_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        report.id,
        report.agent_id,
        report.department,
        report.template,
        report.period,
        report.body_md,
        report.metrics_json,
        report.created_at
      );
  }
}
