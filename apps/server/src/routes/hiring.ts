import type { FastifyPluginAsync } from 'fastify';
import { HiringDraftSchema } from '@hermes-office/shared';
import { HiringRepository } from '../db/repositories/hiring.js';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';

export const hiringRoutes: FastifyPluginAsync = async (fastify) => {
  const db = (fastify as any).db; // eslint-disable-line @typescript-eslint/no-explicit-any
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

  fastify.post<{ Params: { id: string }; Body: { agent?: any } }>( // eslint-disable-line @typescript-eslint/no-explicit-any
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
        agentRepo.create({
          id: agentData.id,
          name: agentData.name,
          role: agentData.role || 'Operasional Agent',
          department: agentData.department || 'command',
          avatar: agentData.avatar || '🤖',
          soul_summary: agentData.soul_summary || '',
          hermes_base_url: agentData.hermes_base_url || 'http://127.0.0.1:8642',
          api_key_env: agentData.api_key_env || 'HERMES_KEY_DEFAULT',
          hermes_profile: agentData.hermes_profile || agentData.id,
          active: 1,
          hired_at: Date.now(),
          created_at: Date.now(),
        });
      }

      auditRepo.logAction(request.user!.id, 'hiring.mark_hired', id);

      return { status: 'hired', id };
    }
  );
};
