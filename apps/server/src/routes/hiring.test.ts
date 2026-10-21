import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import { resolveHiredBaseUrl } from './hiring.js';

/**
 * Tahap 20 — endpoint agen hasil rekrutmen.
 *
 * Regresi yang ditangkap: `hermes_base_url` dahulu diisi dengan salinan
 * `config.HERMES_BASE_URL`, sehingga setiap agen baru tercatat sebagai endpoint
 * "Custom" milik agen dan membeku pada URL yang berlaku saat ia direkrut.
 * Semantik yang benar ('' = ikut pengaturan server) sudah dideklarasikan oleh
 * 004_tahap9_orchestrator.sql dan dipakai 002_agent_model_and_endpoint.sql.
 */
describe('Hiring endpoint (Tahap 20)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO' };
  const ownerAuth = `tma ${createTelegramInitData(ownerUser, botToken)}`;
  const authHeaders = () => ({ authorization: ownerAuth });

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    app = buildServer({ db });
    await app.ready();
  });

  afterAll(() => app.close());

  describe('resolveHiredBaseUrl', () => {
    it('menyimpan "" ketika owner tidak mengisi endpoint (ikut server)', () => {
      expect(resolveHiredBaseUrl(undefined)).toBe('');
      expect(resolveHiredBaseUrl(null)).toBe('');
      expect(resolveHiredBaseUrl('')).toBe('');
      expect(resolveHiredBaseUrl('   ')).toBe('');
      // Angka 0 bukan URL yang sah — tetap dianggap tidak diisi.
      expect(resolveHiredBaseUrl(0)).toBe('');
    });

    it('menormalisasi suffix /v1 sebelum disimpan (ST-1)', () => {
      expect(resolveHiredBaseUrl('https://openrouter.ai/api/v1')).toBe(
        'https://openrouter.ai/api'
      );
      expect(resolveHiredBaseUrl(' 172.16.1.1:8642 ')).toBe('http://172.16.1.1:8642');
    });

    it('membiarkan URL yang bukan versi API utuh', () => {
      expect(resolveHiredBaseUrl('https://gw.example/v1beta')).toBe('https://gw.example/v1beta');
      expect(resolveHiredBaseUrl('https://gw.example/v1/capabilities')).toBe(
        'https://gw.example'
      );
    });
  });

  describe('POST /api/hiring/:id/mark-hired', () => {
    it('menolak base_url loopback dan tidak membuat agen sama sekali', async () => {
      const draftRes = await app.inject({
        method: 'POST',
        url: '/api/hiring/draft',
        headers: authHeaders(),
        payload: { form: { name: 'Loopback' }, soul_md: '# SOUL\n', commands_md: '# CMD\n' },
      });
      expect(draftRes.statusCode).toBe(201);
      const draftId = (draftRes.json() as { id: string }).id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/hiring/${draftId}/mark-hired`,
        headers: authHeaders(),
        payload: {
          agent: {
            id: 'agent_loopback_hire',
            name: 'Loopback',
            department: 'command',
            hermes_base_url: '127.0.0.1:8642',
          },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('invalid_input');
      // Agar benar-benar menolak, barisnya tidak boleh ada.
      expect(db.prepare('SELECT 1 FROM agents WHERE id = ?').get('agent_loopback_hire')).toBe(
        undefined
      );
    });
  });
});
