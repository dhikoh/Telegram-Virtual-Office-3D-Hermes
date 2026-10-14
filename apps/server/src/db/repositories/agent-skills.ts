import type Database from 'better-sqlite3';

/**
 * Tahap 11 (bagian 2) — cakupan skill per agen (layer SOUL).
 *
 * Kontrak yang sama dengan migrasi 008_agent_skills.sql:
 *   baris ada  = skill DIMATIKAN untuk agen itu;
 *   tanpa baris = skill AKTIF (bawaan, tidak ada seeding).
 * Karena itu API PATCH menerima daftar skill AKTIF, dan repo menyimpan
 * komplemennya (yang mati) saja.
 */
export class AgentSkillRepository {
  constructor(private db: Database.Database) {}

  /** Skill yang dimatikan untuk satu agen. */
  public listDisabled(agentId: string): string[] {
    const rows = this.db
      .prepare('SELECT skill FROM agent_skills WHERE agent_id = ? ORDER BY skill')
      .all(agentId) as { skill: string }[];
    return rows.map((r) => r.skill);
  }

  /**
   * Ganti seluruh keputusan satu agen: hapus baris lamanya, tulis baris untuk
   * skill yang dimatikan. Satu transisi atomik — tidak pernah menyisakan
   * setengah konfigurasi bila koneksi terputus di tengah jalan.
   */
  public replaceDisabled(agentId: string, disabled: string[]): void {
    const now = Date.now();
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM agent_skills WHERE agent_id = ?').run(agentId);
      const insert = this.db.prepare(
        'INSERT INTO agent_skills (agent_id, skill, updated_at) VALUES (?, ?, ?)'
      );
      for (const skill of disabled) insert.run(agentId, skill, now);
    })();
  }

  /** Bersihkan saat agen dihapus (pengaman bila PRAGMA foreign_keys mati). */
  public deleteForAgent(agentId: string): number {
    return this.db.prepare('DELETE FROM agent_skills WHERE agent_id = ?').run(agentId).changes;
  }
}
