import type { FastifyPluginAsync } from 'fastify';
import { AuditRepository } from '../db/repositories/audit.js';

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  // F-09: Typed decorations via types/fastify.d.ts
  const { db } = fastify;
  const auditRepo = new AuditRepository(db);

  fastify.get<{ Querystring: { limit?: number } }>('/api/audit', async (request) => {
    const limit = request.query.limit ? Number(request.query.limit) : 100;
    return auditRepo.getAll(limit);
  });
};
