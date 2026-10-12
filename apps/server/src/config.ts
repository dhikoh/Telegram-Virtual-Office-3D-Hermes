import { z } from 'zod';
import { EnvSchema } from './env-schema.js';

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
