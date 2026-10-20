import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { TaskSchema } from '@hermes-office/shared';
import type { Task } from '@hermes-office/shared';
import { getServerHermesClient } from '../services/hermes/index.js';
// Tahap 11 — katalog gateway dipakai bersama oleh toggle skill per agen
// (routes/agents.ts) supaya guardrail "nama harus dari katalog" satu sumber.
import { normalizeSkill, readGatewayCatalog, invalidateGatewayCatalogCache } from '../services/skill-catalog.js';
import { checkSkillSyncStatus, syncSkills } from '../services/hermes/skill-sync.js';
import { TaskRepository } from '../db/repositories/tasks.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { config } from '../config.js';

/**
 * Tahap 11 — instal/hapus skill lewat orkestrator (keputusan 7.11).
 * Gateway tidak punya REST install/uninstall, jadi permintaan pemilik
 * diterjemahkan jadi satu baris tugas untuk agen sistem `agent_orchestrator`
 * dan dijalankan lewat pipeline task/run yang sama dengan
 * POST /api/tasks/:id/run. Hasil & progres tampil di layar Tugas.
 */
const SKILL_SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const ORCHESTRATOR_ID = 'agent_orchestrator';

type SkillAction = 'install' | 'uninstall';

interface InstalledSkills {
  names: string[];
  /** false bila gateway tak bisa mendaftar skill — pemeriksaan duplikat dilewati. */
  ok: boolean;
}

interface SkillTaskRequest {
  action: SkillAction;
  name: string;
  userId: number;
  installed: InstalledSkills;
}

/**
 * Tahap 8 — layar Skills/Kemampuan.
 *
 * Data diambil apa adanya dari gateway:
 * - `skills`  : daftar skill yang terpasang di gateway (/v1/skills).
 * - kalau gateway tidak bisa mendaftar skill, respons tetap 200 dengan
 *   `available: false` + pesan galat sebenarnya dan dokumen capabilities
 *   (features/endpoint nyata) supaya layar tidak pernah menampilkan data karangan.
 */
export const skillRoutes: FastifyPluginAsync = async (fastify) => {
  const { db } = fastify;
  const taskRepo = new TaskRepository(db);
  const auditRepo = new AuditRepository(db);

  fastify.get('/api/skills', async () => {
    const client = getServerHermesClient();

    try {
      const skills = await client.listSkills();
      const capabilities = await client.capabilities().catch(() => null);
      return {
        available: true,
        gateway: config.HERMES_BASE_URL,
        skills: skills.map((s) => normalizeSkill(s)),
        capabilities,
        error: null,
      };
    } catch (err) {
      const capabilities = await client.capabilities().catch(() => null);
      return {
        available: false,
        gateway: config.HERMES_BASE_URL,
        skills: [],
        capabilities,
        error: String((err as Error)?.message || err),
      };
    }
  });

  /**
   * Tahap 11 — minta orkestrator menginstal skill dari katalog.
   * Guardrail: nama wajib slug (400), skill terpasang sudah cukup (409).
   */
  fastify.post('/api/skills/install', async (request, reply) => {
    const name = readName(request.body);
    if (!SKILL_SLUG.test(name)) return rejectSlug(reply);

    const installed = await readInstalledSkills();
    if (installed.names.some((n) => n.toLowerCase() === name.toLowerCase())) {
      return reply.code(409).send({
        error: 'skill_already_installed',
        message: `Skill '${name}' sudah terpasang di gateway.`,
      });
    }

    return queueSkillTask(fastify, taskRepo, auditRepo, reply, {
      action: 'install',
      name,
      userId: request.user!.id,
      installed,
    });
  });

  /**
   * Tahap 11 — minta orkestrator menghapus skill terpasang.
   * Guardrail: nama wajib slug (400), skill harus terpasang (404).
   */
  fastify.post('/api/skills/uninstall', async (request, reply) => {
    const name = readName(request.body);
    if (!SKILL_SLUG.test(name)) return rejectSlug(reply);

    const installed = await readInstalledSkills();
    if (!installed.names.some((n) => n.toLowerCase() === name.toLowerCase())) {
      return reply.code(404).send({
        error: 'skill_not_installed',
        message: `Skill '${name}' tidak terpasang di gateway.`,
      });
    }

    return queueSkillTask(fastify, taskRepo, auditRepo, reply, {
      action: 'uninstall',
      name,
      userId: request.user!.id,
      installed,
    });
  });

  /**
   * Fase 6 — periksa status sinkronisasi katalog skill repo vs gateway.
   */
  fastify.get('/api/skills/sync/status', async () => {
    return checkSkillSyncStatus();
  });

  /**
   * Fase 6 — sinkronisasikan dan auto-install skill repo yang belum terpasang.
   */
  fastify.post('/api/skills/sync', async (request) => {
    const body = (request.body || {}) as { force?: boolean };
    const result = await syncSkills({
      db: fastify.db,
      userId: request.user!.id,
      force: !!body.force,
    });
    invalidateGatewayCatalogCache();
    return result;
  });
};

function readName(body: unknown): string {
  const raw = (body || {}) as Record<string, unknown>;
  return typeof raw.name === 'string' ? raw.name.trim() : '';
}

function rejectSlug(reply: FastifyReply) {
  return reply.code(400).send({
    error: 'invalid_input',
    message: "Nama skill harus slug huruf kecil (a-z, 0-9, tanda hubung), contoh 'pdf-skill'.",
  });
}

/** Nama skill yang benar-benar terpasang di gateway (katalog bersama). */
async function readInstalledSkills(): Promise<InstalledSkills> {
  const catalog = await readGatewayCatalog();
  return { names: catalog.names, ok: catalog.ok };
}

/**
 * Bangun baris tugas untuk orkestrator, catat ke audit, jalankan lewat
 * pipeline task/run yang sama dengan POST /api/tasks/:id/run (auto-run),
 * lalu balas 201. Permintaan pemilik tetap diterima walau gateway gagal
 * dihubungi — status tugasnya yang mencatat kegagalan itu apa adanya.
 */
async function queueSkillTask(
  fastify: FastifyInstance,
  taskRepo: TaskRepository,
  auditRepo: AuditRepository,
  reply: FastifyReply,
  req: SkillTaskRequest
): Promise<FastifyReply> {
  const now = Date.now();
  const parsed = TaskSchema.safeParse({
    id: `task_${req.action}_${now}_${Math.random().toString(36).substring(2, 6)}`,
    title: req.action === 'install' ? `Instal skill: ${req.name}` : `Hapus skill: ${req.name}`,
    description: skillInstruction(req.action, req.name),
    agent_id: ORCHESTRATOR_ID,
    priority: 'normal',
    status: 'queued',
    run_id: null,
    result_md: null,
    due_at: null,
    created_by: req.userId,
    created_at: now,
    updated_at: now,
  });

  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_input', details: parsed.error.format() });
  }

  const task = parsed.data;
  taskRepo.create(task);
  auditRepo.logAction(
    req.userId,
    req.action === 'install' ? 'skill.install_request' : 'skill.uninstall_request',
    req.name,
    JSON.stringify({
      task_id: task.id,
      skill: req.name,
      installed_check: req.installed.ok ? 'verified' : 'unavailable',
    })
  );

  let run_id: string | null = null;
  try {
    const res = await fastify.dispatcher.runTask(task.id);
    run_id = res.run_id;
    auditRepo.logAction(
      req.userId,
      'task.run',
      task.id,
      JSON.stringify({ run_id, via: `skill_${req.action}` })
    );
  } catch (err: unknown) {
    const error = err as { message?: string };
    auditRepo.logAction(
      req.userId,
      'task.run_failed',
      task.id,
      JSON.stringify({ error: error?.message || String(err), via: `skill_${req.action}` })
    );
  }

  const current = taskRepo.getById(task.id);
  return reply.code(201).send({
    task: current ?? task,
    status: current?.status ?? (run_id ? 'running' : 'failed'),
    run_id: current?.run_id ?? run_id,
  });
}

/** Instruksi eksplisit untuk orkestrator — tidak boleh menyimpang ke skill lain. */
function skillInstruction(action: SkillAction, name: string): string {
  if (action === 'install') {
    return [
      `PERINTAH PEMILIK: instal skill '${name}' dari katalog.`,
      `1. Gunakan tool manage_catalog untuk mencari '${name}' di katalog dan menginstalnya.`,
      `2. Instal PERSIS skill '${name}'. JANGAN menginstal skill lain apa pun dan jangan menyentuh skill yang sudah terpasang.`,
      `3. Bila '${name}' tidak ada di katalog, jangan diganti dengan nama mirip: laporkan 'skill tidak ditemukan'.`,
      `4. Tulis hasilnya (berhasil / tidak ditemukan / alasan gagal) di ringkasan tugas ini.`,
    ].join('\n');
  }
  return [
    `PERINTAH PEMILIK: hapus skill '${name}' dari instalasi gateway.`,
    `1. Gunakan tool manage_catalog uninstall (atau skill_manage remove bila itu tool yang tersedia) untuk menghapus PERSIS skill '${name}'.`,
    `2. JANGAN menghapus skill lain apa pun.`,
    `3. Bila '${name}' tidak ditemukan terpasang, laporkan 'skill tidak ditemukan' tanpa menghapus apa pun.`,
    `4. Tulis hasilnya (berhasil / tidak ditemukan / alasan gagal) di ringkasan tugas ini.`,
  ].join('\n');
}

/*
 * normalizeSkill/NORMALIZED SKILL dipindah ke services/skill-catalog.ts
 * (Tahap 11) supaya routes/agents.ts memakai normalisasi & guardrail yang sama.
 */
