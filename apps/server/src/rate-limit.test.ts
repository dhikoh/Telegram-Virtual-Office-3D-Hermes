import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { createTelegramInitData } from './auth.test.js';

describe('Per-route Rate Limiting (C7 Audit)', () => {
  let db: BetterSqlite3.Database;
  let app: FastifyInstance;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: `tma ${createTelegramInitData(ownerUser, botToken)}`,
  };

  afterAll(async () => {
    if (app) await app.close();
    if (db) db.close();
  });

  it('enforces 30 req/min for private routes like /api/agents (429 on 31st)', async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();

    // 30 requests should succeed (200)
    for (let i = 0; i < 30; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/agents',
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
    }

    // 31st request should be rate-limited (429)
    const blockedRes = await app.inject({
      method: 'GET',
      url: '/api/agents',
      headers: authHeader,
    });
    expect(blockedRes.statusCode).toBe(429);
  });
});
