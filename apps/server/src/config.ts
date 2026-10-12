import { z } from 'zod';
import { EnvSchema } from './env-schema.js';

/**
 * Values shipped in docs/examples that must never reach production.
 * Deliberately NOT printed back in error messages (Rule S4: no secret echo).
 */
const PLACEHOLDER_HERMES_KEYS = new Set([
  'mock-secret-key',
  'hermes_secret_token',
  'change-me-local-dev',
  'changeme',
  'your-key-here',
]);

export type Config = z.infer<typeof EnvSchema> & {
  ownerIdsList: number[];
  ownerEmailsList: string[];
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.parse(env);

  if (parsed.NODE_ENV === 'production') {
    const violations: string[] = [];

    if (parsed.DEV_AUTH_BYPASS) {
      violations.push(
        'SECURITY VIOLATION (Rule S3): DEV_AUTH_BYPASS is strictly prohibited in production mode.'
      );
    }

    if (parsed.HERMES_MODE === 'mock') {
      violations.push(
        'SECURITY VIOLATION (Rule C3f): HERMES_MODE=mock is not allowed in production. Must use real Hermes gateway.'
      );
    }

    if (parsed.HERMES_MODE === 'real' && PLACEHOLDER_HERMES_KEYS.has(parsed.HERMES_KEY_DEFAULT.trim())) {
      violations.push(
        'CONFIG ERROR: HERMES_KEY_DEFAULT is still a placeholder value. Set it to API_SERVER_KEY from ~/.hermes/.env on the VPS host. Server start aborted.'
      );
    }

    if (parsed.HERMES_MODE === 'real' && /localhost|127\.0\.0\.1/.test(parsed.HERMES_BASE_URL)) {
      violations.push(
        'CONFIG ERROR: HERMES_BASE_URL points at localhost, which the Docker container cannot reach. Use the Docker network gateway, e.g. http://172.16.1.1:8642. Server start aborted.'
      );
    }

    if (violations.length > 0) {
      throw new Error(violations.join(' ') + ' Server start aborted.');
    }
  }

  const ownerIdsList = parsed.OWNER_TELEGRAM_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));

  if (parsed.NODE_ENV === 'production' && ownerIdsList.length === 0) {
    throw new Error(
      'SECURITY VIOLATION: OWNER_TELEGRAM_IDS must contain at least one valid numeric Telegram ID in production. Server start aborted.'
    );
  }

  const ownerEmailsList = (parsed.OWNER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    ...parsed,
    ownerIdsList,
    ownerEmailsList,
  };
}

export const config = loadConfig();
