import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      service: 'hermes-virtual-office',
      timestamp: Date.now(),
    };
  });
};
