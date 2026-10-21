import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { TaskSchema } from '@hermes-office/shared';
import { TaskRepository } from '../db/repositories/tasks.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { streamManager } from '../services/stream.js';
import { listTaskArtifacts } from '../services/artifacts.js';
import type { Task } from '@hermes-office/shared';

/** Kolom turunan yang boleh ikut di badan PATCH tapi tidak pernah disimpan. */
const DERIVED_TASK_FIELDS = ['artifacts'] as const;

/**
 * Skema PATCH: seluruh field bersifat opsional, nama field harus dikenal
 * (`.strict()`), dan identitas pembuatan dikecualikan. Badan yang berisi nama
 * kolom ngawur kini dibalas 400 — bukan lagi menyusun `UPDATE tasks SET …`
 * dari string pengguna (audit 2026-10-21: kunci `status = 'x', title` berhasil
 * menulis kolom lewat PATCH).
 */
const taskPatchSchema = TaskSchema.partial()
  .omit({ id: true, created_by: true, created_at: true, updated_at: true })
  .extend({
    project_id: z.string().nullable().optional(),
    depends_on: z.string().nullable().optional(),
  })
  .strict();

/** Badan POST yang menerima id buatan klien — harus ditangkap sebelum INSERT. */
const taskCreateIdSchema = z.string().min(1).max(120);

/** Pembatas halaman GET /api/tasks. Default: seluruh data (laku lama). */
const listQuerySchema = z.object({
  source: z.string().optional(),
  agent_id: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** Tahap 7: broadcast every task change so the board is live, not reload-bound. */
function broadcastTask(task: Task): void {
  streamManager.broadcast({
    type: 'task_update',
    agent_id: task.agent_id,
    task: {
      id: task.id,
      status: task.status,
      title: task.title,
      agent_id: task.agent_id,
      result_md: task.result_md,
      updated_at: task.updated_at,
    },
    timestamp: Date.now(),
  });
}

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // F-09: Typed decorations via types/fastify.d.ts
  const { db, dispatcher } = fastify;
  const taskRepo = new TaskRepository(db);
  const auditRepo = new AuditRepository(db);

  /**
   * Daftar task + artefaknya. `artifacts` selalu ada ([] bila kosong) supaya
   * konsumen web bisa merender tombol unduh tanpa endpoint tambahan:
   *   { id, task_id, agent_id, filename, mime, size, created_at, download_url }
   * `download_url` = /api/artifacts/:id/download (butuh auth `tma …` yang sama).
   *
   * `limit`/`offset` opsional: tanpa keduanya perilaku lama dipertahankan
   * (semua baris), pemanggil baru bisa meminta halaman agar papan tidak
   * menarik seluruh riwayat task sekaligus.
   */
  fastify.get<{
    Querystring: { source?: string; agent_id?: string; status?: string; limit?: string; offset?: string };
  }>('/api/tasks', async (request, reply) => {
    const parsedQuery = listQuerySchema.safeParse(request.query || {});
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsedQuery.error.format() });
    }
    const { source, agent_id, status, limit, offset } = parsedQuery.data;

    let tasks = taskRepo.getAll();
    if (source && source !== 'all') {
      tasks = tasks.filter((t) => t.source === source);
    }
    if (agent_id) {
      tasks = tasks.filter((t) => t.agent_id === agent_id);
    }
    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }

    const total = tasks.length;
    if (offset || limit) {
      const start = offset ?? 0;
      tasks = tasks.slice(start, limit ? start + limit : undefined);
    }

    const artifacts = listTaskArtifacts(db, tasks.map((t) => t.id));
    const rows = tasks.map((task) => ({
      ...task,
      artifacts: artifacts.get(task.id) ?? [],
    }));

    if (offset !== undefined || limit !== undefined) {
      return { items: rows, total, limit: limit ?? null, offset: offset ?? 0 };
    }
    return rows;
  });

  fastify.post('/api/tasks', async (request, reply) => {
    const rawBody = (request.body || {}) as Record<string, unknown>;

    // id dari klien dulu jatuh ke INSERT mentah sehingga id ganda menghasilkan
    // 500 SQLITE_CONSTRAINT_PRIMARYKEY. Sekarang: 400 untuk bentuk salah,
    // 409 untuk id yang sudah dipakai — dan task lama tidak tertimpa diam-diam.
    let id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    if (rawBody.id !== undefined && rawBody.id !== null && rawBody.id !== '') {
      const parsedId = taskCreateIdSchema.safeParse(rawBody.id);
      if (!parsedId.success) {
        return reply.code(400).send({ error: 'invalid_input', details: { id: ['Invalid id'] } });
      }
      if (taskRepo.getById(parsedId.data)) {
        return reply.code(409).send({ error: 'id_taken', message: 'Task id sudah dipakai' });
      }
      id = parsedId.data;
    }

    const taskData = {
      id,
      title: rawBody.title,
      description: rawBody.description || '',
      agent_id: rawBody.agent_id,
      priority: rawBody.priority || 'normal',
      status: rawBody.status || 'backlog',
      created_by: request.user!.id,
      created_at: Date.now(),
      updated_at: Date.now(),
      run_id: null,
      result_md: null,
      due_at: rawBody.due_at || null,
    };

    const parseResult = TaskSchema.safeParse(taskData);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parseResult.error.format() });
    }

    const task = parseResult.data;

    // Agen yang tidak ada dulu berakhir 500 FOREIGN KEY constraint failed.
    const agentExists = db.prepare('SELECT id FROM agents WHERE id = ?').get(task.agent_id);
    if (!agentExists) {
      return reply
        .code(400)
        .send({ error: 'invalid_input', details: { agent_id: ['Agen tidak ditemukan'] } });
    }

    taskRepo.create(task);

    auditRepo.logAction(request.user!.id, 'task.create', task.id, JSON.stringify({ title: task.title }));
    broadcastTask(task);

    return reply.code(201).send(task);
  });

  fastify.patch<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = taskRepo.getById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'not_found', message: 'Task not found' });
    }

    const raw = (request.body || {}) as Record<string, unknown>;
    // `artifacts` dihitung ulang dari tabel media — ikut dikirim web ketika
    // ia membalikkan task yang baru diambil, tetapi bukan kolom tersimpan.
    for (const field of DERIVED_TASK_FIELDS) delete raw[field];

    const parsed = taskPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parsed.error.format() });
    }

    const updates = parsed.data;

    // agent_id harus menunjuk agen nyata: dulu melompati validasi dan
    // membentur ke FOREIGN KEY sebagai 500.
    if (updates.agent_id !== undefined && !db.prepare('SELECT id FROM agents WHERE id = ?').get(updates.agent_id)) {
      return reply
        .code(400)
        .send({ error: 'invalid_input', details: { agent_id: ['Agen tidak ditemukan'] } });
    }

    // Menjalankan task yang sudah berhenti dulu meresmikan status 'running'
    // tanpa run — kombinasi yang membuat tombol Stop tak berfungsi. Rute
    // /run-lah yang berhak memindahkan task ke 'running'.
    if (updates.status === 'running' && existing.status !== 'running') {
      return reply.code(409).send({
        error: 'invalid_transition',
        message: 'Jalankan task lewat POST /api/tasks/:id/run',
      });
    }

    taskRepo.update(id, updates);

    auditRepo.logAction(request.user!.id, 'task.update', id, JSON.stringify(updates));
    const updatedTask = taskRepo.getById(id);
    if (updatedTask) broadcastTask(updatedTask);

    return updatedTask;
  });

  /**
   * Hapus task (audit 2026-10-21: sebelumnya `DELETE /api/tasks/:id` → 404,
   * jadi task yang nyangkut di status 'running'/'failed' tidak pernah bisa
   * dibersihkan dari papan).
   */
  fastify.delete<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params;
    const task = taskRepo.getById(id);
    if (!task) {
      return reply.code(404).send({ error: 'not_found', message: 'Task not found' });
    }

    // Task berjalan wajib dihentikan dulu: menghapusnya tanpa memberi tahu
    // gateway membiarkan run menggantung dan menulis event untuk task yang
    // sudah tidak ada.
    if (task.status === 'running' || task.status === 'queued' || task.status === 'needs_approval') {
      const result = await dispatcher.stopTask(id);
      if (!result.ok) {
        return reply.code(409).send({ error: 'stop_failed', message: result.reason });
      }
    }

    taskRepo.deleteById(id);
    auditRepo.logAction(request.user!.id, 'task.delete', id, JSON.stringify({ title: task.title }));

    streamManager.broadcast({
      type: 'task_deleted',
      agent_id: task.agent_id,
      task: { id: task.id, status: 'deleted', title: task.title, agent_id: task.agent_id, result_md: null, updated_at: Date.now() },
      timestamp: Date.now(),
    });

    return { ok: true, id };
  });

  fastify.post<{ Params: { id: string } }>('/api/tasks/:id/run', async (request, reply) => {
    const { id } = request.params;
    const task = taskRepo.getById(id);
    if (!task) {
      return reply.code(404).send({ error: 'not_found', message: 'Task not found' });
    }

    // Mencegah dua run bersamaan pada task yang sama: dispatcher akan
    // menimpa `run_id` sehingga tombol Stop hanya bisa menghentikan yang
    // terakhir — run pertama menggantung tanpa jalan berhenti.
    if (task.status === 'running' && task.run_id) {
      return reply.code(409).send({
        error: 'already_running',
        message: 'Task masih berjalan — hentikan dulu sebelum dijalankan ulang.',
      });
    }

    try {
      const { run_id } = await dispatcher.runTask(id);
      auditRepo.logAction(request.user!.id, 'task.run', id, JSON.stringify({ run_id }));
      return { status: 'running', run_id };
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      auditRepo.logAction(
        request.user!.id,
        'task.run_failed',
        id,
        JSON.stringify({ error: error?.message || String(err) })
      );
      if (error?.name === 'HermesTimeoutError') {
        return reply.code(504).send({ error: 'gateway_timeout', message: error.message });
      }
      return reply.code(502).send({
        error: 'run_failed',
        message: `Execution failed: ${error?.message || err}`,
      });
    }
  });

  fastify.post<{ Params: { id: string } }>('/api/tasks/:id/stop', async (request, reply) => {
    const { id } = request.params;
    const task = taskRepo.getById(id);
    if (!task) {
      return reply.code(404).send({ error: 'not_found', message: 'Task not found' });
    }

    // stopTask menjamin keadaan konsisten: task selalu berakhir 'cancelled',
    // walau gateway tidak terjangkau. Galat hubungan dilaporkan lewat
    // `gateway_error` (bukan 500) supaya pengguna tahu run mungkin masih
    // hidup di sisi gateway.
    const result = await dispatcher.stopTask(id);
    if (!result.ok) {
      return reply.code(404).send({ error: 'not_found', message: 'Task not found' });
    }

    auditRepo.logAction(
      request.user!.id,
      'task.stop',
      id,
      JSON.stringify({ reason: result.reason, gateway_error: result.gateway_error ?? null })
    );
    const stopped = taskRepo.getById(id);
    if (stopped) broadcastTask(stopped);

    return {
      status: result.status,
      reason: result.reason,
      stopped: result.stopped,
      gateway_error: result.gateway_error ?? null,
    };
  });

  /**
   * Fase 4: Riwayat timeline events untuk suatu task run (run_events).
   * Menampilkan jejak eksekusi tool call, output streaming, hingga penyelesaian run.
   */
  fastify.get<{ Params: { id: string } }>('/api/tasks/:id/events', async (request, reply) => {
    const { id } = request.params;
    const task = taskRepo.getById(id);
    if (!task) {
      return reply.code(404).send({ error: 'not_found', message: 'Task not found' });
    }

    if (!task.run_id) {
      return {
        task_id: id,
        run_id: null,
        events: [],
      };
    }

    interface RunEventRow {
      id: number;
      type: string;
      payload_json: string;
      ts: number;
      agent_id: string;
    }

    const rows = db
      .prepare(
        'SELECT id, type, payload_json, ts, agent_id FROM run_events WHERE run_id = ? ORDER BY id ASC'
      )
      .all(task.run_id) as RunEventRow[];

    const events = rows.map((r) => {
      let payload: unknown = {};
      try {
        payload = JSON.parse(r.payload_json);
      } catch {
        payload = { raw: r.payload_json };
      }
      return {
        id: r.id,
        type: r.type,
        payload,
        timestamp: r.ts,
        agent_id: r.agent_id,
      };
    });

    return {
      task_id: id,
      run_id: task.run_id,
      events,
    };
  });
};
