import type Database from 'better-sqlite3';
import type { Kpi, Department } from '@hermes-office/shared';

export class KpiRepository {
  constructor(private db: Database.Database) {}

  public getAll(department?: Department): Kpi[] {
    if (department) {
      return this.db
        .prepare('SELECT * FROM kpis WHERE department = ? ORDER BY created_at DESC')
        .all(department) as Kpi[];
    }
    return this.db.prepare('SELECT * FROM kpis ORDER BY created_at DESC').all() as Kpi[];
  }

  public create(kpi: Kpi): void {
    this.db
      .prepare(
        `INSERT INTO kpis (id, department, key, label, value, unit, period, source, source_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        kpi.id,
        kpi.department,
        kpi.key,
        kpi.label,
        kpi.value,
        kpi.unit,
        kpi.period,
        kpi.source,
        kpi.source_note,
        kpi.created_at
      );
  }
}
