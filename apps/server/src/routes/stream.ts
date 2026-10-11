import type { FastifyPluginAsync } from 'fastify';
import { streamManager } from '../services/stream.js';

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/stream', async (request, reply) => {
    streamManager.registerClient(reply);
  });
};
