import type { FastifyPluginAsync } from 'fastify';
import type { CronJob } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { getServerHermesClient } from '../services/hermes/index.js';

/**
 * Konversi ekspresi cron sederhana ke label waktu WIB yang ramah manusia.
 * Contoh: "0 8 * * 1-5" -> "Senin - Jumat pukul 08:00 WIB"
 */
export function formatCronWIB(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length >= 5) {
    const [minute, hour, , , dow] = parts;
    const pad = (n: string) => (n.length === 1 ? `0${n}` : n);
    if (!minute.includes('*') && !hour.includes('*') && !isNaN(Number(minute)) && !isNaN(Number(hour))) {
      const timeStr = `${pad(hour)}:${pad(minute)} WIB`;
      if (dow === '1-5') return `Senin - Jumat pukul ${timeStr}`;
      if (dow === '*' || dow === '0-6') return `Setiap hari pukul ${timeStr}`;
      if (dow === '0' || dow === '7') return `Setiap Minggu pukul ${timeStr}`;
      return `Pukul ${timeStr}`;
    }
  }
  return cronExpr;
}

export const cronRoutes: FastifyPluginAsync = async (fastify) => {
  const { db, dispatcher } = fastify;
  const agentRepo = new AgentRepository(db);

  /**
   * GET /api/cron — Daftar jadwal otomatis (cron) dari gateway Hermes.
   * Setiap job dipetakan ke agen yang bertanggung jawab berdasarkan agent_id atau skill (Fase 5a).
   */
  fastify.get('/api/cron', async () => {
    const client = getServerHermesClient();
    const rawJobs = await client.listJobs();
    const agents = agentRepo.getAll();

    // Baca skill yang dinonaktifkan per agen (008_agent_skills: baris ada = dimatikan)
    const disabledSkillsMap = new Map<string, Set<string>>();
    try {
      const rows = db.prepare('SELECT agent_id, skill FROM agent_skills').all() as {
        agent_id: string;
        skill: string;
      }[];
      for (const row of rows) {
        if (!disabledSkillsMap.has(row.agent_id)) {
          disabledSkillsMap.set(row.agent_id, new Set());
        }
        disabledSkillsMap.get(row.agent_id)!.add(row.skill.toLowerCase());
      }
    } catch {
      // Tabel agent_skills kosong
    }

    const cronJobs: CronJob[] = rawJobs.map((job) => {
      let targetAgentId = job.agent_id || null;

      // Fallback: Petakan berdasarkan skill pertama job jika agent_id belum eksplisit
      if (!targetAgentId && job.skills && job.skills.length > 0) {
        const primarySkill = job.skills[0].toLowerCase();
        const match = agents.find(
          (a) =>
            (a.role.toLowerCase().includes(primarySkill) ||
              a.soul_summary.toLowerCase().includes(primarySkill) ||
              a.name.toLowerCase().includes(primarySkill)) &&
            !disabledSkillsMap.get(a.id)?.has(primarySkill)
        );
        if (match) targetAgentId = match.id;
      }

      // Default jika masih belum ketemu: agen pertama yang aktif
      if (!targetAgentId && agents.length > 0) {
        targetAgentId = agents[0].id;
      }

      const assignedAgent = targetAgentId ? agents.find((a) => a.id === targetAgentId) : undefined;
      const cronString = job.cron || job.schedule || '* * * * *';

      return {
        id: job.id,
        name: job.name || job.id,
        cron: cronString,
        cron_wib: formatCronWIB(cronString),
        agent_id: assignedAgent?.id || null,
        agent_name: assignedAgent?.name || null,
        agent_avatar: assignedAgent?.avatar || '🤖',
        skills: job.skills || [],
        state: job.state || 'active',
        last_status: job.last_status || null,
        last_run_at: job.last_run_at || null,
        next_run_at: job.next_run_at || null,
      };
    });

    return cronJobs;
  });
};
