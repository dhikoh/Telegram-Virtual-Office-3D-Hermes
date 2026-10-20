import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import { formatCronWIB, readCronExpr } from './cron.js';
import type { HermesJob } from '../services/hermes/client.interface.js';
import { RealHermesClient } from '../services/hermes/real.client.js';

let mockJobs: HermesJob[] = [];
let mockListJobsError: Error | null = null;

vi.mock('../services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/hermes/index.js')>();
  return {
    ...actual,
    getServerHermesClient: () => {
      const real = actual.getServerHermesClient();
      return {
        ...real,
        listJobs: async () => {
          if (mockListJobsError) throw mockListJobsError;
          return mockJobs;
        },
      };
    },
  };
});

describe('Cron Routes (Fase 5a & Audit D1-D4)', () => {
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

  describe('readCronExpr (Kasus 1–8)', () => {
    // 1. {schedule:{kind:'cron',expr:'0 1 * * *',display:'0 1 * * *'}} → '0 1 * * *'
    it('1. extracts expr from schedule object', () => {
      expect(
        readCronExpr({ schedule: { kind: 'cron', expr: '0 1 * * *', display: '0 1 * * *' } })
      ).toBe('0 1 * * *');
    });

    // 2. {schedule:{display:'0 1 * * *'}} (tanpa expr) → '0 1 * * *'
    it('2. extracts display when schedule object lacks expr', () => {
      expect(readCronExpr({ schedule: { display: '0 1 * * *' } })).toBe('0 1 * * *');
    });

    // 3. {schedule:'0 1 * * *'} (string bentuk lama) → '0 1 * * *'
    it('3. reads legacy schedule string directly', () => {
      expect(readCronExpr({ schedule: '0 1 * * *' })).toBe('0 1 * * *');
    });

    // 4. {schedule_display:'0 1 * * *'} → '0 1 * * *'
    it('4. reads schedule_display string', () => {
      expect(readCronExpr({ schedule_display: '0 1 * * *' })).toBe('0 1 * * *');
    });

    // 5. {} → null (tidak melempar)
    it('5. returns null on empty object without throwing', () => {
      expect(readCronExpr({})).toBeNull();
      expect(readCronExpr(null)).toBeNull();
      expect(readCronExpr(undefined)).toBeNull();
    });

    // 6. {schedule:{}} → null
    it('6. returns null on empty schedule object', () => {
      expect(readCronExpr({ schedule: {} })).toBeNull();
    });

    // 7. {schedule:12345} → null
    it('7. returns null when schedule is a number (interval ms)', () => {
      expect(readCronExpr({ schedule: 12345 as unknown as string })).toBeNull();
    });

    // 8. {cron:'0 1 * * *'} (legacy) → '0 1 * * *'
    it('8. reads legacy cron string', () => {
      expect(readCronExpr({ cron: '0 1 * * *' })).toBe('0 1 * * *');
    });
  });

  describe('formatCronWIB (Kasus 9–14)', () => {
    // 9. '0 8 * * 1-5' → 'Senin - Jumat pukul 08:00 WIB' (tes lama, jangan dihapus)
    it('9. formats Monday-Friday morning cron to Indonesian text', () => {
      const result = formatCronWIB('0 8 * * 1-5');
      expect(result).toBe('Senin - Jumat pukul 08:00 WIB');
    });

    // 10. '0 8 * * *' → 'Setiap hari pukul 08:00 WIB'
    it('10. formats daily morning cron to Indonesian text', () => {
      const result = formatCronWIB('0 8 * * *');
      expect(result).toBe('Setiap hari pukul 08:00 WIB');
    });

    // 11. '0 8 * * 0' → 'Setiap Minggu pukul 08:00 WIB'
    it('11. formats Sunday cron to Indonesian text', () => {
      const result = formatCronWIB('0 8 * * 0');
      expect(result).toBe('Setiap Minggu pukul 08:00 WIB');
    });

    // 12. null → null
    it('12. returns null on null input without throwing', () => {
      expect(formatCronWIB(null)).toBeNull();
    });

    // 13. undefined → null
    it('13. returns null on undefined input without throwing', () => {
      expect(formatCronWIB(undefined)).toBeNull();
    });

    // 14. 'bukan cron' → null
    it('14. returns null on non-cron string without throwing', () => {
      expect(formatCronWIB('bukan cron')).toBeNull();
      expect(formatCronWIB('')).toBeNull();
      expect(formatCronWIB(12345)).toBeNull();
      expect(formatCronWIB({})).toBeNull();
    });
  });

  describe('Route GET /api/cron (Kasus 15–19)', () => {
    // 15. Job dengan bentuk payload persis seperti di bagian 2
    it('15. Job dengan bentuk payload persis gateway asli -> HTTP 200, cron === "0 1 * * *", cron_wib terisi, last_run_at berupa number', async () => {
      mockListJobsError = null;
      mockJobs = [
        {
          id: '0f2cec510461',
          name: 'prospek-harian-bentocat',
          schedule: { kind: 'cron', expr: '0 1 * * *', display: '0 1 * * *' },
          schedule_display: '0 1 * * *',
          repeat: { times: null, completed: 3 },
          enabled: true,
          state: 'scheduled',
          created_at: '2026-10-19T12:36:35.379935+00:00',
          next_run_at: '2026-10-21T01:00:00+00:00',
          last_run_at: '2026-10-20T01:04:17.771344+00:00',
          last_status: 'ok',
          skills: ['prospecting', 'marketing-plan'],
        },
      ];

      const res = await app.inject({
        method: 'GET',
        url: '/api/cron',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const jobs = JSON.parse(res.body);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('0f2cec510461');
      expect(jobs[0].name).toBe('prospek-harian-bentocat');
      expect(jobs[0].cron).toBe('0 1 * * *');
      expect(jobs[0].cron_wib).toBe('Setiap hari pukul 01:00 WIB');
      expect(typeof jobs[0].last_run_at).toBe('number');
      expect(jobs[0].last_run_at).toBe(Date.parse('2026-10-20T01:04:17.771344+00:00'));
      expect(typeof jobs[0].next_run_at).toBe('number');
      expect(jobs[0].next_run_at).toBe(Date.parse('2026-10-21T01:00:00+00:00'));
      expect(jobs[0].state).toBe('active');
      expect(jobs[0].enabled).toBe(true);
      expect(jobs[0].agent_id).toBe('agent_prospector');
      expect(jobs[0].agent_name).toBe('Bagas');
      expect(jobs[0].agent_avatar).toBe('💼');
    });

    // 16. Tiga job campuran: satu valid, satu schedule objek tanpa expr, satu schedule number
    it('16. Tiga job campuran: satu valid, satu schedule objek tanpa expr, satu schedule number -> HTTP 200, tiga item tetap muncul', async () => {
      mockListJobsError = null;
      mockJobs = [
        {
          id: 'job_1_valid',
          name: 'Job Valid',
          schedule: { kind: 'cron', expr: '0 8 * * 1-5' },
          skills: ['prospecting'],
          state: 'scheduled',
          enabled: true,
        },
        {
          id: 'job_2_no_expr',
          name: 'Job Objek Tanpa Expr',
          schedule: {},
          skills: [],
          state: 'scheduled',
          enabled: true,
        },
        {
          id: 'job_3_number',
          name: 'Job Schedule Number',
          schedule: 120000 as unknown as string,
          skills: [],
          state: 'paused',
          enabled: false,
        },
      ];

      const res = await app.inject({
        method: 'GET',
        url: '/api/cron',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const jobs = JSON.parse(res.body);
      expect(jobs).toHaveLength(3);

      expect(jobs[0].id).toBe('job_1_valid');
      expect(jobs[0].cron).toBe('0 8 * * 1-5');
      expect(jobs[0].cron_wib).toBe('Senin - Jumat pukul 08:00 WIB');
      expect(jobs[0].state).toBe('active');
      expect(jobs[0].enabled).toBe(true);

      expect(jobs[1].id).toBe('job_2_no_expr');
      expect(jobs[1].cron).toBeNull();
      expect(jobs[1].cron_wib).toBeNull();
      expect(jobs[1].state).toBe('active');

      expect(jobs[2].id).toBe('job_3_number');
      expect(jobs[2].cron).toBeNull();
      expect(jobs[2].cron_wib).toBeNull();
      expect(jobs[2].state).toBe('paused');
      expect(jobs[2].enabled).toBe(false);
    });

    // 17. Gateway membalas 401 → HTTP 502 dengan message yang menyebut status, bukan []
    it('17. Gateway membalas 401 -> HTTP 502 dengan message yang menyebut status, bukan []', async () => {
      mockListJobsError = new Error('Gateway Hermes membalas HTTP 401 Unauthorized: Invalid gateway API key');

      const res = await app.inject({
        method: 'GET',
        url: '/api/cron',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.statusCode).toBe(502);
      expect(body.error).toBe('Bad Gateway');
      expect(body.message).toContain('401');
      expect(body.message).toContain('Unauthorized');
    });

    // 18. Gateway timeout → HTTP 502, bukan []
    it('18. Gateway timeout -> HTTP 502, bukan []', async () => {
      mockListJobsError = new Error('Gagal menghubungi gateway Hermes: request timed out after 5000ms');

      const res = await app.inject({
        method: 'GET',
        url: '/api/cron',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.statusCode).toBe(502);
      expect(body.error).toBe('Bad Gateway');
      expect(body.message).toContain('timed out');
    });

    // 19. Gateway membalas {jobs:[]} → HTTP 200 dengan array kosong
    it('19. Gateway membalas {jobs:[]} -> HTTP 200 dengan array kosong', async () => {
      mockListJobsError = null;
      mockJobs = [];

      const res = await app.inject({
        method: 'GET',
        url: '/api/cron',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const jobs = JSON.parse(res.body);
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs).toHaveLength(0);
    });
  });

  describe('RealHermesClient.listJobs direct boundary tests (D3)', () => {
    it('throws with status code when gateway returns non-2xx', async () => {
      const client = new RealHermesClient('http://mock.endpoint', 'KEY', 1000, 1000, 1000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid key',
      } as Response);

      await expect(client.listJobs()).rejects.toThrow('HTTP 401 Unauthorized');
    });

    it('throws with connection error when fetch fails', async () => {
      const client = new RealHermesClient('http://mock.endpoint', 'KEY', 1000, 1000, 1000);
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

      await expect(client.listJobs()).rejects.toThrow('Gagal menghubungi gateway Hermes');
    });

    it('returns parsed HermesJob array on 200 envelope { jobs: [...] }', async () => {
      const client = new RealHermesClient('http://mock.endpoint', 'KEY', 1000, 1000, 1000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          jobs: [
            {
              id: '0f2cec510461',
              name: 'prospek-harian-bentocat',
              schedule: { kind: 'cron', expr: '0 1 * * *', display: '0 1 * * *' },
              enabled: true,
              state: 'scheduled',
            },
          ],
        }),
      } as Response);

      const jobs = await client.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('0f2cec510461');
      expect(jobs[0].name).toBe('prospek-harian-bentocat');
    });
  });
});
