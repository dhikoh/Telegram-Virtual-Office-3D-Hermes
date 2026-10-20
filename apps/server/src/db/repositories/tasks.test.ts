import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../migrator.js';
import { TaskRepository } from './tasks.js';
import { AgentRepository } from './agents.js';

describe('TaskRepository & Migration 012 (Tasks Visibility)', () => {
  let db: BetterSqlite3.Database;
  let taskRepo: TaskRepository;
  let agentRepo: AgentRepository;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    taskRepo = new TaskRepository(db);
    agentRepo = new AgentRepository(db);

    const now = Date.now();
    agentRepo.create({
      id: 'agent_task_test',
      name: 'Agent Tester',
      role: 'QA Engineer',
      department: 'command',
      avatar: '🤖',
      soul_summary: 'Testing tasks',
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

  it('migration 012 adds source and tool_calls_count columns with defaults and indexes', () => {
    const columns = db
      .prepare<unknown[], { name: string }>("PRAGMA table_info('tasks')")
      .all()
      .map((c) => c.name);

    expect(columns).toContain('source');
    expect(columns).toContain('tool_calls_count');

    const indexes = db
      .prepare<unknown[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((i) => i.name);

    expect(indexes).toContain('idx_tasks_run_id');
    expect(indexes).toContain('idx_tasks_source');
  });

  it('creates task with default source manual and tool_calls_count 0', () => {
    const now = Date.now();
    taskRepo.create({
      id: 'task_default_1',
      title: 'Manual Task',
      description: 'Dibuat manual',
      agent_id: 'agent_task_test',
      priority: 'normal',
      status: 'backlog',
      run_id: null,
      result_md: null,
      due_at: null,
      created_by: 1,
      created_at: now,
      updated_at: now,
      source: 'manual',
      tool_calls_count: 0,
    });

    const created = taskRepo.getById('task_default_1');
    expect(created).toBeDefined();
    expect(created?.source).toBe('manual');
    expect(created?.tool_calls_count).toBe(0);
  });

  it('supports source chat, getByRunId, and incrementToolCalls', () => {
    const now = Date.now();
    taskRepo.create({
      id: 'task_chat_1',
      title: 'Chat Auto-Task',
      description: 'Otomatis dibuat dari turn chat',
      agent_id: 'agent_task_test',
      priority: 'normal',
      status: 'running',
      run_id: 'run_chat_abc123',
      result_md: null,
      due_at: null,
      created_by: 1,
      created_at: now,
      updated_at: now,
      source: 'chat',
      tool_calls_count: 1,
    });

    // 1. getByRunId
    const found = taskRepo.getByRunId('run_chat_abc123');
    expect(found).toBeDefined();
    expect(found?.id).toBe('task_chat_1');
    expect(found?.source).toBe('chat');
    expect(found?.tool_calls_count).toBe(1);

    // 2. getByRunId not found
    expect(taskRepo.getByRunId('non_existent_run')).toBeNull();

    // 3. incrementToolCalls
    taskRepo.incrementToolCalls('task_chat_1', 2);
    const updated = taskRepo.getById('task_chat_1');
    expect(updated?.tool_calls_count).toBe(3);

    // 4. getBySource
    const chatTasks = taskRepo.getBySource('chat');
    expect(chatTasks.length).toBe(1);
    expect(chatTasks[0].id).toBe('task_chat_1');
  });
});
