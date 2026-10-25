/**
 * Backfill run & task (Fix Run Reliability) — test.
 *
 * Kebenaran yang dijaga:
 *  - Run nyangkut 'running' ditutup lebih dulu, sebelum task dibuat.
 *  - Run terminal tanpa task → tepat satu task dibuat dari run_events.
 *  - Run yang sudah punya task TIDAK digandakan (idempoten).
 *  - Run gagal tanpa isi apa pun dilewati, bukan dikarang.
 *  - agent_messages assistant yang hilang diisi sekali.
 *  - dry-run tidak menulis apa pun.
 *  - Sesi lama tanpa run dicatat sebagai OPEN QUESTION, bukan ditebak.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../apps/server/src/db/migrator.js';
import { runBackfillRuns, LEGACY_SESSIONS } from './backfill-runs.js';

// Ambang reaper memakai Date.now() sungguhan, jadi benih waktu run harus
// relatif terhadap sekarang — bukan angka tetap yang akan selalu "baru".
const NOW = Date.now();
const STALE_AGE_MS = 40 * 60 * 1000;

let db: BetterSqlite3.Database;

const seedAgent = (id: string) => {
  db.prepare(
    `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
       hermes_profile, active, hired_at, created_at)
     VALUES (?, ?, 'Distributor', 'marketing', 'bot', '{}', 'Menjual zeolit.', 'default', 1, ?, ?)`
  ).run(id, `Agen ${id}`, NOW, NOW);
};

const seedRun = (
  id: string,
  agentId: string,
  opts: { status?: string; startedAt?: number; sessionId?: string | null } = {}
) => {
  db.prepare(
    `INSERT INTO agent_runs (id, agent_id, session_id, client_message_id, status, error_reason,
       model, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'm1', ?, ?)`
  ).run(
    id,
    agentId,
    opts.sessionId ?? null,
    `cm_${id}`,
    opts.status ?? 'completed',
    opts.startedAt ?? NOW,
    opts.status === 'running' ? null : NOW + 1000
  );
};

const seedEvent = (runId: string, agentId: string, type: string, payload: unknown, ts = NOW) => {
  db.prepare(
    'INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)'
  ).run(runId, agentId, type, JSON.stringify(payload), ts);
};

const taskCount = () =>
  (db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number }).c;

beforeEach(() => {
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  seedAgent('agent_bagas');
  seedAgent('agent_aura');
});

afterEach(() => {
  db.close();
});

describe('backfill:runs', () => {
  it('run nyangkut ditutup lebih dulu, sebelum task dibuat', () => {
    seedRun('run_stale', 'agent_bagas', {
      status: 'running',
      startedAt: NOW - STALE_AGE_MS,
    });

    const result = runBackfillRuns({ dryRun: false, db });
    expect(result.runsClosed).toBe(1);
    expect(result.items.some((i) => i.action === 'run_closed')).toBe(true);

    const row = db
      .prepare('SELECT status, finished_at FROM agent_runs WHERE id = ?')
      .get('run_stale') as { status: string; finished_at: number | null };
    expect(row.status).toBe('interrupted');
    expect(row.finished_at).toBeGreaterThan(0);
  });

  it('run selesai tanpa task menghasilkan tepat satu task dari run_events', () => {
    seedRun('run_done', 'agent_bagas');
    seedEvent('run_done', 'agent_bagas', 'run.started', { client_message_id: 'cm_run_done' });
    seedEvent('run_done', 'agent_bagas', 'message.delta', { delta: 'Saya Bagas, ' });
    seedEvent('run_done', 'agent_bagas', 'message.delta', { delta: 'distributor zeolit.' });
    seedEvent('run_done', 'agent_bagas', 'run.completed', {});

    const result = runBackfillRuns({ dryRun: false, db });
    expect(result.tasksCreated).toBe(1);

    const task = db
      .prepare('SELECT title, status, source, run_id, result_md, tool_calls_count FROM tasks')
      .get() as {
      title: string;
      status: string;
      source: string;
      run_id: string;
      result_md: string;
      tool_calls_count: number;
    };
    expect(task.run_id).toBe('run_done');
    expect(task.status).toBe('done');
    expect(task.source).toBe('chat');
    expect(task.result_md).toBe('Saya Bagas, distributor zeolit.');
    expect(task.tool_calls_count).toBe(0);
    // Tanpa pesan user tercatat, judul jatuh ke jawaban assistant.
    expect(task.title).toContain('Saya Bagas');
  });

  it('judul task memakai pesan user bila tersedia', () => {
    seedRun('run_with_user', 'agent_bagas');
    seedEvent('run_with_user', 'agent_bagas', 'run.started', {
      client_message_id: 'cm_run_with_user',
    });
    db.prepare(
      `INSERT INTO agent_messages (id, agent_id, run_id, client_message_id, role, content,
         status, created_at, updated_at)
       VALUES ('msg_u1', 'agent_bagas', 'run_with_user', 'cm_run_with_user', 'user',
               'Siapa namamu, perkenalkan dirimu', 'completed', ?, ?)`
    ).run(NOW, NOW);
    seedEvent('run_with_user', 'agent_bagas', 'message.delta', { delta: 'Saya Bagas.' });
    seedEvent('run_with_user', 'agent_bagas', 'run.completed', {});

    runBackfillRuns({ dryRun: false, db });
    const task = db.prepare('SELECT title FROM tasks').get() as { title: string };
    expect(task.title).toBe('Siapa namamu, perkenalkan dirimu');
  });

  it('run yang sudah punya task tidak digandakan (idempoten)', () => {
    seedRun('run_has_task', 'agent_bagas');
    seedEvent('run_has_task', 'agent_bagas', 'message.delta', { delta: 'jawaban' });
    seedEvent('run_has_task', 'agent_bagas', 'run.completed', {});
    db.prepare(
      `INSERT INTO tasks (id, title, description, agent_id, priority, status, run_id, result_md,
         due_at, created_by, created_at, updated_at, source, tool_calls_count)
       VALUES ('task_lama', 'Tugas lama', '', 'agent_bagas', 'normal', 'done', 'run_has_task',
               'sudah ada', NULL, 1, ?, ?, 'chat', 1)`
    ).run(NOW, NOW);

    const result = runBackfillRuns({ dryRun: false, db });
    expect(result.tasksCreated).toBe(0);
    expect(result.items.some((i) => i.action === 'task_exists')).toBe(true);
    expect(taskCount()).toBe(1);
  });

  it('backfill dua kali tidak menggandakan task', () => {
    seedRun('run_twice', 'agent_bagas');
    seedEvent('run_twice', 'agent_bagas', 'message.delta', { delta: 'jawaban' });
    seedEvent('run_twice', 'agent_bagas', 'run.completed', {});

    runBackfillRuns({ dryRun: false, db });
    runBackfillRuns({ dryRun: false, db });
    expect(taskCount()).toBe(1);
  });

  it('run gagal tanpa isi dilewati, tidak dikarang', () => {
    seedRun('run_empty_fail', 'agent_bagas', { status: 'failed' });

    const result = runBackfillRuns({ dryRun: false, db });
    expect(result.tasksCreated).toBe(0);
    expect(result.items.some((i) => i.action === 'skipped')).toBe(true);
    expect(taskCount()).toBe(0);
  });

  it('run gagal yang punya jawaban parsial tetap dimaterialkan sebagai failed', () => {
    seedRun('run_partial_fail', 'agent_bagas', { status: 'failed' });
    seedEvent('run_partial_fail', 'agent_bagas', 'message.delta', { delta: 'separuh jawaban' });
    seedEvent('run_partial_fail', 'agent_bagas', 'run.failed', { error: 'timeout' });

    runBackfillRuns({ dryRun: false, db });
    const task = db.prepare('SELECT status, result_md FROM tasks').get() as {
      status: string;
      result_md: string;
    };
    expect(task.status).toBe('failed');
    expect(task.result_md).toBe('separuh jawaban');
  });

  it('agent_messages assistant yang hilang diisi sekali', () => {
    seedRun('run_msg', 'agent_bagas');
    seedEvent('run_msg', 'agent_bagas', 'run.started', { client_message_id: 'cm_run_msg' });
    seedEvent('run_msg', 'agent_bagas', 'message.delta', { delta: 'jawaban lengkap' });
    seedEvent('run_msg', 'agent_bagas', 'run.completed', {});

    const first = runBackfillRuns({ dryRun: false, db });
    expect(first.messagesCreated).toBe(1);

    const second = runBackfillRuns({ dryRun: false, db });
    expect(second.messagesCreated).toBe(0);

    const msgs = db
      .prepare("SELECT role, content, status FROM agent_messages WHERE run_id = 'run_msg'")
      .all() as { role: string; content: string; status: string }[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].content).toBe('jawaban lengkap');
    expect(msgs[0].status).toBe('completed');
  });

  it('dry-run tidak menulis apa pun', () => {
    seedRun('run_dry', 'agent_bagas');
    seedEvent('run_dry', 'agent_bagas', 'message.delta', { delta: 'jawaban' });
    seedEvent('run_dry', 'agent_bagas', 'run.completed', {});

    const result = runBackfillRuns({ dryRun: true, db });
    expect(result.dryRun).toBe(true);
    // Menghitung, tapi tidak menulis.
    expect(result.tasksCreated).toBe(0);
    expect(taskCount()).toBe(0);
    const done = db
      .prepare('SELECT status, finished_at FROM agent_runs WHERE id = ?')
      .get('run_dry') as { status: string; finished_at: number | null };
    expect(done.status).toBe('completed');
  });

  it('dry-run menghitung run nyangkut tanpa menutupnya', () => {
    seedRun('run_dry_stale', 'agent_bagas', {
      status: 'running',
      startedAt: NOW - STALE_AGE_MS,
    });

    const result = runBackfillRuns({ dryRun: true, db });
    expect(result.runsClosed).toBe(1);

    const stale = db
      .prepare('SELECT status, finished_at FROM agent_runs WHERE id = ?')
      .get('run_dry_stale') as { status: string; finished_at: number | null };
    expect(stale.status).toBe('running');
    expect(stale.finished_at).toBeNull();
  });

  it('sesi lama tanpa run dicatat sebagai OPEN QUESTION, bukan ditebak', () => {
    seedRun('run_known', 'agent_bagas', { sessionId: LEGACY_SESSIONS[0] });
    seedEvent('run_known', 'agent_bagas', 'message.delta', { delta: 'jawaban Orion' });
    seedEvent('run_known', 'agent_bagas', 'run.completed', {});

    const result = runBackfillRuns({ dryRun: false, db });
    expect(result.sessionsWithoutRuns).toEqual([LEGACY_SESSIONS[1], LEGACY_SESSIONS[2]]);
    // Sesi tanpa run tidak menghasilkan baris karangan — hanya run nyata
    // yang punya run_events yang dimaterialkan.
    expect(taskCount()).toBe(1);
  });

  it('beberapa run lama menghasilkan task tanpa duplikat (regresi 10 run)', () => {
    // 10 run: 7 nyangkut, 3 selesai — bentuk persis bukti produksi.
    for (let i = 0; i < 7; i++) {
      seedRun(`run_stale_${i}`, i % 2 === 0 ? 'agent_bagas' : 'agent_aura', {
        status: 'running',
        startedAt: NOW - STALE_AGE_MS - i * 60 * 1000,
      });
    }
    for (let i = 0; i < 3; i++) {
      seedRun(`run_done_${i}`, 'agent_bagas');
      seedEvent(`run_done_${i}`, 'agent_bagas', 'message.delta', { delta: `jawaban ${i}` });
      seedEvent(`run_done_${i}`, 'agent_bagas', 'run.completed', {});
    }

    const result = runBackfillRuns({ dryRun: false, db });
    expect(result.runsClosed).toBe(7);
    expect(result.tasksCreated).toBe(3);
    expect(taskCount()).toBe(3);

    // Tidak ada run 'running' tertinggal, dan tidak ada run_id ganda di tasks.
    const stillRunning = db
      .prepare("SELECT COUNT(*) AS c FROM agent_runs WHERE status = 'running'")
      .get() as { c: number };
    expect(stillRunning.c).toBe(0);
    const dupes = db
      .prepare('SELECT run_id, COUNT(*) AS c FROM tasks GROUP BY run_id HAVING c > 1')
      .all();
    expect(dupes).toEqual([]);
  });
});
