import type { FastifyPluginAsync } from 'fastify';
import { TaskSchema } from '@hermes-office/shared';
import { TaskRepository } from '../db/repositories/tasks.js';
import { AuditRepository } from '../db/repositories/audit.js';

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

    return taskRepo.getById(id);
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
    } catch (err) {
      return reply.code(502).send({ error: 'run_failed', message: `Execution failed: ${err}` });
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
    return { status: 'stopping' };
  });
};
