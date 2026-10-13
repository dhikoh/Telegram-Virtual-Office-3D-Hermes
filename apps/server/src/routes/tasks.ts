import type { FastifyPluginAsync } from 'fastify';
import { TaskSchema } from '@hermes-office/shared';
import { TaskRepository } from '../db/repositories/tasks.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { streamManager } from '../services/stream.js';
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

  fastify.get('/api/tasks', async () => {
    return taskRepo.getAll();
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
};
