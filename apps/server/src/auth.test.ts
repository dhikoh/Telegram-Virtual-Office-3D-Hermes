import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { validateInitData } from './plugins/auth.js';
import { loadConfig } from './config.js';

export function createTelegramInitData(
  user: { id: number; first_name: string; username?: string },
  botToken: string,
  authDate = Math.floor(Date.now() / 1000)
): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(user),
  });
  const sorted = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.append('hash', hash);
  return params.toString();
}

describe('Security & Telegram Auth (Section 5, Rules S1-S3)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const nonOwnerUser = { id: 999999999, first_name: 'Intruder', username: 'stranger' };

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it('validates correct Telegram initData HMAC', () => {
    const initData = createTelegramInitData(ownerUser, botToken);
    const res = validateInitData(initData, botToken);
    expect(res.valid).toBe(true);
    expect(res.user?.id).toBe(ownerUser.id);
  });

  it('rejects tampered hash with 401', () => {
    const initData = createTelegramInitData(ownerUser, botToken);
    const params = new URLSearchParams(initData);
    const originalHash = params.get('hash') || '';
    const tamperedHash = originalHash.slice(0, -1) + (originalHash.endsWith('0') ? '1' : '0');
    params.set('hash', tamperedHash);
    const res = validateInitData(params.toString(), botToken);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('hash');
  });

  it('rejects expired auth_date (>3600 seconds) with 401 (S2b)', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 4000;
    const initData = createTelegramInitData(ownerUser, botToken, oldTimestamp);
    const res = validateInitData(initData, botToken);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('expired');
  });

  it('rejects non-owner Telegram ID with 403 (S2c)', async () => {
    const initData = createTelegramInitData(nonOwnerUser, botToken);
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `tma ${initData}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('forbidden');
  });

  it('allows public access to /api/health without auth (S1 exception)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });

  it('blocks unauthenticated access to /api/me with 401 (S1)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
    });
    expect(res.statusCode).toBe(401);
  });

  it('allows authorized owner Telegram ID on /api/me (S2)', async () => {
    const initData = createTelegramInitData(ownerUser, botToken);
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `tma ${initData}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.id).toBe(ownerUser.id);
    expect(body.role).toBe('owner');
  });

  it('Rule S3: Config refuses to start in production if DEV_AUTH_BYPASS=1', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        DEV_AUTH_BYPASS: '1',
        HERMES_MODE: 'real',
        TELEGRAM_BOT_TOKEN: 'real-token-here',
        OWNER_TELEGRAM_IDS: '111222333',
        HERMES_KEY_DEFAULT: 'real-key-here',
      });
    }).toThrow(/SECURITY VIOLATION.*S3/);
  });

  it('Rule C3f: Config refuses to start in production if HERMES_MODE=mock', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
        DEV_AUTH_BYPASS: '0',
        HERMES_MODE: 'mock',
        TELEGRAM_BOT_TOKEN: 'real-token-here',
        OWNER_TELEGRAM_IDS: '111222333',
        HERMES_KEY_DEFAULT: 'real-key-here',
      });
    }).toThrow(/SECURITY VIOLATION.*C3f/);
  });
});
