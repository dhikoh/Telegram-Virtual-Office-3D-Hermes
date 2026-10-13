import type { FastifyPluginAsync } from 'fastify';
import { getServerHermesClient } from '../services/hermes/index.js';
import { config } from '../config.js';

/**
 * Tahap 8 — layar Skills/Kemampuan.
 *
 * Data diambil apa adanya dari gateway:
 * - `skills`  : daftar skill yang terpasang di gateway (/v1/skills).
 * - kalau gateway tidak bisa mendaftar skill, respons tetap 200 dengan
 *   `available: false` + pesan galat sebenarnya dan dokumen capabilities
 *   (features/endpoint nyata) supaya layar tidak pernah menampilkan data karangan.
 */
export const skillRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/skills', async () => {
    const client = getServerHermesClient();

    try {
      const skills = await client.listSkills();
      const capabilities = await client.capabilities().catch(() => null);
      return {
        available: true,
        gateway: config.HERMES_BASE_URL,
        skills: skills.map((s) => normalizeSkill(s)),
        capabilities,
        error: null,
      };
    } catch (err) {
      const capabilities = await client.capabilities().catch(() => null);
      return {
        available: false,
        gateway: config.HERMES_BASE_URL,
        skills: [],
        capabilities,
        error: String((err as Error)?.message || err),
      };
    }
  });
};

interface NormalizedSkill {
  name: string;
  description: string;
  enabled?: boolean;
  source: string;
}

/** Beberapa versi gateway membalas {data:[...]} atau {skills:[...]} — dinormalkan. */
function normalizeSkill(raw: unknown): NormalizedSkill {
  const s = (raw ?? {}) as Record<string, unknown>;
  const name =
    (typeof s.name === 'string' && s.name) ||
    (typeof s.slug === 'string' && s.slug) ||
    (typeof s.id === 'string' && s.id) ||
    'skill';
  const description =
    (typeof s.description === 'string' && s.description) ||
    (typeof s.summary === 'string' && s.summary) ||
    '';
  return {
    name,
    description,
    enabled: typeof s.enabled === 'boolean' ? s.enabled : undefined,
    source: 'gateway',
  };
}
