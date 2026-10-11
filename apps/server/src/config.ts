import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  TELEGRAM_BOT_TOKEN: z.string().default('mock_telegram_bot_token'),
  OWNER_TELEGRAM_IDS: z.string().default('123456789,987654321'),
  HERMES_MODE: z.enum(['mock', 'real']).default('mock'),
  HERMES_BASE_URL: z.string().url().default('http://127.0.0.1:8642'),
  HERMES_KEY_DEFAULT: z.string().default('mock-secret-key'),
  DEV_AUTH_BYPASS: z
    .preprocess((val) => val === '1' || val === 'true' || val === true, z.boolean())
    .default(false),
  DB_PATH: z.string().default('./data/office.sqlite'),
});

export type Config = z.infer<typeof ConfigSchema> & {
  ownerIdsList: number[];
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.parse(env);

  // Security Rule S3: Refuse to start if NODE_ENV=production and DEV_AUTH_BYPASS is set
  if (parsed.NODE_ENV === 'production' && parsed.DEV_AUTH_BYPASS) {
    throw new Error(
      'SECURITY VIOLATION (Rule S3): DEV_AUTH_BYPASS is strictly prohibited in production mode. Server start aborted.'
    );
  }

  // Security Rule C3f: Mock Hermes is prohibited when NODE_ENV=production
  if (parsed.NODE_ENV === 'production' && parsed.HERMES_MODE === 'mock') {
    throw new Error(
      'SECURITY VIOLATION (Rule C3f): HERMES_MODE=mock is not allowed in production. Must use real Hermes gateway.'
    );
  }

  const ownerIdsList = parsed.OWNER_TELEGRAM_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));

  return {
    ...parsed,
    ownerIdsList,
  };
}

export const config = loadConfig();
