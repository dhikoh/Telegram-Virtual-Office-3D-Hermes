import type { FastifyPluginAsync } from 'fastify';
import type { CronJob } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { getServerHermesClient, type HermesJob } from '../services/hermes/index.js';

/**
 * Satu-satunya tempat yang boleh menyentuh bentuk mentah jadwal dari gateway.
 * Urutan: schedule.expr -> schedule_display -> schedule (string lama) -> cron (legacy).
 * Mengembalikan null bila tidak ada ekspresi yang bisa dibaca. Tidak pernah melempar.
 */
export function readCronExpr(job: Partial<HermesJob> | unknown): string | null {
  if (!job || typeof job !== 'object') {
    return null;
  }

  const j = job as Partial<HermesJob>;

  // 1. schedule objek -> baca .expr, fallback .display
  if (j.schedule && typeof j.schedule === 'object' && !Array.isArray(j.schedule)) {
    const sObj = j.schedule as { expr?: unknown; display?: unknown };
    if (typeof sObj.expr === 'string' && sObj.expr.trim().length > 0) {
      return sObj.expr.trim();
    }
    if (typeof sObj.display === 'string' && sObj.display.trim().length > 0) {
      return sObj.display.trim();
    }
  }

  // 2. schedule_display string -> kandidat kedua
  if (typeof j.schedule_display === 'string' && j.schedule_display.trim().length > 0) {
    return j.schedule_display.trim();
  }

  // 3. schedule string (bentuk lama) -> pakai apa adanya setelah trim
  if (typeof j.schedule === 'string' && j.schedule.trim().length > 0) {
    return j.schedule.trim();
  }

  // 4. cron string (legacy) -> kandidat terakhir
  if (typeof j.cron === 'string' && j.cron.trim().length > 0) {
    return j.cron.trim();
  }

  return null;
}

/**
 * Konversi ekspresi cron sederhana ke label waktu WIB yang ramah manusia.
 * Contoh: "0 8 * * 1-5" -> "Senin - Jumat pukul 08:00 WIB"
 * Mengembalikan string | null dan tidak pernah melempar error.
 */
export function formatCronWIB(expr: string | null | undefined | unknown): string | null {
  if (typeof expr !== 'string') {
    return null;
  }

  const trimmed = expr.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length < 5) {
    return null;
  }

  const [minute, hour, , , dow] = parts;
  const pad = (n: string) => (n.length === 1 ? `0${n}` : n);

  if (
    !minute.includes('*') &&
    !hour.includes('*') &&
    !isNaN(Number(minute)) &&
    !isNaN(Number(hour))
  ) {
    const mNum = Number(minute);
    const hNum = Number(hour);
    if (mNum >= 0 && mNum <= 59 && hNum >= 0 && hNum <= 23) {
      const timeStr = `${pad(String(hNum))}:${pad(String(mNum))} WIB`;
      if (dow === '1-5') return `Senin - Jumat pukul ${timeStr}`;
      if (dow === '*' || dow === '0-6') return `Setiap hari pukul ${timeStr}`;
      if (dow === '0' || dow === '7') return `Setiap Minggu pukul ${timeStr}`;
      return `Pukul ${timeStr}`;
    }
  }

  return null;
}

function parseIsoToEpochMs(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export const cronRoutes: FastifyPluginAsync = async (fastify) => {
  const { db } = fastify;
  const agentRepo = new AgentRepository(db);

  /**
   * GET /api/cron — Daftar jadwal otomatis (cron) dari gateway Hermes.
   * Setiap job dipetakan ke agen yang bertanggung jawab berdasarkan agent_id atau skill (Fase 5a).
   */
  fastify.get('/api/cron', async (_request, reply) => {
    const client = getServerHermesClient();
    let rawJobs: HermesJob[];
    try {
      rawJobs = await client.listJobs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghubungi gateway Hermes';
      return reply.code(502).send({
        statusCode: 502,
        error: 'Bad Gateway',
        message: `Gateway error: ${message}`,
      });
    }

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
      let targetAgentId =
        typeof job.agent_id === 'string' && job.agent_id.trim() ? job.agent_id.trim() : null;

      const safeSkills = Array.isArray(job.skills)
        ? job.skills.filter((s): s is string => typeof s === 'string')
        : [];

      // Fallback: Petakan berdasarkan skill pertama job jika agent_id belum eksplisit
      if (!targetAgentId && safeSkills.length > 0) {
        const primarySkill = safeSkills[0].toLowerCase();
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
      const cronExpr = readCronExpr(job);
      const cronWib = formatCronWIB(cronExpr);

      const stateVal =
        job.enabled === false
          ? 'paused'
          : job.enabled === true
          ? 'active'
          : job.state || 'scheduled';

      return {
        id: job.id,
        name: job.name || job.id,
        cron: cronExpr,
        cron_wib: cronWib,
        agent_id: assignedAgent?.id || null,
        agent_name: assignedAgent?.name || null,
        agent_avatar: assignedAgent?.avatar || '🤖',
        skills: safeSkills,
        state: stateVal,
        enabled: job.enabled ?? (job.state !== 'paused'),
        last_status: job.last_status || null,
        last_run_at: parseIsoToEpochMs(job.last_run_at),
        next_run_at: parseIsoToEpochMs(job.next_run_at),
      };
    });

    return cronJobs;
  });
};
