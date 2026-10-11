import type { FastifyPluginAsync } from 'fastify';
import { AuditRepository } from '../db/repositories/audit.js';

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  const db = (fastify as any).db; // eslint-disable-line @typescript-eslint/no-explicit-any
  const auditRepo = new AuditRepository(db);

  fastify.get<{ Querystring: { limit?: number } }>('/api/audit', async (request) => {
    const limit = request.query.limit ? Number(request.query.limit) : 100;
    return auditRepo.getAll(limit);
  });
};
