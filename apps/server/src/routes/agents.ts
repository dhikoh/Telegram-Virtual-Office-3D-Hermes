import type { FastifyPluginAsync } from 'fastify';
import { AgentSchema, type Agent } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { SettingRepository } from '../db/repositories/settings.js';
import {
  getHermesClientForAgent,
  hasCustomEndpoint,
  isLoopbackUrl,
  resolveAgentBaseUrl,
} from '../services/hermes/index.js';
import { normalizeBaseUrl, probeModels } from '../services/hermes/detect.js';
import { config } from '../config.js';

/** F-08: Strip server-only fields from agent before sending to client */
function toPublic(
  agent: Agent,
  liveStatus?: { status: string; tool?: string },
  keyStored = false
) {
  const explicitEndpoint = hasCustomEndpoint(agent);
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    department: agent.department,
    avatar: agent.avatar,
    soul_summary: agent.soul_summary,
    hermes_profile: agent.hermes_profile,
    model: agent.model ?? null,
    active: agent.active,
    hired_at: agent.hired_at,
    created_at: agent.created_at,
    // Tahap 7: the office always has a working gateway (server config), so an
    // explicit agent endpoint means the owner set one themselves.
    endpoint_configured: explicitEndpoint,
    endpoint_source: explicitEndpoint ? 'agent' : 'server',
    key_source: 'server',
    key_stored: keyStored,
    ...(liveStatus !== undefined ? { live_status: liveStatus.status } : {}),
  };
}

function keyExists(settingRepo: SettingRepository, agentId: string): boolean {
  try {
    return Boolean(settingRepo.get(`agent_key:${agentId}`));
  } catch {
    return false;
  }
}

/** Rule S4: a key pasted in the UI is stored server-side, never returned. */
function storeAgentKey(settingRepo: SettingRepository, agentId: string, key: unknown): boolean {
  if (typeof key !== 'string' || !key.trim()) return false;
  settingRepo.set(`agent_key:${agentId}`, key.trim());
  return true;
}

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // F-09: Typed decorations — no cast needed with types/fastify.d.ts augmentation
  const { db, dispatcher } = fastify;
  const agentRepo = new AgentRepository(db);
  const auditRepo = new AuditRepository(db);
  const settingRepo = new SettingRepository(db);

  fastify.get('/api/agents', async () => {
    const agents = agentRepo.getAll();
    // F-08: Strip hermes_base_url/api_key_env — client receives AgentPublic shape
    return agents.map((agent) =>
      toPublic(agent, dispatcher.getAgentStatus(agent.id), keyExists(settingRepo, agent.id))
    );
  });

  fastify.post('/api/agents', async (request, reply) => {
    const rawBody = (request.body || {}) as Record<string, unknown>;
    // Tahap 7: no loopback default — an empty URL means "use the server config".
    const bodyWithDefaults = {
      ...rawBody,
      hermes_base_url: normalizeBaseUrl(String(rawBody.hermes_base_url || '')) || '',
      api_key_env: rawBody.api_key_env || 'HERMES_KEY_DEFAULT',
      model:
        typeof rawBody.model === 'string' && rawBody.model.trim() ? rawBody.model.trim() : null,
    };
    const parseResult = AgentSchema.safeParse(bodyWithDefaults);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parseResult.error.format() });
    }

    const agent = parseResult.data;
    agentRepo.create(agent);
    const keyStored = storeAgentKey(settingRepo, agent.id, rawBody.api_key);

    // Rule S9: Audit log mutating action (never the key itself)
    auditRepo.logAction(
      request.user!.id,
      'agent.create',
      agent.id,
      JSON.stringify({ name: agent.name, model: agent.model, key_stored: keyStored })
    );

    // F-08: Return public shape — no hermes URLs in response
    return reply.code(201).send(toPublic(agent));
  });

  fastify.patch<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = agentRepo.getById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }

    const rawUpdates = (request.body || {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = { ...rawUpdates };

    // Rule S4: the key is diverted to settings, never stored on the agent row,
    // and never written to the audit log or the response.
    delete updates.api_key;
    delete updates.api_key_env;
    delete updates.id;
    const keyStored = storeAgentKey(settingRepo, id, rawUpdates.api_key);

    if ('hermes_base_url' in updates) {
      const normalized = normalizeBaseUrl(String(updates.hermes_base_url || ''));
      if (normalized && isLoopbackUrl(normalized)) {
        // S5: a loopback endpoint points the agent at the container itself —
        // never store it; an empty value means "follow the server setting".
        return reply.code(400).send({
          error: 'invalid_input',
          message:
            'Alamat loopback (127.0.0.1/localhost) ditolak — gunakan alamat host VPS atau kosongkan untuk mengikuti server.',
        });
      }
      updates.hermes_base_url = normalized || '';
    }
    if ('model' in updates) {
      const model = updates.model;
      updates.model = typeof model === 'string' && model.trim() ? model.trim() : null;
    }
    if ('name' in updates && (typeof updates.name !== 'string' || !updates.name.trim())) {
      return reply.code(400).send({ error: 'invalid_input', message: 'Name cannot be empty' });
    }

    agentRepo.update(id, updates);
    auditRepo.logAction(
      request.user!.id,
      'agent.update',
      id,
      JSON.stringify({ ...updates, key_stored: keyStored })
    );

    const updated = agentRepo.getById(id);
    return updated
      ? toPublic(updated, dispatcher.getAgentStatus(id), keyExists(settingRepo, id))
      : null;
  });

  /**
   * Tahap 7 — auto-detect: the owner pastes a base URL + API key, we probe the
   * gateway for the models it serves, store the key server-side and adopt the
   * first advertised model when the agent has none yet.
   */
  fastify.post<{ Params: { id: string }; Body: { base_url?: string; api_key?: string } }>(
    '/api/agents/:id/connection',
    async (request, reply) => {
      const { id } = request.params;
      const agent = agentRepo.getById(id);
      if (!agent) {
        return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
      }

      const body = (request.body || {}) as { base_url?: string; api_key?: string };
      const explicitUrl = normalizeBaseUrl(String(body.base_url || ''));
      if (body.base_url && !explicitUrl) {
        return reply
          .code(400)
          .send({ error: 'invalid_input', message: 'Base URL tidak valid' });
      }
      if (explicitUrl && isLoopbackUrl(explicitUrl)) {
        // S5: a loopback endpoint would point the agent at the container itself,
        // where no gateway listens — reject it instead of storing a dead URL.
        return reply.code(400).send({
          error: 'invalid_input',
          message:
            'Alamat loopback (127.0.0.1/localhost) ditolak — gunakan alamat host VPS atau kosongkan untuk mengikuti server.',
        });
      }

      const keyStored = storeAgentKey(settingRepo, id, body.api_key);
      const baseUrl = explicitUrl || resolveAgentBaseUrl(agent);
      const apiKey = keyStored
        ? String(body.api_key).trim()
        : process.env[agent.api_key_env] || config.HERMES_KEY_DEFAULT;

      const probe = await probeModels(baseUrl, apiKey);
      if (!probe.ok) {
        auditRepo.logAction(
          request.user!.id,
          'agent.connection_failed',
          id,
          JSON.stringify({ error: probe.error, status_code: probe.status_code })
        );
        const hint: Record<string, string> = {
          unauthorized: 'Kunci API ditolak gateway (401).',
          connection_refused: 'Tidak ada gateway yang menjawab di alamat itu.',
          dns: 'Alamat gateway tidak dapat ditemukan.',
          unreachable: 'Alamat gateway tidak dapat dijangkau dari server.',
          timeout: 'Gateway tidak menjawab tepat waktu.',
        };
        return reply.code(502).send({
          error: probe.error || 'unreachable',
          message: hint[probe.error || ''] || `Gateway gagal dihubungi (${probe.error}).`,
          key_stored: keyStored,
        });
      }

      const applied: Record<string, unknown> = {};
      if (explicitUrl) applied.hermes_base_url = explicitUrl;
      if (!agent.model && probe.models.length > 0) applied.model = probe.models[0];
      if (Object.keys(applied).length > 0) agentRepo.update(id, applied);

      auditRepo.logAction(
        request.user!.id,
        'agent.connection_ok',
        id,
        JSON.stringify({ models: probe.models, model: applied.model ?? agent.model })
      );

      const updated = agentRepo.getById(id)!;
      return {
        status: 'connected',
        models: probe.models,
        current_model: updated.model ?? null,
        key_stored: keyStored,
        endpoint_configured: hasCustomEndpoint(updated),
        platform: 'hermes-agent',
        latency_ms: probe.latency_ms,
      };
    }
  );

  fastify.get<{ Params: { id: string } }>('/api/agents/:id/health', async (request, reply) => {
    const { id } = request.params;
    const agent = agentRepo.getById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }

    try {
      const client = getHermesClientForAgent(agent, db);
      const capabilities = await client.capabilities();
      return { status: 'healthy', capabilities, model: agent.model ?? null };
    } catch (err) {
      return reply
        .code(502)
        .send({ error: 'gateway_unreachable', message: `Hermes gateway error: ${err}` });
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
        return reply
          .code(400)
          .send({ error: 'invalid_input', message: 'Messages array is required' });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const client = getHermesClientForAgent(agent, db);
      try {
        await client.chatStream(
          messages,
          (chunk) => {
            reply.raw.write(chunk);
          },
          agent.model || undefined
        );
      } catch (err) {
        // Surface a real error frame instead of a silently truncated stream
        reply.raw.write(
          `data: ${JSON.stringify({
            error: 'gateway_error',
            message: String((err as Error)?.message || err),
          })}\n\n`
        );
      }

      reply.raw.end();
    }
  );
};
