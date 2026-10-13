import type { FastifyPluginAsync } from 'fastify';
import { AgentSchema, type Agent } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { departmentExists } from '../db/repositories/departments.js';
import { SettingRepository } from '../db/repositories/settings.js';
import {
  getHermesClientForAgent,
  hasCustomEndpoint,
  isLoopbackUrl,
  resolveAgentBaseUrl,
} from '../services/hermes/index.js';
import { normalizeBaseUrl, probeModels } from '../services/hermes/detect.js';
import { config } from '../config.js';

/** Tahap 9 — avatar style stored as JSON on the agent row, parsed for the client. */
function parseAvatarStyle(raw: string | null | undefined): { shirt?: string; accessory?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { shirt?: unknown; accessory?: unknown };
    const style: { shirt?: string; accessory?: string } = {};
    if (typeof parsed.shirt === 'string') style.shirt = parsed.shirt;
    if (typeof parsed.accessory === 'string') style.accessory = parsed.accessory;
    return Object.keys(style).length > 0 ? style : null;
  } catch {
    return null;
  }
}

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
    avatar_style: parseAvatarStyle(agent.avatar_style),
    soul_summary: agent.soul_summary,
    hermes_profile: agent.hermes_profile,
    model: agent.model ?? null,
    active: agent.active,
    // Tahap 9 — the orchestrator is a system agent: undeletable, undisableable.
    is_system: Boolean(agent.is_system),
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

/**
 * Tahap 9 — PATCH whitelist. Anything outside this set never reaches SQL:
 * is_system and session_id are server-managed, and the key fields are already
 * diverted to settings above.
 */
const PATCHABLE_AGENT_FIELDS = new Set([
  'name',
  'role',
  'department',
  'avatar',
  'avatar_style',
  'soul_summary',
  'hermes_profile',
  'model',
  'active',
  'hermes_base_url',
]);

const AVATAR_ACCESSORIES = new Set(['none', 'glasses', 'cap', 'headset']);

/** Tahap 9 — validate + serialize the avatar style before it touches the row. */
function encodeAvatarStyle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  const raw = value as { shirt?: unknown; accessory?: unknown };
  const style: { shirt?: string; accessory?: string } = {};
  if (typeof raw.shirt === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.shirt)) {
    style.shirt = raw.shirt;
  }
  if (typeof raw.accessory === 'string' && AVATAR_ACCESSORIES.has(raw.accessory)) {
    style.accessory = raw.accessory;
  }
  return Object.keys(style).length > 0 ? JSON.stringify(style) : null;
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
    // Tahap 10: department must resolve to a live room row.
    if (!departmentExists(request.server.db, agent.department)) {
      return reply
        .code(400)
        .send({ error: 'invalid_input', message: `Ruang/departemen '${agent.department}' tidak dikenal.` });
    }
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
    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(rawUpdates)) {
      if (PATCHABLE_AGENT_FIELDS.has(key)) updates[key] = rawUpdates[key];
    }

    // Rule S4: the key is diverted to settings, never stored on the agent row,
    // and never written to the audit log or the response.
    const keyStored = storeAgentKey(settingRepo, id, rawUpdates.api_key);

    // Tahap 9 — the system orchestrator can be renamed but never disabled.
    if (existing.is_system && 'active' in updates && !Number(updates.active)) {
      return reply.code(403).send({
        error: 'system_agent',
        message: 'Agen sistem orkestrator tidak dapat dinonaktifkan.',
      });
    }
    if ('avatar_style' in updates) {
      updates.avatar_style = encodeAvatarStyle(updates.avatar_style);
    }

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
    // Tahap 10: moving an agent into a room requires a live department row.
    if ('department' in updates && !departmentExists(db, String(updates.department))) {
      return reply.code(400).send({
        error: 'invalid_input',
        message: `Ruang/departemen '${String(updates.department)}' tidak dikenal.`,
      });
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
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      try {
        // Tahap 8: prefer the gateway session — history and memory persist there.
        const sessionId = agent.session_id || (await client.createSession(`${agent.name}`));
        if (sessionId) {
          if (!agent.session_id) {
            agentRepo.update(id, { session_id: sessionId });
            // Tahap 9 — record the live session so "Sesi baru" can archive it later.
            db.prepare(
              'INSERT OR IGNORE INTO agent_sessions (agent_id, session_id, created_at, archived_at) VALUES (?, ?, ?, NULL)'
            ).run(id, sessionId, Date.now());
          }
          await client.sessionChatStream(
            sessionId,
            lastUser?.content || JSON.stringify(messages),
            (chunk) => {
              reply.raw.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
            },
            agent.model || undefined
          );
          reply.raw.write('data: [DONE]\n\n');
        } else {
          await client.chatStream(
            messages,
            (chunk) => {
              reply.raw.write(chunk);
            },
            agent.model || undefined
          );
        }
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

  /**
   * Tahap 8 — riwayat chat nyata: diambil dari sesi agen di gateway.
   * Tanpa sesi (belum pernah chat / gateway mock) → daftar kosong, bukan data karangan.
   */
  fastify.get<{ Params: { id: string }; Querystring: { session?: string } }>(
    '/api/agents/:id/chat',
    async (request, reply) => {
      const { id } = request.params;
      const agent = agentRepo.getById(id);
      if (!agent) {
        return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
      }
      // Tahap 9 — ?session=<sid> reads an archived session; it must belong to
      // this agent, so one agent's history can never be fetched for another.
      const requested = request.query.session?.trim();
      let sessionId = agent.session_id;
      if (requested) {
        const owned = db
          .prepare('SELECT 1 FROM agent_sessions WHERE agent_id = ? AND session_id = ?')
          .get(id, requested);
        if (!owned) {
          return reply.code(403).send({
            error: 'invalid_input',
            message: 'Sesi tersebut bukan milik agen ini.',
          });
        }
        sessionId = requested;
      }
      if (!sessionId) {
        return { messages: [], session_id: null };
      }
      try {
        const client = getHermesClientForAgent(agent, db);
        const messages = await client.getSessionMessages(sessionId);
        return {
          session_id: sessionId,
          is_archived: Boolean(requested && requested !== agent.session_id),
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
        };
      } catch (err) {
        return reply
          .code(502)
          .send({ error: 'gateway_unreachable', message: `Riwayat chat gagal dimuat: ${err}` });
      }
    }
  );

  /**
   * Tahap 9 — "Sesi baru": sesi gateway sekarang diarsipkan (dicatat di
   * agent_sessions, riwayatnya tetap hidup di gateway), lalu sesi kosong yang
   * baru dibuat untuk melanjutkan percakapan.
   */
  fastify.post<{ Params: { id: string } }>('/api/agents/:id/session', async (request, reply) => {
    const { id } = request.params;
    const agent = agentRepo.getById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }
    try {
      const client = getHermesClientForAgent(agent, db);
      const now = Date.now();
      if (agent.session_id) {
        db.prepare(
          'UPDATE agent_sessions SET archived_at = ? WHERE agent_id = ? AND session_id = ?'
        ).run(now, id, agent.session_id);
      }
      const sessionId = await client.createSession(`${agent.name} (sesi baru)`);
      if (sessionId) {
        agentRepo.update(id, { session_id: sessionId });
        db.prepare(
          'INSERT OR REPLACE INTO agent_sessions (agent_id, session_id, created_at, archived_at) VALUES (?, ?, ?, NULL)'
        ).run(id, sessionId, now);
      } else {
        // Mock client (unit tests) has no real sessions — clear the pointer.
        agentRepo.update(id, { session_id: null });
      }
      auditRepo.logAction(
        request.user!.id,
        'agent.session_reset',
        id,
        JSON.stringify({ had_session: Boolean(agent.session_id), new_session: Boolean(sessionId) })
      );
      return { session_id: sessionId ?? null };
    } catch (err) {
      return reply
        .code(502)
        .send({ error: 'gateway_unreachable', message: `Sesi gagal dibuat: ${err}` });
    }
  });

  /** Tahap 9 — daftar sesi (arsip) milik satu agen, terbaru di atas. */
  fastify.get<{ Params: { id: string } }>('/api/agents/:id/sessions', async (request, reply) => {
    const { id } = request.params;
    const agent = agentRepo.getById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }
    const rows = db
      .prepare(
        'SELECT session_id, created_at, archived_at FROM agent_sessions WHERE agent_id = ? ORDER BY created_at DESC'
      )
      .all(id) as { session_id: string; created_at: number; archived_at: number | null }[];
    return {
      sessions: rows.map((row) => ({
        session_id: row.session_id,
        created_at: row.created_at,
        archived_at: row.archived_at,
        is_current: row.session_id === agent.session_id,
      })),
    };
  });

  /**
   * Tahap 8 — hapus agen: baris dihapus dari roster, kunci API disingkirkan
   * dari settings, dan tugas yang ditugaskan kepadanya ikut dihapus (dicatat
   * di audit log agar tidak ada data yang hilang tanpa jejak).
   */
  fastify.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const { id } = request.params;
    const agent = agentRepo.getById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }
    // Tahap 9 — the system orchestrator is permanent.
    if (agent.is_system) {
      return reply.code(403).send({
        error: 'system_agent',
        message: 'Agen sistem orkestrator tidak dapat dihapus.',
      });
    }

    const tasksRemoved = db
      .prepare('DELETE FROM tasks WHERE agent_id = ?')
      .run(id).changes;
    settingRepo.delete(`agent_key:${id}`);
    const removed = agentRepo.delete(id);

    auditRepo.logAction(
      request.user!.id,
      'agent.delete',
      id,
      JSON.stringify({ name: agent.name, tasks_removed: tasksRemoved, had_session: Boolean(agent.session_id) })
    );

    return { success: removed > 0, id, tasks_removed: tasksRemoved };
  });
};
