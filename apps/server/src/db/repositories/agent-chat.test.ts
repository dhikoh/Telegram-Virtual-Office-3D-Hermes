import { describe, it, expect, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../migrator.js';
import { AgentChatRepository } from './agent-chat.js';

describe('AgentChatRepository (Fase 2e)', () => {
  let db: BetterSqlite3.Database;
  let repo: AgentChatRepository;
  const agentId = 'agent_test_1';

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new AgentChatRepository(db);

    // Seed agent
    db.prepare(
      `INSERT INTO agents (id, name, role, department, avatar, avatar_style, soul_summary,
       hermes_profile, model, active, hired_at, created_at)
       VALUES (?, 'Bagas', 'Staff', 'Tech', 'bot', '{}', 'summary', 'default', 'model-1', 1, ?, ?)`
    ).run(agentId, Date.now(), Date.now());
  });

  it('membuat run baru dan memperbarui statusnya saat selesai', () => {
    const run = repo.createRun({
      id: 'run_1',
      agent_id: agentId,
      session_id: 'session_1',
      client_message_id: 'c_msg_1',
      status: 'running',
      model: 'hermes-3',
    });

    expect(run.id).toBe('run_1');
    expect(run.status).toBe('running');

    repo.updateRunStatus('run_1', 'completed', null, Date.now());
    const updated = repo.getRun('run_1');
    expect(updated?.status).toBe('completed');
    expect(updated?.finished_at).toBeGreaterThan(0);
  });

  it('memperbarui status run saat gagal dengan error_reason', () => {
    repo.createRun({
      id: 'run_failed_1',
      agent_id: agentId,
      status: 'running',
    });

    repo.updateRunStatus('run_failed_1', 'failed', 'Gateway timeout', Date.now());
    const failedRun = repo.getRun('run_failed_1');
    expect(failedRun?.status).toBe('failed');
    expect(failedRun?.error_reason).toBe('Gateway timeout');
  });

  it('menyimpan pesan user dan potongan pesan assistant secara bertahap', () => {
    repo.createRun({
      id: 'run_stream_1',
      agent_id: agentId,
      status: 'running',
    });

    const userMsg = repo.createMessage({
      agent_id: agentId,
      run_id: 'run_stream_1',
      client_message_id: 'c_msg_2',
      role: 'user',
      content: 'Halo Bagas',
      status: 'completed',
    });
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('Halo Bagas');

    const asstMsg = repo.createMessage({
      agent_id: agentId,
      run_id: 'run_stream_1',
      client_message_id: 'c_msg_2',
      role: 'assistant',
      content: '',
      status: 'partial',
    });

    repo.updateMessageContent(asstMsg.id, 'Halo ');
    repo.updateMessageContent(asstMsg.id, 'Halo kawan, ');
    repo.updateMessageContent(asstMsg.id, 'Halo kawan, ada yang bisa dibantu?', 'completed');

    const finalized = repo.getMessage(asstMsg.id);
    expect(finalized?.content).toBe('Halo kawan, ada yang bisa dibantu?');
    expect(finalized?.status).toBe('completed');
  });

  it('menemukan pesan parsial yang belum selesai untuk tombol lanjutkan', () => {
    repo.createMessage({
      id: 'msg_u1',
      agent_id: agentId,
      role: 'user',
      content: 'Jelaskan arsitektur',
      status: 'completed',
    });

    repo.createMessage({
      id: 'msg_a1',
      agent_id: agentId,
      role: 'assistant',
      content: 'Arsitektur sistem terdiri dari layer...',
      status: 'partial',
    });

    const incomplete = repo.getLastIncompleteMessage(agentId);
    expect(incomplete).not.toBeNull();
    expect(incomplete?.id).toBe('msg_a1');
    expect(incomplete?.content).toBe('Arsitektur sistem terdiri dari layer...');
  });
});
