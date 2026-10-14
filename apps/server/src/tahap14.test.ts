/**
 * Tahap 14 — proyek & DAG: dekomposisi jujur + rantai berantai otomatis.
 *
 *  - POST /api/projects membuat proyek 'draft' lalu menanyakan dekomposisi ke
 *    orkestrator DI BELAKANG layar; subtask hanya lahir dari JSON balasan;
 *  - balasan gagal → decompose_error apa adanya, TANPA subtask karangan;
 *  - DAG tanpa siklus divalidasi (dependensi hanya boleh menunjuk indeks
 *    sebelumnya; parseSubtasks menolak sisanya);
 *  - POST /:id/run menjalankan subtask akar; ketika satu subtask 'done',
 *    dependen yang seluruh dependensinya 'done' ikut jalan (hook
 *    dispatcher.updateTask — tanpa polling); semuanya 'done' → ringkasan
 *    final dari orkestrator disimpan + audit project.complete;
 *  - subtask gagal → proyek 'failed', rantai berhenti, dependent tidak jalan;
 *  - manifest endpoints phase 14.
 *
 * Gateway tiruan: chatStream membalas gateway.chatReply; startRun mencatat
 * urutan input; streamEvents langsung menyelesaikan run (run.completed).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrator.js';
import { ENDPOINTS } from '@hermes-office/shared';
import { createTelegramInitData } from './auth.test.js';

const gateway = vi.hoisted(() => ({
  chatReply: '[]',
  failRun: false,
  runInputs: [] as string[],
}));

vi.mock('./services/hermes/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/hermes/index.js')>();

  const stub = {
    capabilities: async () => ({ object: 'hermes.api_server.capabilities', platform: 'hermes-agent', model: 'hermes-agent', features: {} }),
    startRun: async ({ input }: { input: string }) => {
      if (gateway.failRun) throw new Error('MockHermes startRun error: connection refused');
      gateway.runInputs.push(input);
      return { run_id: `run_${gateway.runInputs.length}`, status: 'started' };
    },
    getRunStatus: async () => ({ object: 'hermes.run', run_id: 'run_x', status: 'completed', output: 'selesai' }),
    resolveApproval: async () => ({ status: 'resumed', decision: 'once' }),
    stopRun: async () => ({ status: 'stopping' }),
    streamEvents: async (runId: string, onEvent: (event: string, data: unknown) => void): Promise<() => void> => {
      onEvent('run.completed', { run_id: runId, output: 'selesai' });
      return () => {};
    },
    chatStream: async (
      _messages: unknown[],
      onChunk: (chunk: string) => void
    ): Promise<void> => {
      onChunk(gateway.chatReply);
    },
    listModels: async () => ['hermes-agent'],
    createSession: async () => null,
    getSessionMessages: async () => [],
    sessionChatStream: async () => {},
    listSkills: async () => [],
  } as unknown as import('./services/hermes/client.interface.js').HermesClient;

  return { ...actual, getServerHermesClient: () => stub, getHermesClientForAgent: () => stub };
});

describe('Tahap 14 — proyek & DAG', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: 'tma ' + createTelegramInitData(ownerUser, botToken),
    'content-type': 'application/json',
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

  beforeEach(() => {
    gateway.chatReply = '[]';
    gateway.failRun = false;
    gateway.runInputs = [];
  });

  const post = (url: string, body: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url, headers: authHeader, body: JSON.stringify(body) });
  const get = (url: string) => app.inject({ method: 'GET', url, headers: authHeader });

  const wait = async (fn: () => boolean, timeoutMs = 5000): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('wait: kondisi tidak tercapai dalam waktu tunggu');
  };

  const projectRow = (id: string) =>
    db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  const projectTasks = (id: string) =>
    db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC').all(id) as Record<string, unknown>[];
  const auditRows = (action: string) =>
    db.prepare('SELECT target, detail_json FROM audit_log WHERE action = ?').all(action) as { target: string; detail_json: string }[];

  const createProject = async (title = 'Riset kecil', goal = 'Riset X lalu tulis ringkasan') => {
    const res = await post('/api/projects', { title, goal });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.body) as { project: { id: string } }).project.id;
  };

  it('menolak judul kosong dengan 400', async () => {
    const res = await post('/api/projects', { title: '   ' });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('invalid_input');
  });

  it('dekomposisi sukses: subtask terbentuk, depends_on terpetakan ke id tugas', async () => {
    gateway.chatReply = JSON.stringify([
      { title: 'Kumpulkan data', detail: 'Ambil data mentah', agent: 'command', depends_on: [] },
      { title: 'Tulis ringkasan', detail: 'Ringkas data', agent: 'agent_orchestrator', depends_on: [0] },
    ]);

    const id = await createProject();
    expect(projectRow(id)?.status).toBe('draft');
    await wait(() => projectTasks(id).length === 2);

    const tasks = projectTasks(id);
    expect(tasks.map((t) => t.title)).toEqual(['Kumpulkan data', 'Tulis ringkasan']);
    expect(tasks[0]?.depends_on).toBe('[]');
    expect(JSON.parse(String(tasks[1]?.depends_on))).toEqual([tasks[0]?.id]);
    expect(auditRows('project.decompose').some((r) => r.target === id)).toBe(true);
  });

  it('balasan gateway gagal dibaca → draft + decompose_error apa adanya, tanpa subtask karangan', async () => {
    gateway.chatReply = 'Maaf, saya tidak bisa memecah itu sekarang.';
    const id = await createProject('Proyek gagal', 'tujuan');
    await wait(() => projectRow(id)?.decompose_error !== null);

    const row = projectRow(id)!;
    expect(row.status).toBe('draft');
    expect(String(row.decompose_error)).toContain('Maaf, saya tidak bisa');
    expect(projectTasks(id).length).toBe(0);
    expect(auditRows('project.decompose_failed').some((r) => r.target === id)).toBe(true);
  });

  it('parseSubtasks menolak dependensi ke depan (anti-siklus), >6 subtask, dan judul kosong', async () => {
    const service = app.projectService;
    expect(() => service.parseSubtasks(JSON.stringify([{ title: 'A', depends_on: [0] }]))).toThrow();
    expect(() =>
      service.parseSubtasks(
        JSON.stringify([
          { title: 'A', depends_on: [1] },
          { title: 'B', depends_on: [] },
        ])
      )
    ).toThrow();
    expect(() =>
      service.parseSubtasks(JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ title: `T${i}` }))))
    ).toThrow();
    expect(() => service.parseSubtasks(JSON.stringify([{ title: '' }]))).toThrow();
    expect(service.parseSubtasks(' ```json\n[{"title":"A","depends_on":[]}]\n``` ').length).toBe(1);
  });

  it('run tanpa subtask siap → 409 nothing_ready; project asing → 404', async () => {
    const id = await createProject(); // dekomposisi balasan kosong ([]) → tetap draft
    await wait(() => auditRows('project.decompose_failed').some((r) => r.target === id));
    const res = await post(`/api/projects/${id}/run`);
    expect(res.statusCode).toBe(409);
    expect((JSON.parse(res.body) as { error: string }).error).toBe('nothing_ready');

    expect((await post('/api/projects/prj_ngawur/run')).statusCode).toBe(404);
    expect((await get('/api/projects/prj_ngawur')).statusCode).toBe(404);
  });

  it('rantai berantai: subtask akar jalan dulu, dependen menyusul otomatis, lalu ringkasan final', async () => {
    gateway.chatReply = JSON.stringify([
      { title: 'Bagian awal', detail: 'dikerjakan dulu', depends_on: [] },
      { title: 'Bagian akhir', detail: 'menunggu bagian awal', depends_on: [0] },
    ]);
    const id = await createProject();
    await wait(() => projectTasks(id).length === 2);
    // Decomposisi sudah selesai — balasannya kini dipakai untuk ringkasan final.
    gateway.chatReply = 'Ringkasan final proyek dari orkestrator.';

    const run = await post(`/api/projects/${id}/run`);
    expect(run.statusCode).toBe(200);
    expect((JSON.parse(run.body) as { started: number }).started).toBe(1);
    // Rantai berjalan async di belakang: status boleh sudah 'running' atau
    // bahkan 'done' bila mock menyelesaikan semuanya sangat cepat.
    expect(['running', 'done']).toContain(String(projectRow(id)?.status));

    await wait(() => projectRow(id)?.status === 'done', 8000);

    expect(gateway.runInputs.map((i) => i.split('\n')[0])).toEqual(['Bagian awal', 'Bagian akhir']);
    const row = projectRow(id)!;
    expect(row.summary).toContain('Ringkasan final');
    expect(typeof row.completed_at).toBe('number');
    expect(auditRows('project.complete').some((r) => r.target === id)).toBe(true);
    expect(projectTasks(id).every((t) => t.status === 'done')).toBe(true);
  });

  it('subtask gagal → proyek failed, rantai berhenti, dependent tidak pernah dijalankan', async () => {
    gateway.chatReply = JSON.stringify([
      { title: 'Akan gagal', detail: 'koneksi mati', depends_on: [] },
      { title: 'Tidak boleh jalan', detail: 'bergantung pada yang gagal', depends_on: [0] },
    ]);
    const id = await createProject('Proyek gagal jalan', 'tujuan');
    await wait(() => projectTasks(id).length === 2);

    gateway.failRun = true;
    const run = await post(`/api/projects/${id}/run`);
    expect(run.statusCode).toBe(200); // permintaan diterima; task-nya yang mencatat kegagalan

    await wait(() => projectRow(id)?.status === 'failed', 8000);
    expect(gateway.runInputs.length).toBe(0); // startRun gagal terhubung
    // Subtask pertama gagal; dependennya tetap queued — TIDAK PERNAH dijalankan.
    const tasks = projectTasks(id);
    expect(tasks[0]?.status).toBe('failed');
    expect(tasks[1]?.status).toBe('queued');
    expect(auditRows('project.failed').some((r) => r.target === id)).toBe(true);

    // run ulang project yang sudah failed ditolak
    expect((await post(`/api/projects/${id}/run`)).statusCode).toBe(409);
  });

  it('GET /api/projects menghitung subtask; manifest endpoints phase 14 lengkap', async () => {
    gateway.chatReply = JSON.stringify([{ title: 'Satu', depends_on: [] }]);
    const id = await createProject('Hitung subtask', 'tujuan');
    await wait(() => projectTasks(id).length === 1);

    const list = JSON.parse((await get('/api/projects')).body) as {
      projects: { id: string; subtask_total: number; subtask_done: number }[];
    };
    const found = list.projects.find((p) => p.id === id);
    expect(found?.subtask_total).toBe(1);
    expect(found?.subtask_done).toBe(0);

    const detail = JSON.parse((await get(`/api/projects/${id}`)).body) as {
      tasks: { id: string; depends_on: string[] }[];
    };
    expect(detail.tasks[0]?.depends_on).toEqual([]);

    const phase14 = ENDPOINTS.filter((e) => e.phase === 14).map((e) => `${e.method} ${e.path}`);
    expect(phase14).toContain('POST /api/projects');
    expect(phase14).toContain('GET /api/projects');
    expect(phase14).toContain('GET /api/projects/:id');
    expect(phase14).toContain('POST /api/projects/:id/run');
  });
});
