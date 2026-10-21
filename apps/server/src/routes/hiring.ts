import type { FastifyPluginAsync } from 'fastify';
import { HiringDraftSchema } from '@hermes-office/shared';
import { HiringRepository } from '../db/repositories/hiring.js';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { departmentExists } from '../db/repositories/departments.js';
import { provisionAgentProfile } from '../services/hermes/provisioner.js';
import { normalizeBaseUrl } from '../services/hermes/detect.js';
import { isLoopbackUrl } from '../services/hermes/index.js';

/**
 * Tahap 20 — endpoint yang melekat pada agen hasil rekrutmen.
 *
 * '' berarti ikut pengaturan server, semantik yang sudah dipakai
 * 004_tahap9_orchestrator.sql (komentar: "hermes_base_url '' = ikut pengaturan
 * server") dan dinormalisasi ulang oleh 002_agent_model_and_endpoint.sql.
 *
 * Nilai dari owner dinormalisasi lebih dulu (suffix /v1 dibuang — Tahap 20 ST-1)
 * supaya tidak tersimpan URL yang menghasilkan /v1/v1/... saat dipakai nanti.
 */
export function resolveHiredBaseUrl(raw: unknown): string {
  // Hanya string yang boleh jadi kandidat: `String(0)` akan menjadi '0' dan
  // dianggap sebagai hostname yang sah oleh normalizer.
  if (typeof raw !== 'string') return '';
  return normalizeBaseUrl(raw.trim()) || '';
}

export const hiringRoutes: FastifyPluginAsync = async (fastify) => {
  // F-09: Typed decorations via types/fastify.d.ts
  const { db } = fastify;
  const hiringRepo = new HiringRepository(db);
  const agentRepo = new AgentRepository(db);
  const auditRepo = new AuditRepository(db);

  fastify.post('/api/hiring/draft', async (request, reply) => {
    const rawBody = (request.body || {}) as Record<string, unknown>;
    const draftData = {
      id: rawBody.id || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      form_json: typeof rawBody.form_json === 'string' ? rawBody.form_json : JSON.stringify(rawBody.form || {}),
      soul_md: (rawBody.soul_md as string) || '# Agent SOUL\n',
      commands_md: (rawBody.commands_md as string) || '# VPS Setup Commands\n',
      status: 'draft',
      created_at: Date.now(),
    };

    const parseResult = HiringDraftSchema.safeParse(draftData);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parseResult.error.format() });
    }

    const draft = parseResult.data;
    hiringRepo.createDraft(draft);

    auditRepo.logAction(request.user!.id, 'hiring.draft_create', draft.id);

    return reply.code(201).send(draft);
  });

  fastify.post<{ Params: { id: string }; Body: { agent?: Record<string, unknown> } }>(
    '/api/hiring/:id/mark-hired',
    async (request, reply) => {
      const { id } = request.params;
      const draft = hiringRepo.getDraft(id);
      if (!draft) {
        return reply.code(404).send({ error: 'not_found', message: 'Hiring draft not found' });
      }

      hiringRepo.markHired(id);

      const agentData = request.body?.agent;
      if (agentData && agentData.id && agentData.name) {
        // Tahap 10: the hiring form's room must resolve to a live department.
        const wantedDept = String(agentData.department || 'command');
        if (!departmentExists(db, wantedDept)) {
          return reply.code(400).send({
            error: 'invalid_input',
            message: `Ruang/departemen '${wantedDept}' tidak dikenal.`,
          });
        }
        // Tahap 20 — '' = ikut pengaturan server. Baris ini sebelumnya menyalin
        // config.HERMES_BASE_URL, sehingga setiap agen tercatat sebagai endpoint
        // "Custom" milik agen padahal owner tidak pernah memilihnya, plus membeku
        // pada URL yang berlaku saat ia direkrut (perubahan env tidak terbawa).
        const requestedBase = resolveHiredBaseUrl(agentData.hermes_base_url);
        if (requestedBase && isLoopbackUrl(requestedBase)) {
          // S5 — konsisten dengan PATCH /api/agents/:id dan POST /connection.
          return reply.code(400).send({
            error: 'invalid_input',
            message:
              'Alamat loopback (127.0.0.1/localhost) ditolak — gunakan alamat host VPS atau kosongkan untuk mengikuti server.',
          });
        }

        agentRepo.create({
          id: String(agentData.id),
          name: String(agentData.name),
          role: String(agentData.role || 'Operasional Agent'),
          department: wantedDept,
          avatar: String(agentData.avatar || '🤖'),
          soul_summary: String(agentData.soul_summary || ''),
          hermes_base_url: requestedBase,
          api_key_env: String(agentData.api_key_env || 'HERMES_KEY_DEFAULT'),
          hermes_profile: String(agentData.hermes_profile || 'default'),
          active: 1,
          hired_at: Date.now(),
          created_at: Date.now(),
        });

        // Fase 3 — auto-provisioning profil Hermes untuk agen baru yang direkrut
        const createdAgent = agentRepo.getById(String(agentData.id));
        if (createdAgent) {
          await provisionAgentProfile(createdAgent, db, {
            userId: request.user?.id,
            soulMd: draft.soul_md,
          });
        }
      }

      auditRepo.logAction(request.user!.id, 'hiring.mark_hired', id);

      return { status: 'hired', id };
    }
  );
};

