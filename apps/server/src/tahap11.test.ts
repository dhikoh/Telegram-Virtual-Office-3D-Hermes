/**
 * Tahap 11 — instal/hapus skill lewat orkestrator.
 *
 * Gateway tidak punya REST install/uninstall (keputusan 7.11), jadi:
 *  - nama wajib slug (400 invalid_input untuk 'rm -rf /' / 'Skill X');
 *  - skill terpasang ditolak 409, skill asing ditolak 404;
 *  - permintaan yang lolos menjadi baris tugas milik agen sistem
 *    `agent_orchestrator` dengan instruksi eksplisit, dicatat ke audit
 *    (skill.install_request / skill.uninstall_request), lalu dijalankan
 *    lewat pipeline task/run yang sama dengan POST /api/tasks/:id/run;
 *  - kegagalan koneksi gateway TIDAK mengubah hasil permintaan (tetap 201),
 *    status tugasnya yang mencatat kegagalan;
 *  - semua endpoint butuh autentikasi pemilik.
 *
 * Gateway tiruan di-stub lewat vi.mock: daftar skill dan jalannya run
 * deterministik, tanpa menyentuh jaringan.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { ENDPOINTS } from '@hermes-office/shared';
import { createTelegramInitData } from './auth.test.js';

/** Kontrol gateway tiruan dari dalam test (vi.hoisted agar aman dari hoisting vi.mock). */
const gateway = vi.hoisted(() => ({
  installed: [] as { name: string; description: string }[],
  failRun: false,
}));

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();

  const stub = {
    capabilities: async () => ({
      object: 'hermes.api_server.capabilities',
      platform: 'hermes-agent',
      model: 'hermes-agent',
      features: {},
    }),
    startRun: async () => {
      if (gateway.failRun) throw new Error('MockHermes startRun error: connection refused');
      return { run_id: 'run_skill_mock', status: 'started' };
    },
    getRunStatus: async () => ({
      object: 'hermes.run',
      run_id: 'run_skill_mock',
      status: 'completed',
      output: 'Skill ditangani orkestrator.',
    }),
    resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
    stopRun: async () => ({ status: 'stopping' }),
    streamEvents: async (
      runId: string,
      onEvent: (event: string, data: unknown) => void
    ): Promise<() => void> => {
      onEvent('run.completed', { run_id: runId, output: 'Skill ditangani orkestrator.' });
      return () => {};
    },
    chatStream: async () => {},
    listModels: async () => ['hermes-agent'],
    createSession: async () => null,
    getSessionMessages: async () => [],
    sessionChatStream: async () => {},
    listSkills: async () => gateway.installed.map((s) => ({ ...s })),
  } as unknown as import('./services/hermes/client.interface.js').HermesClient;

  return {
    ...actual,
    getServerHermesClient: () => stub,
    getHermesClientForAgent: () => stub,
  };
});

describe('Tahap 11 — instal/hapus skill lewat orkestrator', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
  };

  const INSTALL = 'codebase-inspection';
  const FRESH = 'pdf-tools';

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

  beforeEach(() => {
    gateway.installed = [{ name: INSTALL, description: 'Inspeksi codebase' }];
    gateway.failRun = false;
  });

  const request = (url: string, body: Record<string, unknown>, headers = authHeader) =>
    app.inject({ method: 'POST', url, headers, body: JSON.stringify(body) });

  const taskCount = () =>
    (db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number }).c;

  const auditRows = (action: string) =>
    db
      .prepare('SELECT target, detail_json FROM audit_log WHERE action = ?')
      .all(action) as { target: string; detail_json: string }[];

  it('menolak nama yang bukan slug dengan 400 invalid_input', async () => {
    const before = taskCount();
    for (const name of ['rm -rf /', 'Skill X', '', 'UPPER', 'a'.repeat(45)]) {
      const install = await request('/api/skills/install', { name });
      expect(install.statusCode).toBe(400);
      expect((JSON.parse(install.body) as { error: string }).error).toBe('invalid_input');
    }
    const uninstall = await request('/api/skills/uninstall', { name: '../etc/passwd' });
    expect(uninstall.statusCode).toBe(400);
    expect((JSON.parse(uninstall.body) as { error: string }).error).toBe('invalid_input');
    expect(taskCount()).toBe(before);
  });

  it('menolak instal skill yang sudah terpasang dengan 409 dan tidak membuat tugas', async () => {
    const before = taskCount();
    const res = await request('/api/skills/install', { name: INSTALL });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe('skill_already_installed');
    expect(taskCount()).toBe(before);
    expect(auditRows('skill.install_request')).toEqual([]);
  });

  it('membuat tugas orkestrator, mencatat audit, dan menjalankannya (201)', async () => {
    const res = await request('/api/skills/install', { name: FRESH });
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body) as {
      task: { id: string; agent_id: string; title: string; description: string; status: string };
      status: string;
      run_id: string | null;
    };
    expect(body.task.agent_id).toBe('agent_orchestrator');
    expect(body.task.title).toBe(`Instal skill: ${FRESH}`);
    expect(body.task.description).toContain(FRESH);
    expect(body.task.description).toContain('manage_catalog');
    expect(body.task.description).toContain('JANGAN menginstal skill lain');

    // Jalur auto-run yang sama dengan POST /api/tasks/:id/run.
    expect(body.run_id).toBe('run_skill_mock');
    expect(['running', 'done']).toContain(body.task.status);
    expect(['running', 'done']).toContain(body.status);

    const audit = auditRows('skill.install_request');
    expect(audit).toHaveLength(1);
    expect(audit[0].target).toBe(FRESH);
    expect(JSON.parse(audit[0].detail_json).task_id).toBe(body.task.id);
    expect(auditRows('task.run').some((r) => r.target === body.task.id)).toBe(true);
  });

  it('menolak hapus skill yang tidak terpasang dengan 404', async () => {
    const before = taskCount();
    const res = await request('/api/skills/uninstall', { name: FRESH });
    expect(res.statusCode).toBe(404);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('skill_not_installed');
    expect(taskCount()).toBe(before);
  });

  it('membuat tugas hapus untuk skill terpasang dengan 201 dan audit uninstall', async () => {
    const res = await request('/api/skills/uninstall', { name: INSTALL });
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body) as {
      task: { agent_id: string; title: string; description: string };
      status: string;
    };
    expect(body.task.agent_id).toBe('agent_orchestrator');
    expect(body.task.title).toBe(`Hapus skill: ${INSTALL}`);
    expect(body.task.description).toContain(INSTALL);
    expect(body.task.description).toContain('manage_catalog uninstall');
    expect(['running', 'done']).toContain(body.status);

    const audit = auditRows('skill.uninstall_request');
    expect(audit).toHaveLength(1);
    expect(audit[0].target).toBe(INSTALL);
  });

  it('permintaan tetap diterima (201) walau run ke gateway gagal', async () => {
    gateway.failRun = true;
    const res = await request('/api/skills/install', { name: 'invoice-parser' });
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body) as { task: { id: string; status: string }; status: string };
    expect(body.task.status).toBe('failed');
    expect(body.status).toBe('failed');

    const failed = db
      .prepare("SELECT detail_json FROM audit_log WHERE action = 'task.run_failed' AND target = ?")
      .get(body.task.id) as { detail_json: string } | undefined;
    expect(failed).toBeDefined();
    expect(JSON.parse(failed!.detail_json).error).toContain('connection refused');
  });

  it('kedua endpoint butuh autentikasi pemilik', async () => {
    const before = taskCount();
    const noAuth = await app.inject({
      method: 'POST',
      url: '/api/skills/install',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: FRESH }),
    });
    expect([401, 403]).toContain(noAuth.statusCode);

    const intruderHeader = {
      authorization: 'tma ' + createTelegramInitData({ id: 555555, first_name: 'Tamu' }, botToken),
      'content-type': 'application/json',
    };
    const intruder = await app.inject({
      method: 'POST',
      url: '/api/skills/uninstall',
      headers: intruderHeader,
      body: JSON.stringify({ name: INSTALL }),
    });
    expect(intruder.statusCode).toBe(403);
    expect(taskCount()).toBe(before);
  });

  it('endpoints manifest mencatat kedua rute Tahap 11', () => {
    const has = (method: string, path: string) =>
      ENDPOINTS.some((e) => e.method === method && e.path === path);
    expect(has('POST', '/api/skills/install')).toBe(true);
    expect(has('POST', '/api/skills/uninstall')).toBe(true);
  });
});
