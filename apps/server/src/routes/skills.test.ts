import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';

describe('Skill Sync Routes (Fase 6)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: `tma ${createTelegramInitData(ownerUser, botToken)}`,
  };

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

  describe('GET /api/skills/sync/status', () => {
    it('requires authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/skills/sync/status',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns sync status comparing repo skills and gateway/target', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/skills/sync/status',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(typeof json.in_sync).toBe('boolean');
      expect(json.total_local).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(json.missing_names)).toBe(true);
      expect(Array.isArray(json.installed_names)).toBe(true);
      expect(Array.isArray(json.local_skills)).toBe(true);
    });
  });

  describe('POST /api/skills/sync', () => {
    it('requires authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/skills/sync',
      });
      expect(res.statusCode).toBe(401);
    });

    it('executes auto-sync and returns synced/already_installed items', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/skills/sync',
        headers: authHeader,
        payload: { force: false },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.synced)).toBe(true);
      expect(Array.isArray(json.already_installed)).toBe(true);
      expect(typeof json.timestamp).toBe('number');
    });
  });
});
