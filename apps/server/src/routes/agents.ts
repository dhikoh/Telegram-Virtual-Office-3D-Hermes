import type { FastifyPluginAsync } from 'fastify';
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import { AgentSchema, isCharacterModelId, type Agent } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { AgentSkillRepository } from '../db/repositories/agent-skills.js';
import { AuditRepository } from '../db/repositories/audit.js';
import {
  invalidateGatewayCatalogCache,
  readGatewayCatalog,
  readGatewayCatalogCached,
  type GatewayCatalog,
} from '../services/skill-catalog.js';
import {
  applySkillScope,
  buildSkillScopeDirective,
  stripSkillScope,
} from '../services/hermes/skill-scope.js';
import { buildAgentIdentity } from '../services/hermes/identity.js';
import { startHeartbeat } from '../services/agent-chat/heartbeat.js';
import { chatRunHub } from '../services/agent-chat/run-hub.js';
import { chatIdempotencyHub } from '../services/agent-chat/idempotency.js';
import { StallDetector } from '../services/agent-chat/stall-detector.js';
import { resolveFallbackModel } from '../services/agent-chat/fallback-model.js';
import { agentChatQueue, QueueFullError } from '../services/agent-chat/queue.js';
import type { RecordedRunEvent } from '../services/agent-chat/types.js';
import { runEventToChatFrame } from '../services/agent-chat/run-events.js';
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

/**
 * Avatar style stored as JSON on the agent row, parsed for the client.
 * Tahap 17: `{ shirt, character }` — `character` must be a committed model id
 * (single list in @hermes-office/shared/characters.ts), anything else is
 * dropped. A stale Tahap 9 `accessory` key is dropped too, so clients only
 * ever see fields that still exist.
 */
function parseAvatarStyle(
  raw: string | null | undefined
): { shirt?: string; character?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { shirt?: unknown; character?: unknown };
    const style: { shirt?: string; character?: string } = {};
    if (typeof parsed.shirt === 'string') style.shirt = parsed.shirt;
    if (isCharacterModelId(parsed.character)) style.character = parsed.character;
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

/**
 * Tahap 17 — validate + serialize the avatar style before it touches the row.
 * `shirt` must be a hex colour, `character` must be a committed model id;
 * every other key is discarded, so an unknown id can never reach SQL.
 */
function encodeAvatarStyle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  const raw = value as { shirt?: unknown; character?: unknown };
  const style: { shirt?: string; character?: string } = {};
  if (typeof raw.shirt === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.shirt)) {
    style.shirt = raw.shirt;
  }
  if (isCharacterModelId(raw.character)) {
    style.character = raw.character;
  }
  return Object.keys(style).length > 0 ? JSON.stringify(style) : null;
}

/* ==========================================================================
 * Tahap 11 (bagian 2) — toggle skill aktif per agen (layer SOUL).
 * ========================================================================== */

/**
 * Bentuk tubuh PATCH /api/agents/:id/skills: daftar LENGKAP skill yang aktif
 * untuk agen itu. Server menyimpan komplemennya (skill yang dimatikan) di
 * tabel `agent_skills` — lihat komentar migrasi 008_agent_skills.sql.
 */
const AgentSkillsPatchSchema = z.object({
  skills: z.array(z.string().min(1).max(80)).max(500),
});

/** Isi respons GET/PATCH /api/agents/:id/skills (juga dipakai UI sebagai state). */
interface AgentSkillScope {
  agent_id: string;
  is_system: boolean;
  /** Katalog gateway apa adanya — bukan daftar karangan aplikasi. */
  catalog: { name: string; description: string }[];
  /** Skill yang AKTIF untuk agen ini (katalog dikurangi baris yang dimatikan). */
  skills: string[];
  /** Skill yang dimatikan pemilik (baris tabel agent_skills). */
  disabled: string[];
  /** default = tanpa baris = seluruh katalog aktif; restricted = ada pembatasan. */
  mode: 'default' | 'restricted';
  available: boolean;
  error: string | null;
}

/**
 * Susun cakupan satu agen: katalog gateway (apa adanya dari /v1/skills)
 * dikurangi baris `agent_skills`. TANPA BARIS = semua skill katalog aktif,
 * jadi agen baru / skill baru selalu ikut aktif tanpa seeding.
 */
function buildSkillScope(
  agent: Agent,
  disabled: string[],
  catalog: GatewayCatalog
): AgentSkillScope {
  const off = new Set(disabled.map((n) => n.toLowerCase()));
  const presentDisabled = disabled.filter((n) =>
    catalog.names.some((c) => c.toLowerCase() === n.toLowerCase())
  );
  return {
    agent_id: agent.id,
    is_system: Boolean(agent.is_system),
    catalog: catalog.skills.map((s) => ({ name: s.name, description: s.description })),
    skills: catalog.names.filter((n) => !off.has(n.toLowerCase())),
    disabled: presentDisabled,
    mode: presentDisabled.length > 0 ? 'restricted' : 'default',
    available: catalog.ok,
    error: catalog.error,
  };
}

/**
 * Instruksi cakupan untuk giliran chat. Hanya agen yang punya pembatasan yang
 * membaca katalog (dari cache 60 detik) — jalur bawaan tidak menambah panggilan
 * gateway apa pun.
 */
async function readSkillScopeDirective(
  repo: AgentSkillRepository,
  agent: Agent
): Promise<string | null> {
  const disabled = repo.listDisabled(agent.id);
  if (disabled.length === 0) return null;
  const catalog = await readGatewayCatalogCached();
  const off = new Set(disabled.map((n) => n.toLowerCase()));
  const enabled = catalog.names.filter((n) => !off.has(n.toLowerCase()));
  return buildSkillScopeDirective(catalog.ok ? enabled : null, disabled);
}

/**
 * Sematkan instruksi cakupan pada isi pesan keluar. Jalur sesi gateway hanya
 * menerima field pesan (tidak ada role system), jadi instruksi ikut di pesan
 * teks; bila riwayat dibaca kembali, stripSkillScope mengembalikan pesan
 * milik pemilik persis seperti semula.
 */
function applyScopeToContent<T>(content: T, directive: string | null): T {
  if (!directive) return content;
  if (typeof content === 'string') return applySkillScope(content, directive) as T;
  if (Array.isArray(content)) {
    const parts = (content as { type?: string; text?: string; image_url?: unknown }[]).map(
      (part) => ({ ...part })
    );
    const firstText = parts.find((p) => p?.type === 'text' && typeof p.text === 'string');
    if (firstText?.text) firstText.text = applySkillScope(firstText.text, directive);
    return parts as T;
  }
  return content;
}

/**
 * Fase 2b — baca riwayat peristiwa dari database (retensi 14 hari, tahan restart).
 */
function getRunEventsFromDb(
  db: BetterSqlite3.Database,
  runId: string,
  agentId: string
): RecordedRunEvent[] {
  try {
    const rows = db
      .prepare(
        "SELECT type, payload_json, ts FROM run_events WHERE run_id = ? AND agent_id = ? AND type != 'run.started' ORDER BY id ASC"
      )
      .all(runId, agentId) as { type: string; payload_json: string; ts: number }[];

    return rows.map((r, i) => {
      let data: unknown = {};
      try {
        data = JSON.parse(r.payload_json);
      } catch {
        data = {};
      }
      return {
        seq: i + 1,
        event: r.type,
        data,
        ts: r.ts,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fase 2b — verifikasi kepemilikan run: cek hub memori dulu, lalu cek tabel database.
 * Mencegah run milik agen lain bocor (404) sekaligus mengenali run setelah restart.
 */
function runBelongsToAgent(
  db: BetterSqlite3.Database,
  runId: string,
  agentId: string
): boolean {
  if (chatRunHub.agentOf(runId) === agentId) return true;
  try {
    const row = db
      .prepare('SELECT agent_id FROM run_events WHERE run_id = ? LIMIT 1')
      .get(runId) as { agent_id: string } | undefined;
    return row?.agent_id === agentId;
  } catch {
    return false;
  }
}

/**
 * Fase 2d — cari run_id berdasarkan client_message_id dari database.
 * Memungkinkan idempotensi tetap bekerja meskipun server baru saja di-restart.
 */
function findRunByClientMessageIdFromDb(
  db: BetterSqlite3.Database,
  agentId: string,
  clientMessageId: string
): string | null {
  try {
    const row = db
      .prepare(
        "SELECT run_id FROM run_events WHERE agent_id = ? AND type = 'run.started' AND json_extract(payload_json, '$.client_message_id') = ? LIMIT 1"
      )
      .get(agentId, clientMessageId) as { run_id: string } | undefined;
    return row?.run_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fase 2b — sambungkan klien ke run (live maupun dari database setelah restart).
 *
 * Urutan yang menjaga integritas:
 * 1. Baca riwayat dari database (tahan restart & retensi 14 hari) atau hub memori.
 * 2. Putar ulang event di atas afterSeq ke klien.
 * 3. Jika terminal (selesai / gagal / batal), akhiri stream tanpa menggantung.
 * 4. Jika masih hidup di hub, langganan event baru secara live.
 */
async function attachToLiveRun(
  db: BetterSqlite3.Database,
  agentId: string,
  runId: string,
  reply: { raw: { write: (s: string) => void; writableEnded: boolean; destroyed?: boolean } },
  writeEvent: (s: string) => void,
  afterSeq = 0
): Promise<void> {
  const dbEvents = getRunEventsFromDb(db, runId, agentId);
  const hubEvents = chatRunHub.history(runId);
  // Bila run masih live di hub memori, gunakan urutan hub agar penomoran seq sinkron dengan subscribe().
  // Bila hub kosong / tidak live (misal setelah restart), gunakan riwayat database.
  const history = chatRunHub.isLive(runId) && hubEvents.length > 0 ? hubEvents : (dbEvents.length > 0 ? dbEvents : hubEvents);

  for (const event of history) {
    if (event.seq > afterSeq) writeSseEvent(writeEvent, event);
  }
  const lastSeq = Math.max(afterSeq, history[history.length - 1]?.seq ?? 0);
  if (history.some((e) => isTerminalEvent(e.event))) {
    // Pastikan frame [DONE] terkirim jika belum tertulis
    if (history[history.length - 1]?.event === 'run.completed' && afterSeq >= lastSeq) {
      reply.raw.write('data: [DONE]\n\n');
    }
    return;
  }

  if (chatRunHub.isLive(runId)) {
    const socket = reply.raw as unknown as {
      on?: (ev: string, fn: () => void) => void;
      writableEnded: boolean;
      destroyed: boolean;
    };
    const closed = () => socket.writableEnded || socket.destroyed;

    await new Promise<void>((resolve) => {
      let done = false;
      let unsubscribe = () => {};
      const finish = () => {
        if (!done) {
          done = true;
          unsubscribe();
          resolve();
        }
      };

      unsubscribe = chatRunHub.subscribe(
        runId,
        lastSeq,
        (event) => {
          writeSseEvent(writeEvent, event);
          if (isTerminalEvent(event.event)) {
            finish();
          }
        }
      );

      if (closed()) {
        finish();
        return;
      }

      socket.on?.('close', finish);
    });
  } else {
    // Tidak live di hub dan tidak ada terminal event (misal server restart di tengah jalan)
    reply.raw.write('data: [DONE]\n\n');
  }
}

function isTerminalEvent(event: string): boolean {
  return event === 'run.completed' || event === 'run.failed' || event === 'run.cancelled' || event === 'run.interrupted';
}

function writeSseEvent(writeEvent: (s: string) => void, event: RecordedRunEvent): void {
  const frame = runEventToChatFrame(event.event, event.data);
  if (!frame) return;
  if (frame.kind === 'content') {
    writeEvent(`data: ${JSON.stringify({ choices: [{ delta: { content: frame.text } }] })}\n\n`);
  } else if (frame.kind === 'done') {
    writeEvent('data: [DONE]\n\n');
  } else if (frame.kind === 'status') {
    writeEvent(`data: ${JSON.stringify({ status: frame.status, message: frame.message })}\n\n`);
  } else {
    writeEvent(`data: ${JSON.stringify({ error: 'run_failed', message: frame.message })}\n\n`);
  }
}

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // F-09: Typed decorations — no cast needed with types/fastify.d.ts augmentation
  const { db, dispatcher } = fastify;
  const agentRepo = new AgentRepository(db);
  const auditRepo = new AuditRepository(db);
  const settingRepo = new SettingRepository(db);
  // Tahap 11 (bagian 2) — cakupan skill per agen (layer SOUL).
  const agentSkillRepo = new AgentSkillRepository(db);

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
   * Tahap 11 (bagian 2) — cakupan skill satu agen (layer SOUL).
   *
   * `skills` = daftar skill yang AKTIF untuk agen ini, dihitung dari katalog
   * gateway dikurangi baris `agent_skills`. Agen tanpa baris = seluruh katalog
   * aktif (bawaan, tidak ada data yang di-seed).
   * Katalog tidak bisa dibaca tetap membalas 200 dengan `available:false` +
   * galat gateway apa adanya — sama jujurnya dengan GET /api/skills.
   */
  fastify.get<{ Params: { id: string } }>('/api/agents/:id/skills', async (request, reply) => {
    const agent = agentRepo.getById(request.params.id);
    if (!agent) {
      return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
    }
    const catalog = await readGatewayCatalog();
    return buildSkillScope(agent, agentSkillRepo.listDisabled(agent.id), catalog);
  });

  /**
   * Tahap 11 (bagian 2) — simpan cakupan skill satu agen.
   *
   * Guardrail (guardrail yang sama dengan POST /api/skills/install):
   *  - tubuh wajib `{ skills: string[] }` (zod)                    → 400 invalid_input
   *  - nama wajib ADA di katalog gateway saat ini                   → 400 unknown_skill
   *    (pelanggarnya disebut satu per satu, bukan cuma "ada yang salah")
   *  - katalog tidak bisa dibaca                                    → 503 catalog_unavailable
   *    (tanpa katalog mustahil memvalidasi nama — menulis buta = berpura-pura)
   *  - agen sistem tidak bisa diubah                                → 403 system_agent
   *    (sama dengan guardrail hapus/nonaktifkan agen sistem)
   * Aksi sukses dicatat ke audit sebagai `agent.skills_updated`.
   */
  fastify.patch<{ Params: { id: string } }>(
    '/api/agents/:id/skills',
    async (request, reply) => {
      const { id } = request.params;
      const agent = agentRepo.getById(id);
      if (!agent) {
        return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
      }
      if (agent.is_system) {
        return reply.code(403).send({
          error: 'system_agent',
          message: 'Agen sistem orkestrator tidak dapat diubah cakupan skill-nya.',
        });
      }

      const parsed = AgentSkillsPatchSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', details: parsed.error.format() });
      }

      const catalog = await readGatewayCatalog();
      if (!catalog.ok) {
        return reply.code(503).send({
          error: 'catalog_unavailable',
          message: `Katalog skill gateway tidak bisa dibaca: ${catalog.error || 'tanpa keterangan'}`,
        });
      }

      const byLower = new Map(catalog.names.map((n) => [n.toLowerCase(), n]));
      const unknown: string[] = [];
      const enabled = new Set<string>();
      for (const raw of parsed.data.skills) {
        const canonical = byLower.get(raw.trim().toLowerCase());
        if (!canonical) unknown.push(raw);
        else enabled.add(canonical);
      }
      if (unknown.length > 0) {
        return reply.code(400).send({
          error: 'unknown_skill',
          message: `Nama skill di luar katalog gateway: ${unknown.join(', ')}.`,
          unknown,
          catalog_size: catalog.names.length,
        });
      }

      // Disimpan sebagai COMPLEMENT: baris = skill yang dimatikan pemilik,
      // bukan daftar skill aktif (lihat 008_agent_skills.sql — tanpa baris =
      // semua skill katalog aktif, jadi tidak ada data yang perlu di-seed).
      const disabled = catalog.names.filter((n) => !enabled.has(n));
      invalidateGatewayCatalogCache();
      agentSkillRepo.replaceDisabled(id, disabled);

      auditRepo.logAction(
        request.user!.id,
        'agent.skills_updated',
        id,
        JSON.stringify({
          mode: disabled.length > 0 ? 'restricted' : 'default',
          enabled: [...enabled].sort(),
          disabled: [...disabled].sort(),
          catalog_total: catalog.names.length,
        })
      );

      return buildSkillScope(agent, agentSkillRepo.listDisabled(id), await readGatewayCatalog());
    }
  );

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

      // Fase 2b / 2c — periksa apakah ini penyambungan ulang ke run yang sudah ada
      const requestedRun = request.headers['x-run-id'];
      const isReattach =
        typeof requestedRun === 'string' &&
        (chatRunHub.has(requestedRun) || runBelongsToAgent(db, requestedRun, agent.id));

      // Fase 2d — client_message_id wajib disertakan untuk giliran baru (idempotensi)
      const clientMessageId =
        (request.body as { client_message_id?: string })?.client_message_id ||
        (request.headers['x-client-message-id'] as string | undefined);

      if (!isReattach && (!clientMessageId || typeof clientMessageId !== 'string' || !clientMessageId.trim())) {
        return reply.code(400).send({
          error: 'invalid_input',
          message: 'client_message_id is required',
        });
      }

      // Fase 2d — request duplikat dengan client_message_id yang sama diabaikan (mengembalikan stream yang sama)
      if (!isReattach && clientMessageId) {
        const existingTurn = chatIdempotencyHub.get(agent.id, clientMessageId);
        let existingRunId = existingTurn?.runId ?? null;
        if (!existingRunId && existingTurn) {
          // Menunggu run_id jika request pertama masih dalam antrian atau baru mulai
          existingRunId = await existingTurn.runIdPromise;
        }
        if (!existingRunId) {
          existingRunId = findRunByClientMessageIdFromDb(db, agent.id, clientMessageId);
        }
        if (existingRunId) {
          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          const writeEvent = (payload: string) => {
            if (reply.raw.writableEnded || reply.raw.destroyed) return;
            reply.raw.write(payload);
          };
          const stopHeartbeat = startHeartbeat(fastify.chatHeartbeatMs, writeEvent);
          try {
            await attachToLiveRun(db, agent.id, existingRunId, reply, writeEvent, 0);
          } finally {
            stopHeartbeat();
            reply.raw.end();
          }
          return;
        }

        // Daftarkan giliran baru ke hub idempotensi
        chatIdempotencyHub.register(agent.id, clientMessageId);
      }

      // Fase 2c — tolak 429 jika antrian pesan untuk agen ini sudah mencapai batas (5 pesan)
      if (!isReattach && agentChatQueue.getPendingCount(agent.id) >= 5) {
        if (clientMessageId) chatIdempotencyHub.remove(agent.id, clientMessageId);
        return reply.code(429).send({
          error: 'queue_full',
          message: 'Antrian pesan agen penuh (maksimal 5 pesan). Tunggu hingga giliran sebelumnya selesai.',
        });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const client = getHermesClientForAgent(agent, db);
      // Tahap 19 — klien sudah tidak diam pada stream kosong, dan socket ini
      // pun dicek sebelum menulis agar koneksi mati tidak membuat handler meledak.
      const writeEvent = (payload: string) => {
        if (reply.raw.writableEnded || reply.raw.destroyed) return;
        reply.raw.write(payload);
      };
      // Fase 2a — detak: Cloudflare memutus koneksi idle di ~100 detik, dan
      // menunggu tool bisa jauh lebih lama. Frame komentar `: hb` membuat
      // koneksi tetap terlihat aktif tanpa mengganggu klien yang membaca stream.
      const stopHeartbeat = startHeartbeat(fastify.chatHeartbeatMs, writeEvent);
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      // Tahap 11 — layer SOUL: daftar skill aktif agen ikut dalam giliran ini.
      const scopeDirective = await readSkillScopeDirective(agentSkillRepo, agent);
      // Fase 1 — jembatan identitas: nama, peran, dan ruang kerja agen ikut
      // dalam giliran ini, supaya gateway tidak pernah menebak siapa yang
      // sedang menjawab. Hanya identitas yang lewat `system_message`: instruksi
      // cakupan skill tetap menempel di pesan sesi seperti Tahap 11, karena
      // stripSkillScope membersihkannya dari riwayat yang dibaca kembali.
      const identityPrompt = buildAgentIdentity(agent) || undefined;
      try {
        if (isReattach) {
          await attachToLiveRun(db, agent.id, requestedRun as string, reply, writeEvent, 0);
        } else {
          // Fase 2c — antrian per agen: 1 run aktif, sisanya FIFO, maks 5 antrian
          await agentChatQueue.enqueue(agent.id, async () => {
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

              const input = applyScopeToContent(lastUser?.content || JSON.stringify(messages), scopeDirective);
              let activeRunId: string | null = null;
              let currentModel = agent.model || undefined;
              let retried = false;
              let currentAbortController = new AbortController();

              // Fase 2d — deteksi stall: jika 45s tanpa event dari gateway,
              // kirim status "agen sedang menjalankan tool", lalu retry sekali dengan fallback model.
              const stallDetector = new StallDetector(fastify.chatStallMs, async () => {
                writeEvent(
                  `data: ${JSON.stringify({
                    status: 'tool_running',
                    message: 'agen sedang menjalankan tool',
                  })}\n\n`
                );
                if (activeRunId) {
                  chatRunHub.append(activeRunId, 'run.status', {
                    status: 'tool_running',
                    message: 'agen sedang menjalankan tool',
                  });
                  try {
                    db.prepare(
                      'INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)'
                    ).run(
                      activeRunId,
                      agent.id,
                      'run.status',
                      JSON.stringify({
                        status: 'tool_running',
                        message: 'agen sedang menjalankan tool',
                      }),
                      Date.now()
                    );
                  } catch {}
                  client.stopRun(activeRunId).catch(() => {});
                }
                currentAbortController.abort('stalled');
              });

              stallDetector.start();

              const executeRun = async (modelToUse: string | undefined): Promise<void> => {
                let runsApiStarted = false;
                try {
                  await client.runChatStream(
                    {
                      input,
                      sessionId,
                      instructions: identityPrompt,
                      model: modelToUse,
                      signal: currentAbortController.signal,
                    },
                    {
                      onRunId: (assignedRunId) => {
                        activeRunId = assignedRunId;
                        runsApiStarted = true;
                        stallDetector.recordActivity();
                        if (clientMessageId) {
                          chatIdempotencyHub.setRunId(agent.id, clientMessageId, assignedRunId);
                        }
                        // Fase 2b — daftarkan ke hub agar sambung-ulang menemukan run ini
                        chatRunHub.start(assignedRunId, agent.id);
                        // Fase 2b — kirim run_id ke klien sebagai frame pertama
                        writeEvent(`data: ${JSON.stringify({ run_id: assignedRunId })}\n\n`);
                        if (clientMessageId) {
                          try {
                            db.prepare(
                              'INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)'
                            ).run(
                              assignedRunId,
                              agent.id,
                              'run.started',
                              JSON.stringify({ client_message_id: clientMessageId }),
                              Date.now()
                            );
                          } catch {}
                        }
                      },
                      onDelta: (delta) => {
                        stallDetector.recordActivity();
                        if (activeRunId) {
                          const data = { delta };
                          chatRunHub.append(activeRunId, 'message.delta', data);
                          try {
                            db.prepare(
                              'INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)'
                            ).run(activeRunId, agent.id, 'message.delta', JSON.stringify(data), Date.now());
                          } catch {}
                        }
                        writeEvent(
                          `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`
                        );
                      },
                      onDone: () => {
                        stallDetector.stop();
                        if (activeRunId) {
                          chatRunHub.append(activeRunId, 'run.completed', {});
                          chatRunHub.finish(activeRunId);
                          try {
                            db.prepare(
                              'INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)'
                            ).run(activeRunId, agent.id, 'run.completed', '{}', Date.now());
                          } catch {}
                        }
                        reply.raw.write('data: [DONE]\n\n');
                      },
                      onError: (why) => {
                        stallDetector.stop();
                        if (activeRunId) {
                          const data = { error: why };
                          chatRunHub.append(activeRunId, 'run.failed', data);
                          chatRunHub.finish(activeRunId);
                          try {
                            db.prepare(
                              'INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)'
                            ).run(activeRunId, agent.id, 'run.failed', JSON.stringify(data), Date.now());
                          } catch {}
                        }
                        writeEvent(
                          `data: ${JSON.stringify({ error: 'run_failed', message: why })}\n\n`
                        );
                      },
                    }
                  );
                  if (currentAbortController.signal.aborted && !retried) {
                    throw new Error('stalled');
                  }
                } catch (runErr) {
                  if (currentAbortController.signal.aborted && !retried) {
                    retried = true;
                    const fallback = await resolveFallbackModel(client, modelToUse, fastify.chatFallbackModel);
                    currentModel = fallback;
                    currentAbortController = new AbortController();
                    stallDetector.start();
                    return executeRun(fallback);
                  }

                  if (!runsApiStarted) {
                    // Fase 2b — fallback ke sessionChatStream bila runChatStream gagal di awal
                    await client.sessionChatStream(
                      sessionId,
                      input,
                      (chunk) => {
                        writeEvent(
                          `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`
                        );
                      },
                      modelToUse,
                      identityPrompt
                    );
                    reply.raw.write('data: [DONE]\n\n');
                  } else {
                    throw runErr;
                  }
                }
              };

              try {
                await executeRun(currentModel);
              } finally {
                stallDetector.stop();
                if (!activeRunId && clientMessageId) {
                  chatIdempotencyHub.remove(agent.id, clientMessageId);
                }
              }
            } else {
              // Jalur tanpa sesi memakai role 'system' yang asli — riwayat tidak
              // tersentuh. Fase 1: identitas jadi pesan system pertama, instruksi
              // cakupan skill menyusul sebagai system terpisah supaya keduanya
              // tetap terbaca berurutan oleh model.
              const statelessSystem = [
                identityPrompt,
                scopeDirective,
              ].filter((part): part is string => Boolean(part && part.trim()));
              await client.chatStream(
                statelessSystem.length
                  ? [
                      ...statelessSystem.map((content) => ({ role: 'system' as const, content })),
                      ...messages,
                    ]
                  : messages,
                (chunk) => {
                  writeEvent(chunk);
                },
                agent.model || undefined
              );
            }
          });
        }
      } catch (err) {
        if (err instanceof QueueFullError) {
          writeEvent(`data: ${JSON.stringify({ error: 'queue_full', message: err.message })}\n\n`);
        } else {
          // Surface a real error frame instead of a silently truncated stream
          reply.raw.write(
            `data: ${JSON.stringify({
              error: 'gateway_error',
              message: String((err as Error)?.message || err),
            })}\n\n`
          );
        }
      } finally {
        // Fase 2a — detak WAJIB berhenti di sini: tanpa blok ini interval
        // tertinggal hidup dan menulis ke socket yang sudah ditutup.
        stopHeartbeat();
      }

      reply.raw.end();
    }
  );

  /**
   * Fase 2b — sambungkan ulang ke run yang masih berjalan.
   *
   * Tujuannya satu: menutup panel di tengah jalan tidak membuang balasan.
   * Riwayat peristiwa diputar ulang dari awal, lalu aliran dilanjutkan. `seq`
   * dari klien menentukan titik lanjut: peristiwa sesudahnya dikirim dari
   * papan, dan peristiwa sebelumnya tidak dikirim ulang.
   *
   * Run milik agen yang BUKAN pemiliknya tidak pernah terlihat — pemilik run
   * dicek dulu sebelum apa pun ditulis.
   */
  fastify.get<{ Params: { id: string; runId: string }; Querystring: { seq?: string } }>(
    '/api/agents/:id/runs/:runId/stream',
    async (request, reply) => {
      const { id, runId } = request.params;
      const agent = agentRepo.getById(id);
      if (!agent) {
        return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
      }
      if (!runBelongsToAgent(db, runId, agent.id)) {
        return reply.code(404).send({ error: 'not_found', message: 'Run not found' });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const writeEvent = (payload: string) => {
        if (reply.raw.writableEnded || reply.raw.destroyed) return;
        reply.raw.write(payload);
      };
      const stopHeartbeat = startHeartbeat(fastify.chatHeartbeatMs, writeEvent);

      const requestedSeq = Number.parseInt(request.query.seq || '0', 10);
      const afterSeq = Number.isFinite(requestedSeq) && requestedSeq > 0 ? requestedSeq : 0;
      try {
        await attachToLiveRun(db, agent.id, runId, reply, writeEvent, afterSeq);
      } catch (err) {
        writeEvent(
          `data: ${JSON.stringify({
            error: 'gateway_error',
            message: String((err as Error)?.message || err),
          })}\n\n`
        );
      } finally {
        stopHeartbeat();
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
            // Tahap 11 — garis cakupan skill yang ditambahkan aplikasi ikut
            // terkirim ke gateway; saat riwayat dibaca, pesan milik pemilik
            // dikembalikan persis seperti yang ia ketik.
            content: stripSkillScope(m.content),
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
    // Tahap 11 — cakupan skill ikut dibersihkan (jaring pengaman bila
    // PRAGMA foreign_keys mati; ON DELETE CASCADE tetap didefinisikan di 008).
    const skillRowsRemoved = agentSkillRepo.deleteForAgent(id);
    const removed = agentRepo.delete(id);

    auditRepo.logAction(
      request.user!.id,
      'agent.delete',
      id,
      JSON.stringify({
        name: agent.name,
        tasks_removed: tasksRemoved,
        skill_rows_removed: skillRowsRemoved,
        had_session: Boolean(agent.session_id),
      })
    );

    return { success: removed > 0, id, tasks_removed: tasksRemoved };
  });
};
