import type { FastifyPluginAsync } from 'fastify';
import { TaskSchema } from '@hermes-office/shared';
import { TaskRepository } from '../db/repositories/tasks.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { streamManager } from '../services/stream.js';
import { listTaskArtifacts } from '../services/artifacts.js';
import type { Task } from '@hermes-office/shared';

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
   */
  fastify.get<{
    Querystring: { source?: string; agent_id?: string; status?: string };
  }>('/api/tasks', async (request) => {
    let tasks = taskRepo.getAll();
    const { source, agent_id, status } = request.query || {};

    if (source && source !== 'all') {
      tasks = tasks.filter((t) => t.source === source);
    }
    if (agent_id) {
      tasks = tasks.filter((t) => t.agent_id === agent_id);
    }
    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }

    const artifacts = listTaskArtifacts(db, tasks.map((t) => t.id));
    return tasks.map((task) => ({
      ...task,
      artifacts: artifacts.get(task.id) ?? [],
    }));
  });

  fastify.post('/api/tasks', async (request, reply) => {
    const rawBody = (request.body || {}) as Record<string, unknown>;
    const taskData = {
      id: rawBody.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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

    const updates = request.body as Record<string, unknown>;
    taskRepo.update(id, updates);

    auditRepo.logAction(request.user!.id, 'task.update', id, JSON.stringify(updates));
    const updatedTask = taskRepo.getById(id);
    if (updatedTask) broadcastTask(updatedTask);

    return updatedTask;
  });

  fastify.post<{ Params: { id: string } }>('/api/tasks/:id/run', async (request, reply) => {
    const { id } = request.params;
    const task = taskRepo.getById(id);
    if (!task) {
      return reply.code(404).send({ error: 'not_found', message: 'Task not found' });
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

    await dispatcher.stopTask(id);
    auditRepo.logAction(request.user!.id, 'task.stop', id);
    const stopped = taskRepo.getById(id);
    if (stopped) broadcastTask(stopped);
    return { status: 'stopping' };
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
