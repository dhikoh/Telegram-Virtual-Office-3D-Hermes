/**
 * Environment Variable Zod Schema (no side effects)
 * Imported by config.ts and by gap-check C3d.
 */
import { z } from 'zod';

const booleanPreprocess = z.preprocess(
  (val) => val === '1' || val === 'true' || val === true,
  z.boolean()
);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  OWNER_TELEGRAM_IDS: z.string().min(1),
  OWNER_EMAILS: z.string().default(''),
  APP_URL: z.string().default('https://t.me/hermes_office_bot/app'),
  HERMES_MODE: z.enum(['mock', 'real']).default('mock'),
  HERMES_BASE_URL: z.string().url().default('http://127.0.0.1:8642'),
  HERMES_KEY_DEFAULT: z.string().min(1),
  HERMES_TIMEOUT_MS: z.coerce.number().default(30000),
  DEV_AUTH_BYPASS: booleanPreprocess.default(false),
  DB_PATH: z.string().default('./data/office.sqlite'),
  /**
   * Tahap 12 — media chat & retensi.
   * MEDIA_DIR kosong = '<direktori DB>/media', jadi di kontainer cukup set
   * DB_PATH=/data/office.sqlite dan media ikut menetap di /data/media.
   */
  MEDIA_DIR: z.string().default(''),
  MEDIA_IMAGE_RETENTION_DAYS: z.coerce.number().int().min(0).default(7),
  MEDIA_ARTIFACT_RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
  MEDIA_CAP_MB: z.coerce.number().int().min(0).default(500),
  MEDIA_UPLOAD_MAX_MB: z.coerce.number().int().min(1).default(8),
  MEDIA_SWEEP_INTERVAL_MIN: z.coerce.number().int().min(0).default(60),
  /** 1 = jangan jalankan pembersih retensi otomatis (untuk debugging operasional). */
  MEDIA_SWEEP_DISABLED: booleanPreprocess.default(false),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Regex matching secret env var names that must NEVER have zod .default().
 * Used by gap-check C3d to verify no accidental defaults on secrets.
 */
export const SECRET_KEY_PATTERN = /TOKEN|KEY|SECRET|PASSWORD/i;
