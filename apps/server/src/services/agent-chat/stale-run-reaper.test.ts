/**
 * Fix run nyangkut — test reaper.
 *
 * Kebenaran yang dijaga:
 *  - Run 'running' yang sudah melewati ambang 30 menit ditutup menjadi
 *    'interrupted' dengan finished_at terisi.
 *  - Run yang masih muda TIDAK disentuh (chatTimeoutMs hanya 300 detik —
 *    ambang 30 menit sengaja jauh di atasnya).
 *  - Idempoten: memanggil dua kali tidak mengubah apa pun.
 *  - Run yang sudah terminal ('completed'/'failed'/'interrupted') tidak dipilih.
 *  - `interruptAgentRuns` menutup run agen itu SAAT stream ditutup, tanpa
 *    ambang, dan tidak menyentuh run agen lain.
 *  - `excludeRunId` melindungi run yang sedang disambung-ulang.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../../db/migrator.js';
import {
  STALE_RUN_MS,
  findStaleRuns,
  reapStaleRuns,
  interruptAgentRuns,
} from './stale-run-reaper.js';

const NOW = 1_800_000_000_000;

let db: BetterSqlite3.Database;

const seedAgent = (id: string) => {
  db.prepare(
    `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
       hermes_profile, active, hired_at, created_at)
     VALUES (?, ?, 'anggota', 'Tech', 'bot', '{}', 'ringkas', 'default', 1, ?, ?)`
  ).run(id, `Agen ${id}`, NOW, NOW);
};

const seedRun = (
  id: string,
  agentId: string,
  opts: { status?: string; startedAt?: number; finishedAt?: number } = {}
) => {
  db.prepare(
    `INSERT INTO agent_runs (id, agent_id, session_id, client_message_id, status, error_reason, model, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'm1', ?, ?)`
  ).run(
    id,
    agentId,
    `sess_${id}`,
    `cm_${id}`,
    opts.status ?? 'running',
    opts.startedAt ?? NOW,
    opts.finishedAt ?? null
  );
};

const readRun = (id: string) =>
  db.prepare('SELECT status, finished_at, error_reason FROM agent_runs WHERE id = ?').get(id) as {
    status: string;
    finished_at: number | null;
    error_reason: string | null;
  };

beforeEach(() => {
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  seedAgent('agent_a');
  seedAgent('agent_b');
});

afterEach(() => {
  db.close();
});

describe('findStaleRuns', () => {
  it('hanya memilih run "running" yang sudah melewati ambang', () => {
    seedRun('run_muda', 'agent_a', { startedAt: NOW - 1000 });
    seedRun('run_tua', 'agent_a', { startedAt: NOW - STALE_RUN_MS - 1000 });
    seedRun('run_tepat', 'agent_a', { startedAt: NOW - STALE_RUN_MS });

    const found = findStaleRuns(db, NOW);
    expect(found.map((r) => r.id)).toEqual(['run_tua']);
  });

  it('run yang sudah terminal tidak pernah dipilih', () => {
    seedRun('run_done', 'agent_a', { status: 'completed', startedAt: NOW - STALE_RUN_MS * 4 });
    seedRun('run_failed', 'agent_a', { status: 'failed', startedAt: NOW - STALE_RUN_MS * 4 });
    seedRun('run_int', 'agent_a', { status: 'interrupted', startedAt: NOW - STALE_RUN_MS * 4 });
    expect(findStaleRuns(db, NOW)).toEqual([]);
  });
});

describe('reapStaleRuns', () => {
  it('menutup run nyangkut menjadi interrupted dengan finished_at', () => {
    seedRun('run_tua', 'agent_a', { startedAt: NOW - STALE_RUN_MS - 5000 });

    const result = reapStaleRuns(db, { now: NOW });
    expect(result.dryRun).toBe(false);
    expect(result.closed.map((r) => r.id)).toEqual(['run_tua']);

    const row = readRun('run_tua');
    expect(row.status).toBe('interrupted');
    expect(row.finished_at).toBe(NOW);
    expect(row.error_reason).toContain('ditinggalkan');
  });

  it('run yang masih muda tidak disentuh', () => {
    seedRun('run_muda', 'agent_a', { startedAt: NOW - 60_000 });
    const result = reapStaleRuns(db, { now: NOW });
    expect(result.closed).toEqual([]);
    expect(readRun('run_muda').status).toBe('running');
    expect(readRun('run_muda').finished_at).toBeNull();
  });

  it('dry-run menghitung tanpa menulis', () => {
    seedRun('run_tua', 'agent_a', { startedAt: NOW - STALE_RUN_MS - 5000 });
    const result = reapStaleRuns(db, { now: NOW, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.closed).toHaveLength(1);
    // Tidak ada tulisan sama sekali.
    expect(readRun('run_tua').status).toBe('running');
    expect(readRun('run_tua').finished_at).toBeNull();
  });

  it('idempoten — dipanggil dua kali tidak menggandakan atau mengubah', () => {
    seedRun('run_tua', 'agent_a', { startedAt: NOW - STALE_RUN_MS - 5000 });
    reapStaleRuns(db, { now: NOW });
    const afterFirst = readRun('run_tua');

    const second = reapStaleRuns(db, { now: NOW + 60_000 });
    expect(second.closed).toEqual([]);
    expect(readRun('run_tua')).toEqual(afterFirst);
  });

  it('batch besar ditutup dalam satu transaksi (semua atau tidak ada)', () => {
    for (let i = 0; i < 12; i++) {
      seedRun(`run_${i}`, i % 2 === 0 ? 'agent_a' : 'agent_b', {
        startedAt: NOW - STALE_RUN_MS - 1000 * (i + 1),
      });
    }
    const result = reapStaleRuns(db, { now: NOW });
    expect(result.closed).toHaveLength(12);
    const stillRunning = db
      .prepare("SELECT COUNT(*) AS c FROM agent_runs WHERE status = 'running'")
      .get() as { c: number };
    expect(stillRunning.c).toBe(0);
  });
});

describe('interruptAgentRuns (SSE close)', () => {
  it('menutup run agen itu tanpa menunggu ambang 30 menit', () => {
    // Baru mulai 5 detik lalu — tetap ditutup, karena panel sudah ditutup.
    seedRun('run_baru', 'agent_a', { startedAt: NOW - 5000 });

    const closed = interruptAgentRuns(db, 'agent_a', { now: NOW });
    expect(closed.map((r) => r.id)).toEqual(['run_baru']);
    expect(readRun('run_baru').status).toBe('interrupted');
    expect(readRun('run_baru').finished_at).toBe(NOW);
  });

  it('tidak menyentuh run milik agen lain', () => {
    seedRun('run_a', 'agent_a', { startedAt: NOW - 5000 });
    seedRun('run_b', 'agent_b', { startedAt: NOW - 5000 });

    interruptAgentRuns(db, 'agent_a', { now: NOW });
    expect(readRun('run_a').status).toBe('interrupted');
    expect(readRun('run_b').status).toBe('running');
  });

  it('excludeRunId melindungi run yang sedang disambung-ulang', () => {
    seedRun('run_reattach', 'agent_a', { startedAt: NOW - 5000 });
    seedRun('run_lain', 'agent_a', { startedAt: NOW - 6000 });

    const closed = interruptAgentRuns(db, 'agent_a', {
      now: NOW,
      excludeRunId: 'run_reattach',
    });
    expect(closed.map((r) => r.id)).toEqual(['run_lain']);
    expect(readRun('run_reattach').status).toBe('running');
  });

  it('idempoten — run yang sudah interrupted tidak dipilih lagi', () => {
    seedRun('run_x', 'agent_a', { startedAt: NOW - 5000 });
    interruptAgentRuns(db, 'agent_a', { now: NOW });
    const after = readRun('run_x');
    expect(interruptAgentRuns(db, 'agent_a', { now: NOW + 1000 })).toEqual([]);
    expect(readRun('run_x')).toEqual(after);
  });

  it('agen tanpa run aktif tidak menghasilkan apa pun', () => {
    expect(interruptAgentRuns(db, 'agent_a', { now: NOW })).toEqual([]);
  });
});
