import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type AgentMessageStatus = 'partial' | 'completed' | 'failed';
export type AgentMessageRole = 'user' | 'assistant' | 'system';

export interface AgentRunRecord {
  id: string;
  agent_id: string;
  session_id: string | null;
  client_message_id: string | null;
  status: AgentRunStatus;
  error_reason: string | null;
  model: string | null;
  started_at: number;
  finished_at: number | null;
}

export interface AgentMessageRecord {
  id: string;
  agent_id: string;
  run_id: string | null;
  client_message_id: string | null;
  role: AgentMessageRole;
  content: string;
  status: AgentMessageStatus;
  created_at: number;
  updated_at: number;
}

export class AgentChatRepository {
  constructor(private db: Database.Database) {}

  public createRun(params: {
    id: string;
    agent_id: string;
    session_id?: string | null;
    client_message_id?: string | null;
    status: AgentRunStatus;
    model?: string | null;
    started_at?: number;
  }): AgentRunRecord {
    const startedAt = params.started_at ?? Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_runs (id, agent_id, session_id, client_message_id, status, error_reason, model, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.id,
        params.agent_id,
        params.session_id ?? null,
        params.client_message_id ?? null,
        params.status,
        null,
        params.model ?? null,
        startedAt,
        null
      );

    return {
      id: params.id,
      agent_id: params.agent_id,
      session_id: params.session_id ?? null,
      client_message_id: params.client_message_id ?? null,
      status: params.status,
      error_reason: null,
      model: params.model ?? null,
      started_at: startedAt,
      finished_at: null,
    };
  }

  public updateRunStatus(
    id: string,
    status: AgentRunStatus,
    errorReason: string | null = null,
    finishedAt: number = Date.now()
  ): void {
    this.db
      .prepare(
        `UPDATE agent_runs
         SET status = ?, error_reason = ?, finished_at = ?
         WHERE id = ?`
      )
      .run(status, errorReason, finishedAt, id);
  }

  public getRun(id: string): AgentRunRecord | null {
    const row = this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id);
    return (row as AgentRunRecord) || null;
  }

  public getRunByClientMessageId(agentId: string, clientMessageId: string): AgentRunRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM agent_runs WHERE agent_id = ? AND client_message_id = ? ORDER BY started_at DESC LIMIT 1'
      )
      .get(agentId, clientMessageId);
    return (row as AgentRunRecord) || null;
  }

  public createMessage(params: {
    id?: string;
    agent_id: string;
    run_id?: string | null;
    client_message_id?: string | null;
    role: AgentMessageRole;
    content: string;
    status?: AgentMessageStatus;
    created_at?: number;
  }): AgentMessageRecord {
    const id = params.id ?? `msg_${crypto.randomUUID()}`;
    const now = params.created_at ?? Date.now();
    const status = params.status ?? 'completed';

    this.db
      .prepare(
        `INSERT INTO agent_messages (id, agent_id, run_id, client_message_id, role, content, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.agent_id,
        params.run_id ?? null,
        params.client_message_id ?? null,
        params.role,
        params.content,
        status,
        now,
        now
      );

    return {
      id,
      agent_id: params.agent_id,
      run_id: params.run_id ?? null,
      client_message_id: params.client_message_id ?? null,
      role: params.role,
      content: params.content,
      status,
      created_at: now,
      updated_at: now,
    };
  }

  public updateMessageContent(
    id: string,
    content: string,
    status?: AgentMessageStatus,
    updatedAt: number = Date.now()
  ): void {
    if (status) {
      this.db
        .prepare('UPDATE agent_messages SET content = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(content, status, updatedAt, id);
    } else {
      this.db
        .prepare('UPDATE agent_messages SET content = ?, updated_at = ? WHERE id = ?')
        .run(content, updatedAt, id);
    }
  }

  public getMessage(id: string): AgentMessageRecord | null {
    const row = this.db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id);
    return (row as AgentMessageRecord) || null;
  }

  public getMessagesByAgent(agentId: string, limit = 100): AgentMessageRecord[] {
    return this.db
      .prepare(
        'SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY created_at ASC LIMIT ?'
      )
      .all(agentId, limit) as AgentMessageRecord[];
  }

  public getLastIncompleteMessage(agentId: string): AgentMessageRecord | null {
    // Ambil pesan asisten paling terakhir untuk agen ini
    const lastAsst = this.db
      .prepare(
        "SELECT * FROM agent_messages WHERE agent_id = ? AND role = 'assistant' ORDER BY created_at DESC, rowid DESC LIMIT 1"
      )
      .get(agentId) as AgentMessageRecord | undefined;

    if (lastAsst && lastAsst.status === 'partial') {
      return lastAsst;
    }
    return null;
  }

  public getMessagesByRun(runId: string): AgentMessageRecord[] {
    return this.db
      .prepare('SELECT * FROM agent_messages WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as AgentMessageRecord[];
  }
}
