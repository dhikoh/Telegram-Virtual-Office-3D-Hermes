/**
 * Vitest setup: populate process.env with test defaults so that
 * config.ts (which no longer has zod .default() on secrets) can parse.
 * These values match .env.development. (F-03 fix)
 */
process.env.NODE_ENV ??= 'test';
process.env.TELEGRAM_BOT_TOKEN ??= 'mock_telegram_bot_token';
process.env.OWNER_TELEGRAM_IDS ??= '123456789,987654321';
process.env.HERMES_MODE ??= 'mock';
process.env.HERMES_BASE_URL ??= 'http://127.0.0.1:8642';
process.env.HERMES_KEY_DEFAULT ??= 'mock-secret-key';
process.env.APP_URL ??= 'https://t.me/hermes_office_bot/app';
process.env.DB_PATH ??= ':memory:';
process.env.DEV_AUTH_BYPASS ??= '0';
