import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../../db/migrator.js';
import { AgentRepository } from '../../db/repositories/agents.js';
import { TaskRepository } from '../../db/repositories/tasks.js';
import { ChatTaskMaterializer } from './task-materializer.js';

describe('ChatTaskMaterializer (Fase 4b — Task Visibility & Materialization)', () => {
  let db: BetterSqlite3.Database;
  let agentRepo: AgentRepository;
  let taskRepo: TaskRepository;
  let materializer: ChatTaskMaterializer;

  const AGENT_ID = 'agent_orion';

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    agentRepo = new AgentRepository(db);
    taskRepo = new TaskRepository(db);
    materializer = new ChatTaskMaterializer(db);

    const now = Date.now();
    agentRepo.create({
      id: AGENT_ID,
      name: 'Orion Boss',
      role: 'Orchestrator',
      department: 'command',
      avatar: '👑',
      soul_summary: 'Sistem orkestrasi.',
      hermes_base_url: 'http://127.0.0.1:8642',
      api_key_env: 'KEY',
      hermes_profile: 'default',
      active: 1,
      hired_at: now,
      created_at: now,
    });
  });

  afterEach(() => {
    db.close();
  });

  // Fix materialisasi (25 Okt 2026): aturan lama "obrolan biasa tidak pernah
  // dibuatkan task" adalah penyebab 10 run hanya menghasilkan 1 task. Sekarang
  // setiap run yang MENYELESAIKAN giliran menghasilkan tepat satu task.
  // completeTask tanpa konteks agen (pemanggil lama) tetap tidak mengarang task.
  it('casual chat yang selesai TANPA konteks agen tidak membuat task (perilaku lama)', () => {
    const res = materializer.completeTask('run_casual_123', 'Halo juga! Ada yang bisa dibantu?');
    expect(res).toBeNull();
    expect(taskRepo.getAll().length).toBe(0);
  });

  it('casual chat yang selesai DENGAN konteks agen membuat tepat satu task', () => {
    const res = materializer.completeTask('run_casual_ctx', 'Halo juga!', {
      userInput: 'Siapa namamu, perkenalkan dirimu',
      agentId: AGENT_ID,
      createdBy: 7,
    });

    expect(res).toBeDefined();
    expect(res?.run_id).toBe('run_casual_ctx');
    expect(res?.agent_id).toBe(AGENT_ID);
    expect(res?.source).toBe('chat');
    expect(res?.status).toBe('done');
    expect(res?.title).toBe('Siapa namamu, perkenalkan dirimu');
    expect(res?.result_md).toBe('Halo juga!');
    expect(res?.created_by).toBe(7);
    expect(res?.tool_calls_count).toBe(0);

    // Tepat satu task, bukan dua.
    expect(taskRepo.getAll().length).toBe(1);
  });

  it('run yang sudah punya task (lewat tool) tidak digandakan saat selesai', () => {
    const runId = 'run_tool_then_done';
    const fromTool = materializer.recordToolCall({
      runId,
      agentId: AGENT_ID,
      userInput: 'Cari prospek',
      toolName: 'search_prospects',
    });
    expect(fromTool.tool_calls_count).toBe(1);

    const completed = materializer.completeTask(runId, 'Ditemukan 12 prospek.', {
      userInput: 'Cari prospek',
      agentId: AGENT_ID,
    });

    expect(completed?.id).toBe(fromTool.id);
    expect(completed?.status).toBe('done');
    expect(taskRepo.getAll().length).toBe(1);
  });

  it('completeTask dua kali untuk run yang sama tidak membuat task kedua', () => {
    const runId = 'run_double_complete';
    materializer.completeTask(runId, 'jawaban', { userInput: 'halo', agentId: AGENT_ID });
    materializer.completeTask(runId, 'jawaban lagi', { userInput: 'halo', agentId: AGENT_ID });
    expect(taskRepo.getAll().length).toBe(1);
  });

  it('turn yang gagal sebelum tool pertama tidak membuat task', () => {
    const failed = materializer.failTask('run_fail_before_tool', 'gateway mati');
    expect(failed).toBeNull();
    expect(taskRepo.getAll().length).toBe(0);
  });

  it('first tool call materializes a task with source chat, status running, and tool_calls_count 1', () => {
    const runId = 'run_tool_abc';
    const task = materializer.recordToolCall({
      runId,
      agentId: AGENT_ID,
      userInput: 'Tolong buatkan ringkasan keuangan kuartal 3',
      toolName: 'generate_financial_report',
      preview: '{"quarter": "Q3"}',
      createdBy: 42,
    });

    expect(task).toBeDefined();
    expect(task.source).toBe('chat');
    expect(task.status).toBe('running');
    expect(task.tool_calls_count).toBe(1);
    expect(task.run_id).toBe(runId);
    expect(task.agent_id).toBe(AGENT_ID);
    expect(task.title).toBe('Tolong buatkan ringkasan keuangan kuartal 3');
    expect(task.created_by).toBe(42);

    const fromDb = taskRepo.getByRunId(runId);
    expect(fromDb).toBeDefined();
    expect(fromDb?.id).toBe(task.id);
    expect(fromDb?.source).toBe('chat');
    expect(fromDb?.status).toBe('running');
    expect(fromDb?.tool_calls_count).toBe(1);
  });

  it('subsequent tool calls on the same run increment tool_calls_count without creating new tasks', () => {
    const runId = 'run_multi_tools';

    // 1. Tool call ke-1
    const task1 = materializer.recordToolCall({
      runId,
      agentId: AGENT_ID,
      userInput: 'Cari data prospek dan kirim email',
      toolName: 'search_prospects',
    });
    expect(task1.tool_calls_count).toBe(1);

    // 2. Tool call ke-2
    const task2 = materializer.recordToolCall({
      runId,
      agentId: AGENT_ID,
      toolName: 'filter_leads',
    });
    expect(task2.id).toBe(task1.id);
    expect(task2.tool_calls_count).toBe(2);

    // 3. Tool call ke-3
    const task3 = materializer.recordToolCall({
      runId,
      agentId: AGENT_ID,
      toolName: 'send_email',
    });
    expect(task3.id).toBe(task1.id);
    expect(task3.tool_calls_count).toBe(3);

    // Tetap hanya 1 task yang tercatat di DB
    const allTasks = taskRepo.getAll();
    expect(allTasks.length).toBe(1);
    expect(allTasks[0].tool_calls_count).toBe(3);
  });

  it('completeTask transitions task status to done and records result_md', () => {
    const runId = 'run_complete_test';
    materializer.recordToolCall({
      runId,
      agentId: AGENT_ID,
      userInput: 'Analisis performa server',
      toolName: 'system_metrics',
    });

    const completed = materializer.completeTask(runId, 'CPU 20%, Memory 45%, Normal.');
    expect(completed).toBeDefined();
    expect(completed?.status).toBe('done');
    expect(completed?.result_md).toBe('CPU 20%, Memory 45%, Normal.');

    const fromDb = taskRepo.getByRunId(runId);
    expect(fromDb?.status).toBe('done');
    expect(fromDb?.result_md).toBe('CPU 20%, Memory 45%, Normal.');
  });

  it('failTask transitions task status to failed and records error message', () => {
    const runId = 'run_fail_test';
    materializer.recordToolCall({
      runId,
      agentId: AGENT_ID,
      userInput: 'Deploy ke production',
      toolName: 'deploy_service',
    });

    const failed = materializer.failTask(runId, 'Koneksi timeout ke cluster host.');
    expect(failed).toBeDefined();
    expect(failed?.status).toBe('failed');
    expect(failed?.result_md).toBe('Koneksi timeout ke cluster host.');

    const fromDb = taskRepo.getByRunId(runId);
    expect(fromDb?.status).toBe('failed');
    expect(fromDb?.result_md).toBe('Koneksi timeout ke cluster host.');
  });
});
