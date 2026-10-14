import type { FastifyPluginAsync } from 'fastify';
import type { Project } from '@hermes-office/shared';
import { ProjectRepository } from '../db/repositories/projects.js';
import { AuditRepository } from '../db/repositories/audit.js';

/**
 * Tahap 14 — proyek & DAG (docs/DESIGN_DIRECTION.md §14).
 *
 * Kontrak:
 *  - POST /api/projects        buat proyek (status 'draft'), lalu dekomposisi
 *                              berjalan DI BELAKANG layar lewat orkestrator;
 *                              UI memantau lewat GET (decompose_error tampil
 *                              apa adanya bila pecahan gagal).
 *  - GET  /api/projects        daftar + hitungan subtask.
 *  - GET  /api/projects/:id    satu proyek + subtask (id, status, agent,
 *                              depends_on) untuk render peta DAG.
 *  - POST /api/projects/:id/run jalankan rantai: subtask akar di-auto-run;
 *                              409 bila tidak ada yang siap.
 */
export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  const projectRepo = new ProjectRepository(fastify.db);
  const auditRepo = new AuditRepository(fastify.db);
  const service = fastify.projectService;

  fastify.post('/api/projects', async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
    if (!title) {
      return reply.code(400).send({ error: 'invalid_input', message: 'Judul proyek wajib diisi.' });
    }

    const now = Date.now();
    const project: Project = {
      id: `prj_${now}_${Math.random().toString(36).substring(2, 6)}`,
      title: title.slice(0, 500),
      goal,
      status: 'draft',
      created_by: request.user!.id,
      created_at: now,
      completed_at: null,
      summary: null,
      decompose_error: null,
    };
    projectRepo.create(project);
    auditRepo.logAction(project.created_by, 'project.create', project.id, JSON.stringify({ title: project.title }));

    // Decomposisi sengaja tidak ditunggu di request (bisa >30 dtk). Kegagalannya
    // tersimpan di projects.decompose_error — jujur, bukan subtask karangan.
    void service
      .decompose(project, project.created_by)
      .catch((err: unknown) => {
        auditRepo.logAction(
          project.created_by,
          'project.decompose_failed',
          project.id,
          JSON.stringify({ error: (err as Error)?.message || String(err) })
        );
      });

    return reply.code(201).send({ project });
  });

  fastify.get('/api/projects', async () => {
    return {
      projects: projectRepo.getAll().map((p) => {
        const subs = projectRepo.getTasks(p.id);
        return {
          ...p,
          subtask_total: subs.length,
          subtask_done: subs.filter((t) => t.status === 'done').length,
        };
      }),
    };
  });

  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = projectRepo.getById(id);
    if (!project) return reply.code(404).send({ error: 'project_not_found' });

    return {
      project,
      tasks: projectRepo.getTasks(id).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        agent_id: t.agent_id,
        depends_on: parseDepends(t.depends_on),
        priority: t.priority,
        result_md: t.result_md,
        updated_at: t.updated_at,
      })),
    };
  });

  fastify.post('/api/projects/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = projectRepo.getById(id);
    if (!project) return reply.code(404).send({ error: 'project_not_found' });
    if (project.status === 'done' || project.status === 'failed') {
      return reply.code(409).send({ error: 'project_not_runnable', message: 'Proyek sudah selesai/gagal — buat proyek baru.' });
    }

    const started = await service.runReady(id);
    if (started === 0) {
      return reply
        .code(409)
        .send({ error: 'nothing_ready', message: 'Tidak ada subtask yang siap dijalankan (belum terdekomposisi, atau semua sedang berjalan).' });
    }

    auditRepo.logAction(request.user!.id, 'project.run', id, JSON.stringify({ started }));
    return { project: projectRepo.getById(id), started };
  });
};

function parseDepends(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
