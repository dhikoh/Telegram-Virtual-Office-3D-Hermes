import type { FastifyPluginAsync } from 'fastify';

export const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/me', async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    return {
      user: request.user,
      role: 'owner',
      permissions: ['tasks.manage', 'approvals.resolve', 'reports.view', 'agents.hire'],
    };
  });
};
