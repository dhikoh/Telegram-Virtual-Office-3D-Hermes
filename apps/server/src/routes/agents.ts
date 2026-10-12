import type { FastifyPluginAsync } from 'fastify';
import { AgentSchema, AgentInputSchema, type Agent } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { getHermesClientForAgent } from '../services/hermes/index.js';
import { config } from '../config.js';

/** F-08: Strip server-only fields from agent before sending to client */
function toPublic(
  agent: Agent,
  liveStatus?: { status: string; tool?: string }
) {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    department: agent.department,
    avatar: agent.avatar,
    soul_summary: agent.soul_summary,
    hermes_profile: agent.hermes_profile,
    active: agent.active,
    hired_at: agent.hired_at,
    created_at: agent.created_at,
    endpoint_configured: Boolean(agent.hermes_base_url && agent.api_key_env),
    ...(liveStatus !== undefined ? { live_status: liveStatus.status } : {}),
  };
}

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // F-09: Typed decorations — no cast needed with types/fastify.d.ts augmentation
  const { db, dispatcher } = fastify;
  const agentRepo = new AgentRepository(db);
  const auditRepo = new AuditRepository(db);

  fastify.get('/api/agents', async () => {
    const agents = agentRepo.getAll();
    // F-08: Strip hermes_base_url/api_key_env — client receives AgentPublic shape
    return agents.map((agent) => toPublic(agent, dispatcher.getAgentStatus(agent.id)));
  });

  fastify.post('/api/agents', async (request, reply) => {
    const rawBody = (request.body || {}) as Record<string, unknown>;
    // Apply defaults for hermes_base_url if not provided
    const bodyWithDefaults = {
      ...rawBody,
      hermes_base_url: rawBody.hermes_base_url || config.HERMES_BASE_URL,
      api_key_env: rawBody.api_key_env || 'HERMES_KEY_DEFAULT',
    };
    const parseResult = AgentSchema.safeParse(bodyWithDefaults);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parseResult.error.format() });
    }

    const agent = parseResult.data;
    agentRepo.create(agent);

    // Rule S9: Audit log mutating action
    auditRepo.logAction(request.user!.id, 'agent.create', agent.id, JSON.stringify({ name: agent.name }));

    // F-08: Return public shape — no hermes URLs in response
    return reply.code(201).send(toPublic(agent));
  });

  fastify.patch<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = agentRepo.getById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }

    const updates = request.body as Record<string, unknown>;
    agentRepo.update(id, updates);

    auditRepo.logAction(request.user!.id, 'agent.update', id, JSON.stringify(updates));

    const updated = agentRepo.getById(id);
    return updated ? toPublic(updated) : null;
  });

  fastify.get<{ Params: { id: string } }>('/api/agents/:id/health', async (request, reply) => {
    const { id } = request.params;
    const agent = agentRepo.getById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }

    try {
      const client = getHermesClientForAgent(agent);
      const capabilities = await client.capabilities();
      return { status: 'healthy', capabilities };
    } catch (err) {
      return reply.code(502).send({ error: 'gateway_unreachable', message: `Hermes gateway error: ${err}` });
    }
  });

  fastify.post<{ Params: { id: string }; Body: { messages: { role: string; content: string }[] } }>(
    '/api/agents/:id/chat',
    async (request, reply) => {
      const { id } = request.params;
      const agent = agentRepo.getById(id);
      if (!agent) {
        return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
      }

      const { messages } = request.body || { messages: [] };
      if (!Array.isArray(messages) || messages.length === 0) {
        return reply.code(400).send({ error: 'invalid_input', message: 'Messages array is required' });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const client = getHermesClientForAgent(agent);
      await client.chatStream(messages, (chunk) => {
        reply.raw.write(chunk);
      });

      reply.raw.end();
    }
  );
};
