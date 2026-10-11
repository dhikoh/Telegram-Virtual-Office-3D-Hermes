import type { FastifyPluginAsync } from 'fastify';
import { AgentSchema } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { getHermesClientForAgent } from '../services/hermes/index.js';

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  const db = (fastify as any).db; // eslint-disable-line @typescript-eslint/no-explicit-any
  const dispatcher = (fastify as any).dispatcher; // eslint-disable-line @typescript-eslint/no-explicit-any
  const agentRepo = new AgentRepository(db);
  const auditRepo = new AuditRepository(db);

  fastify.get('/api/agents', async () => {
    const agents = agentRepo.getAll();
    return agents.map((agent) => ({
      ...agent,
      live_status: dispatcher.getAgentStatus(agent.id),
    }));
  });

  fastify.post('/api/agents', async (request, reply) => {
    const parseResult = AgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parseResult.error.format() });
    }

    const agent = parseResult.data;
    agentRepo.create(agent);

    // Rule S9: Audit log mutating action
    auditRepo.logAction(request.user!.id, 'agent.create', agent.id, JSON.stringify({ name: agent.name }));

    return reply.code(201).send(agent);
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
    return updated;
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
