import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import { formatCronWIB } from './cron.js';

describe('Cron Routes (Fase 5a)', () => {
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

    const now = Date.now();
    // Seed test agents
    db.prepare(`
      INSERT INTO agents (id, name, role, department, avatar, soul_summary, hermes_base_url, api_key_env, hermes_profile, active, hired_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'agent_prospector',
      'Bagas',
      'Distributor Prospecting & Marketing',
      'sales',
      '💼',
      'Fokus mencari distributor dan kualifikasi prospek',
      'http://127.0.0.1:8642',
      'KEY',
      'default',
      1,
      now,
      now
    );

    app = buildServer({ db });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  describe('formatCronWIB helper', () => {
    it('formats Monday-Friday morning cron to Indonesian text', () => {
      const result = formatCronWIB('0 8 * * 1-5');
      expect(result).toBe('Senin - Jumat pukul 08:00 WIB');
    });

    it('formats daily evening cron to Indonesian text', () => {
      const result = formatCronWIB('0 17 * * *');
      expect(result).toBe('Setiap hari pukul 17:00 WIB');
    });

    it('returns raw expression if not standard hour-minute cron', () => {
      const result = formatCronWIB('*/15 * * * *');
      expect(result).toBe('*/15 * * * *');
    });
  });

  describe('GET /api/cron', () => {
    it('returns scheduled jobs mapped to office agents', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/cron',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const jobs = JSON.parse(res.body);
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);

      // Cari job prospecting yang harus terpetakan ke agent_prospector (Bagas)
      const prospectingJob = jobs.find((j: { id: string }) => j.id === 'job_daily_prospecting');
      expect(prospectingJob).toBeDefined();
      expect(prospectingJob.agent_id).toBe('agent_prospector');
      expect(prospectingJob.agent_name).toBe('Bagas');
      expect(prospectingJob.agent_avatar).toBe('💼');
      expect(prospectingJob.cron_wib).toContain('WIB');
      expect(prospectingJob.state).toBe('active');
    });
  });
});
