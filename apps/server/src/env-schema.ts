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
  /**
   * Batas untuk panggilan gateway yang pendek (probe, health, daftar model,
   * status run). Sengaja BUKAN dipakai untuk chat: jawaban model yang wajar
   * butuh TTFB >20 detik (terukur 20,24 detik di produksi), jadi memakai
   * angka ini untuk stream chat memutus percakapan di tengah jalan.
   */
  HERMES_TIMEOUT_MS: z.coerce.number().default(30000),
  /**
   * Batas waktu tunggu huruf PERTAMA dari stream chat (TTFB). Lebih pendek
   * dari total supaya provider yang menggantung (stream 0 byte) cepat ketahuan,
   * tanpa mematikan model yang lambat tapi tetap berjalan.
   */
  HERMES_CHAT_TTFB_MS: z.coerce.number().default(60000),
  /**
   * Batas total satu giliran chat. Ini pembunuh percakapan sebelumnya:
   * satu angka 30 detik dipakai untuk seluruh jawaban, padahal model yang
   * memanggil tool bisa berjalan beberapa menit.
   */
  HERMES_CHAT_TIMEOUT_MS: z.coerce.number().default(300000),
  /**
   * Fase 2a — jantung detak untuk stream chat. Cloudflare memutus koneksi idle
   * di ~100 detik; menunggu tool bisa jauh lebih lama dari itu. Frame komentar
   * `: hb` tiap interval ini membuat koneksi tetap terbaca aktif.
   */
  CHAT_HEARTBEAT_MS: z.coerce.number().default(10000),
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
