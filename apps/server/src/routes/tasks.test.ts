import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../server.js';
import { runMigrations } from '../db/migrator.js';
import { createTelegramInitData } from '../auth.test.js';
import { telegramNotifications } from '../services/notifications.js';

describe('Task Visibility & Events Routes (Fase 4)', () => {
  let app: FastifyInstance;
  let db: BetterSqlite3.Database;

  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = {
    authorization: `tma ${createTelegramInitData(ownerUser, botToken)}`,
  };
  const jsonHeaders = {
    ...authHeader,
    'content-type': 'application/json',
  };

  beforeAll(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);

    const now = Date.now();
    db.prepare(`
      INSERT INTO agents (id, name, role, department, avatar, soul_summary, hermes_base_url, api_key_env, hermes_profile, active, hired_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'agent_finance_01',
      'Finance Agent',
      'Accountant',
      'command',
      '🤖',
      'Handles finance',
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

  describe('GET /api/tasks query filtering (Fase 4c)', () => {
    it('filters tasks by source (chat vs manual)', async () => {
      // Buat 1 task manual
      await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({
          title: 'Manual Task 1',
          agent_id: 'agent_finance_01',
          priority: 'normal',
        }),
      });

      // Insert task chat langsung ke DB untuk verifikasi filter source
      const chatId = 'task_chat_test_01';
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        chatId,
        'Chat Task 1',
        'Auto materialized from chat',
        'agent_finance_01',
        'normal',
        'running',
        'run_chat_999',
        null,
        null,
        123456789,
        Date.now(),
        Date.now(),
        'chat',
        2
      );

      // 1. Filter source=chat
      const chatRes = await app.inject({
        method: 'GET',
        url: '/api/tasks?source=chat',
        headers: authHeader,
      });
      expect(chatRes.statusCode).toBe(200);
      const chatTasks = JSON.parse(chatRes.body);
      expect(chatTasks.some((t: { id: string }) => t.id === chatId)).toBe(true);
      expect(chatTasks.every((t: { source?: string }) => t.source === 'chat')).toBe(true);

      // 2. Filter source=manual
      const manualRes = await app.inject({
        method: 'GET',
        url: '/api/tasks?source=manual',
        headers: authHeader,
      });
      expect(manualRes.statusCode).toBe(200);
      const manualTasks = JSON.parse(manualRes.body);
      expect(manualTasks.some((t: { id: string }) => t.id === chatId)).toBe(false);
      expect(manualTasks.every((t: { source?: string }) => t.source === 'manual')).toBe(true);

      // 3. Filter source=all
      const allRes = await app.inject({
        method: 'GET',
        url: '/api/tasks?source=all',
        headers: authHeader,
      });
      expect(allRes.statusCode).toBe(200);
      const allTasks = JSON.parse(allRes.body);
      expect(allTasks.some((t: { id: string }) => t.id === chatId)).toBe(true);
      expect(allTasks.some((t: { title: string }) => t.title === 'Manual Task 1')).toBe(true);
    });
  });

  describe('GET /api/tasks/:id/events (Fase 4c)', () => {
    it('returns 404 for non-existent task', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks/task_nonexistent_xyz/events',
        headers: authHeader,
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('not_found');
    });

    it('returns empty events array when task has no run_id', async () => {
      const taskRes = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({
          title: 'Task without run',
          agent_id: 'agent_finance_01',
          priority: 'normal',
        }),
      });
      const task = JSON.parse(taskRes.body);

      const res = await app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/events`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({
        task_id: task.id,
        run_id: null,
        events: [],
      });
    });

    it('returns ordered timeline events with parsed payloads when run_id exists', async () => {
      const taskId = 'task_with_run_01';
      const runId = 'run_timeline_test_123';
      const now = Date.now();

      // Insert task dengan run_id
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        taskId,
        'Task With Run Events',
        'Testing timeline endpoint',
        'agent_finance_01',
        'normal',
        'done',
        runId,
        'Success result',
        null,
        123456789,
        now,
        now,
        'chat',
        1
      );

      // Insert run_events
      const insertEvent = db.prepare(
        'INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)'
      );
      insertEvent.run(runId, 'agent_finance_01', 'run.started', JSON.stringify({ status: 'started' }), now);
      insertEvent.run(
        runId,
        'agent_finance_01',
        'tool.started',
        JSON.stringify({ tool: 'web_search', args: { q: 'Hermes' } }),
        now + 100
      );
      insertEvent.run(
        runId,
        'agent_finance_01',
        'tool.completed',
        JSON.stringify({ tool: 'web_search', output: 'Found 10 results' }),
        now + 300
      );
      insertEvent.run(
        runId,
        'agent_finance_01',
        'run.completed',
        JSON.stringify({ finish_reason: 'stop' }),
        now + 400
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/tasks/${taskId}/events`,
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.task_id).toBe(taskId);
      expect(body.run_id).toBe(runId);
      expect(body.events).toHaveLength(4);

      expect(body.events[0].type).toBe('run.started');
      expect(body.events[0].payload).toEqual({ status: 'started' });

      expect(body.events[1].type).toBe('tool.started');
      expect(body.events[1].payload).toEqual({ tool: 'web_search', args: { q: 'Hermes' } });

      expect(body.events[2].type).toBe('tool.completed');
      expect(body.events[2].payload).toEqual({ tool: 'web_search', output: 'Found 10 results' });

      expect(body.events[3].type).toBe('run.completed');
    });
  });

  /**
   * Audit 2026-10-21 — perbaikan Stop Task & CRUD.
   * Sebelum perbaikan: stop pada task ber-run_id menghasilkan 500 dan DB
   * tetap 'running'; stop tanpa run_id menghasilkan 200 'stopping' tanpa
   * mengubah apa pun; DELETE 404; PATCH mentah menerima nama kolom injeksi.
   */
  describe('POST /api/tasks/:id/stop — selalu konsisten', () => {
    const seedRunning = (id: string, runId: string | null) => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, ?, '', 'agent_finance_01', 'normal', 'running', ?, NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(id, `Task ${id}`, runId, now, now);
    };
    const statusOf = (id: string) =>
      (db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as { status: string }).status;

    it('menutup task walau gateway tidak terjangkau, dan melaporkan galatnya', async () => {
      seedRunning('task_stop_gw', 'run_mati_1');

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/task_stop_gw/stop',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('cancelled');
      expect(body.gateway_error).toBeTruthy();
      expect(body.stopped).toBe(false);
      expect(statusOf('task_stop_gw')).toBe('cancelled');
    });

    it('menutup task yang berjalan tanpa run_id', async () => {
      seedRunning('task_stop_norun', null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/task_stop_norun/stop',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('cancelled');
      expect(body.reason).toBe('no_run_id');
      expect(statusOf('task_stop_norun')).toBe('cancelled');
    });

    it('idempoten: stop pada task yang sudah selesai tidak mengubah status', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES ('task_stop_done', 'Selesai', '', 'agent_finance_01', 'normal', 'done', 'run_lama', NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(now, now);

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/task_stop_done/stop',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).reason).toBe('already_finished');
      expect(statusOf('task_stop_done')).toBe('done');
    });

    it('404 untuk task yang tidak ada', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/task_tidak_ada/stop',
        headers: authHeader,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    const seed = (id: string, status: string, runId: string | null) => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, ?, '', 'agent_finance_01', 'normal', ?, ?, NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(id, `Task ${id}`, status, runId, now, now);
    };

    it('menghapus task backlog dan mengembalikan 404 untuk permintaan kedua', async () => {
      seed('task_del_1', 'backlog', null);

      const first = await app.inject({
        method: 'DELETE',
        url: '/api/tasks/task_del_1',
        headers: authHeader,
      });
      expect(first.statusCode).toBe(200);
      expect(JSON.parse(first.body)).toEqual({ ok: true, id: 'task_del_1' });
      expect(db.prepare('SELECT id FROM tasks WHERE id = ?').get('task_del_1')).toBeUndefined();

      const second = await app.inject({
        method: 'DELETE',
        url: '/api/tasks/task_del_1',
        headers: authHeader,
      });
      expect(second.statusCode).toBe(404);
    });

    it('menghentikan run lalu menghapus task yang sedang berjalan', async () => {
      seed('task_del_2', 'running', 'run_del_2');

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/tasks/task_del_2',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      expect(db.prepare('SELECT id FROM tasks WHERE id = ?').get('task_del_2')).toBeUndefined();
    });
  });

  describe('PATCH /api/tasks/:id — validasi & anti injeksi', () => {
    it('menolak nama kolom yang tidak dikenal (bukan lagi 500 maupun injeksi)', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES ('task_patch_1', 'Judul asli', '', 'agent_finance_01', 'normal', 'backlog', NULL, NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(now, now);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/tasks/task_patch_1',
        headers: jsonHeaders,
        body: JSON.stringify({ unknown_column_zzz: 1 }),
      });
      expect(res.statusCode).toBe(400);

      // Uji injeksi: kunci yang menyuntik klausa SET harus ditolak mentah-mentah.
      const inject = await app.inject({
        method: 'PATCH',
        url: '/api/tasks/task_patch_1',
        headers: jsonHeaders,
        body: JSON.stringify({ "status = 'cancelled', title": 'SUNTIK' }),
      });
      expect(inject.statusCode).toBe(400);

      const row = db.prepare('SELECT title, status FROM tasks WHERE id = ?').get('task_patch_1');
      expect(row).toEqual({ title: 'Judul asli', status: 'backlog' });
    });

    it('mengubah judul, prioritas, penerima, jadwal, dan status non-running', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES ('task_patch_2', 'Lama', '', 'agent_finance_01', 'normal', 'backlog', NULL, NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(now, now);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/tasks/task_patch_2',
        headers: jsonHeaders,
        body: JSON.stringify({
          title: 'Baru',
          description: 'Keterangan',
          priority: 'high',
          due_at: 1792583617700,
          status: 'done',
        }),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        title: 'Baru',
        description: 'Keterangan',
        priority: 'high',
        status: 'done',
        due_at: 1792583617700,
      });
    });

    it('menolak perpindahan ke running lewat PATCH (hanya /run yang boleh)', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES ('task_patch_3', 'Tugas', '', 'agent_finance_01', 'normal', 'backlog', NULL, NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(now, now);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/tasks/task_patch_3',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'running' }),
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error).toBe('invalid_transition');
    });

    it('menolak agent_id yang tidak ada dengan 400', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES ('task_patch_4', 'Tugas', '', 'agent_finance_01', 'normal', 'backlog', NULL, NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(now, now);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/tasks/task_patch_4',
        headers: jsonHeaders,
        body: JSON.stringify({ agent_id: 'agen_tidak_ada' }),
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/tasks — bentuk masukan', () => {
    it('menolak id ganda dengan 409, bukan 500', async () => {
      const first = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({ id: 'task_id_ganda', title: 'Pertama', agent_id: 'agent_finance_01' }),
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({ id: 'task_id_ganda', title: 'Kedua', agent_id: 'agent_finance_01' }),
      });
      expect(second.statusCode).toBe(409);

      const row = db.prepare('SELECT title FROM tasks WHERE id = ?').get('task_id_ganda');
      expect(row).toEqual({ title: 'Pertama' });
    });

    it('menolak agent_id yang tidak ada dengan 400, bukan 500', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: jsonHeaders,
        body: JSON.stringify({ title: 'Tanpa agen', agent_id: 'agen_tidak_ada' }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/tasks — pembatas halaman', () => {
    it('tanpa limit tetap mengembalikan seluruh baris; dengan limit mengembalikan objek halaman', async () => {
      const allRes = await app.inject({ method: 'GET', url: '/api/tasks', headers: authHeader });
      expect(allRes.statusCode).toBe(200);
      expect(Array.isArray(JSON.parse(allRes.body))).toBe(true);

      const pageRes = await app.inject({
        method: 'GET',
        url: '/api/tasks?limit=2&offset=0',
        headers: authHeader,
      });
      expect(pageRes.statusCode).toBe(200);
      const page = JSON.parse(pageRes.body);
      expect(page.items.length).toBeLessThanOrEqual(2);
      expect(page.total).toBeGreaterThan(page.items.length);
      expect(page.offset).toBe(0);
    });
  });

  describe('POST /api/tasks/:id/run — tanpa dua run bersamaan', () => {
    it('menolak 409 ketika task masih berjalan', async () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES ('task_running_ganda', 'Berjalan', '', 'agent_finance_01', 'normal', 'running', 'run_1', NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(now, now);

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/task_running_ganda/run',
        headers: authHeader,
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error).toBe('already_running');
    });
  });

  describe('Telegram Proactive Notifications on Task Status Transitions', () => {
    it('mengirim notifikasi Telegram saat status task di-PATCH menjadi done', async () => {
      telegramNotifications.clearSentNotificationsForTest();

      const taskId = `task_notif_done_${Date.now()}`;
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, 'Audit Laporan Pajak', '', 'agent_finance_01', 'normal', 'running', 'run_x', NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(taskId, now, now);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/tasks/${taskId}`,
        headers: jsonHeaders,
        body: JSON.stringify({
          status: 'done',
          result_md: 'Laporan pajak Q3 telah diverifikasi dan bebas sanksi.',
        }),
      });

      expect(res.statusCode).toBe(200);
      const sent = telegramNotifications.getSentNotifications();
      expect(sent.length).toBeGreaterThan(0);
      expect(sent[0].text).toContain('Tugas Selesai');
      expect(sent[0].text).toContain('Audit Laporan Pajak');
      expect(sent[0].text).toContain('Finance Agent');
      expect(sent[0].text).toContain('Laporan pajak Q3 telah diverifikasi');
    });

    it('mengirim notifikasi Telegram saat status task di-PATCH menjadi failed', async () => {
      telegramNotifications.clearSentNotificationsForTest();

      const taskId = `task_notif_fail_${Date.now()}`;
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, 'Sync Database Kantor', '', 'agent_finance_01', 'normal', 'running', 'run_y', NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(taskId, now, now);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/tasks/${taskId}`,
        headers: jsonHeaders,
        body: JSON.stringify({
          status: 'failed',
          result_md: 'Gagal terhubung ke host target database.',
        }),
      });

      expect(res.statusCode).toBe(200);
      const sent = telegramNotifications.getSentNotifications();
      expect(sent.length).toBeGreaterThan(0);
      expect(sent[0].text).toContain('Tugas Gagal');
      expect(sent[0].text).toContain('Sync Database Kantor');
      expect(sent[0].text).toContain('Gagal terhubung ke host target database.');
    });

    it('tidak mengirim notifikasi Telegram saat status tidak berubah', async () => {
      telegramNotifications.clearSentNotificationsForTest();

      const taskId = `task_notif_idle_${Date.now()}`;
      const now = Date.now();
      db.prepare(
        `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
         VALUES (?, 'Tugas Prioritas', '', 'agent_finance_01', 'normal', 'backlog', NULL, NULL, NULL, 123456789, ?, ?, 'manual', 0)`
      ).run(taskId, now, now);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/tasks/${taskId}`,
        headers: jsonHeaders,
        body: JSON.stringify({
          priority: 'urgent',
        }),
      });

      expect(res.statusCode).toBe(200);
      const sent = telegramNotifications.getSentNotifications();
      expect(sent.length).toBe(0);
    });
  });
});
