import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import type { ModelProbeResult } from '../services/hermes/detect.js';

/**
 * Tahap 20 — rute read-only `GET /api/agents/:id/models`.
 *
 * Berbeda dari POST /connection (Tahap 7), rute ini tidak pernah menulis apa
 * pun ke database. Semua kasus probe diuji lewat `probeModels` yang dipasang
 * melalui `buildServer`, sehingga suite tidak pernah membuat panggilan jaringan
 * nyata.
 */
describe('Agent Models Routes (Tahap 20)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  // Harus tercantum di OWNER_TELEGRAM_IDS (.env.development): guard S2c menolak id lain.
  const ownerUser = { id: 123456789, first_name: 'CEO' };
  const ownerAuth = `tma ${createTelegramInitData(ownerUser, botToken)}`;

  const AGENT_ID = 'agent_model_1';
  const okProbe: ModelProbeResult = {
    ok: true,
    models: ['Zephyr-9B', 'anthropic/claude', 'apple-10', 'apple-2', 'apple-2'],
    status_code: 200,
    error: null,
    latency_ms: 12,
  };
  const failProbe: ModelProbeResult = {
    ok: false,
    models: [],
    error: 'unauthorized',
    status_code: 401,
    latency_ms: 12,
  };
  const probeImpl = vi.fn(async (_baseUrl: string, _apiKey?: string) => okProbe);

  const authHeaders = () => ({ authorization: ownerAuth });
  const modelsUrl = (query = '') => `/api/agents/${AGENT_ID}/models${query}`;

  function insertAgent(id: string, model: string) {
    db.prepare(
      // hermes_base_url eksplisit '' (ikuti server): default kolom di 001 masih
      // 'http://127.0.0.1:8642' dan akan menutupi arti tes ini.
      `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
       hermes_profile, hermes_base_url, model, active, hired_at, created_at)
       VALUES (?, 'Raka', 'Staff', 'Tech', 'bot', '{}', 'summary', 'default', '', ?, 1, ?, ?)`
    ).run(id, model, Date.now(), Date.now());
  }

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    insertAgent(AGENT_ID, 'model-1');

    app = await buildServer({ db, probeModels: probeImpl });
    await app.ready();
  });

  beforeEach(() => probeImpl.mockClear());

  afterAll(() => app.close());

  it('menolak permintaan tanpa init data Telegram', async () => {
    const res = await app.inject({ method: 'GET', url: modelsUrl() });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('unauthorized');
  });

  it('menjawab 404 ketika agent tidak ditemukan', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/agents/agent_missing/models',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
    expect(probeImpl).not.toHaveBeenCalled();
  });

  it('menolak base_url draft yang bukan URL valid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: modelsUrl(`?base_url=${encodeURIComponent('http://')}`),
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_input');
    expect(probeImpl).not.toHaveBeenCalled();
  });

  it('menolak base_url draft loopback (S5)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: modelsUrl('?base_url=127.0.0.1:8642'),
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_input');
    expect(probeImpl).not.toHaveBeenCalled();
  });

  it('mengembalikan daftar model terurut A-Z tanpa duplikat', async () => {
    const res = await app.inject({ method: 'GET', url: modelsUrl(), headers: authHeaders() });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      models: string[];
      current_model: string | null;
      endpoint_source: string;
      status_code: number;
    };
    // 'apple-2' muncul dua kali dari gateway, 'apple-10' harus mengikuti 'apple-2'.
    expect(body.models).toEqual(['anthropic/claude', 'apple-2', 'apple-10', 'Zephyr-9B']);
    expect(body.current_model).toBe('model-1');
    expect(body.endpoint_source).toBe('server');
    expect(body.status_code).toBe(200);
  });

  it('menguji base_url draft tanpa menyimpannya (read-only)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: modelsUrl('?base_url=https://openrouter.ai/api/v1'),
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(probeImpl).toHaveBeenCalledTimes(1);
    // Suffix /v1 dipotong sebelum probe (ST-1) supaya gateway tidak menerima /v1/v1/models.
    expect(probeImpl.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api');

    const stored = db.prepare('SELECT hermes_base_url, model FROM agents WHERE id = ?').get(AGENT_ID) as {
      hermes_base_url: string;
      model: string | null;
    };
    // '' = ikuti server (semantik Tahap 7); draft tidak pernah ditulis.
    expect(stored.hermes_base_url).toBe('');
    expect(stored.model).toBe('model-1');
  });

  it('menerjemahkan kegagalan probe menjadi 502 berisi pesan manusia', async () => {
    probeImpl.mockResolvedValueOnce(failProbe);
    const res = await app.inject({ method: 'GET', url: modelsUrl(), headers: authHeaders() });

    expect(res.statusCode).toBe(502);
    const body = res.json() as { error: string; message: string; models: string[] };
    expect(body.error).toBe('unauthorized');
    expect(body.message).toContain('401');
    // models[] wajib ikut dikirim agar klien tidak perlu menebak.
    expect(body.models).toEqual([]);
  });
});
