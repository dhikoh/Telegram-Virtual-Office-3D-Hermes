import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { probeHermes } from '../services/hermes/probe.js';

/**
 * GET /api/health — public (Rule S1), also used as the Docker HEALTHCHECK.
 *
 * Always returns HTTP 200 so a temporarily unreachable Hermes gateway never
 * causes a container restart loop; the degradation is reported in the body
 * as `status: 'degraded'` / `hermes.reachable === false`.
 * The base URL is never echoed back (it names an internal host).
 */
export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async () => {
    const hermes = await probeHermes(config.HERMES_BASE_URL, config.HERMES_MODE);
    const reachable = config.HERMES_MODE === 'real' ? hermes.reachable : true;

    return {
      status: reachable ? 'ok' : 'degraded',
      service: 'hermes-virtual-office',
      timestamp: Date.now(),
      hermes: {
        mode: hermes.mode,
        reachable: hermes.reachable,
        status_code: hermes.status_code,
        latency_ms: hermes.latency_ms,
        error: hermes.error,
      },
    };
  });
};
