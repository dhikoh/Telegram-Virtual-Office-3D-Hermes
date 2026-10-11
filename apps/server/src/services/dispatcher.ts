import type Database from 'better-sqlite3';
import type { Agent, AgentNormalizedStatus } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { TaskRepository } from '../db/repositories/tasks.js';
import { ApprovalRepository } from '../db/repositories/approvals.js';
import { getHermesClientForAgent } from './hermes/index.js';
import { streamManager } from './stream.js';

export class OfficeDispatcher {
  private agentRepo: AgentRepository;
  private taskRepo: TaskRepository;
  private approvalRepo: ApprovalRepository;
  private agentStatuses = new Map<string, { status: AgentNormalizedStatus; tool?: string }>();
  private activeStreams = new Map<string, () => void>();
  private healthInterval: NodeJS.Timeout | null = null;

  constructor(private db: Database.Database) {
    this.agentRepo = new AgentRepository(db);
    this.taskRepo = new TaskRepository(db);
    this.approvalRepo = new ApprovalRepository(db);
    this.startPeriodicHealthChecks();
  }

  public getAgentStatus(agentId: string): { status: AgentNormalizedStatus; tool?: string } {
    return this.agentStatuses.get(agentId) || { status: 'idle' };
  }

  public setAgentStatus(agentId: string, status: AgentNormalizedStatus, tool?: string): void {
    this.agentStatuses.set(agentId, { status, tool });
    streamManager.broadcast({
      type: 'agent_status',
      agent_id: agentId,
      status,
      current_tool: tool,
      timestamp: Date.now(),
    });
  }

  public async runTask(taskId: string): Promise<{ run_id: string }> {
    const task = this.taskRepo.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const agent = this.agentRepo.getById(task.agent_id);
    if (!agent) throw new Error(`Agent ${task.agent_id} not found`);

    const client = getHermesClientForAgent(agent);
    const { run_id } = await client.startRun({
      input: task.description ? `${task.title}\n\n${task.description}` : task.title,
    });

    this.taskRepo.update(taskId, {
      status: 'running',
      run_id,
    });

    this.setAgentStatus(agent.id, 'thinking');

    // Subscribe to run events
    const unsubscribe = await client.streamEvents(run_id, (event, rawData) => {
      this.handleRunEvent(task.id, agent, run_id, event, rawData);
    });

    this.activeStreams.set(run_id, unsubscribe);
    return { run_id };
  }

  public async stopTask(taskId: string): Promise<void> {
    const task = this.taskRepo.getById(taskId);
    if (!task || !task.run_id) return;

    const agent = this.agentRepo.getById(task.agent_id);
    if (!agent) return;

    const client = getHermesClientForAgent(agent);
    await client.stopRun(task.run_id);

    const cleanup = this.activeStreams.get(task.run_id);
    if (cleanup) {
      cleanup();
      this.activeStreams.delete(task.run_id);
    }

    this.taskRepo.update(taskId, { status: 'cancelled' });
    this.setAgentStatus(agent.id, 'idle');
  }

  public async resolveApproval(approvalId: string, decision: 'approve' | 'deny', userId: number): Promise<void> {
    const approval = this.approvalRepo.getById(approvalId);
    if (!approval || approval.status !== 'pending') {
      throw new Error('Approval not found or already resolved');
    }

    const agent = this.agentRepo.getById(approval.agent_id);
    if (!agent) throw new Error('Agent not found');

    const client = getHermesClientForAgent(agent);
    await client.resolveApproval(approval.run_id, decision === 'approve' ? 'once' : 'deny');

    this.approvalRepo.resolve(approvalId, decision === 'approve' ? 'approved' : 'denied', userId);

    if (decision === 'approve') {
      this.setAgentStatus(agent.id, 'thinking');
    } else {
      this.setAgentStatus(agent.id, 'idle');
    }
  }

  private handleRunEvent(taskId: string, agent: Agent, runId: string, event: string, rawData: unknown): void {
    // Record into run_events table
    const data = (rawData || {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

    try {
      this.db
        .prepare('INSERT INTO run_events (run_id, agent_id, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)')
        .run(runId, agent.id, event, JSON.stringify(data), Date.now());
    } catch {
      // ignore insert failure
    }

    switch (event) {
      case 'tool.started':
        this.setAgentStatus(agent.id, 'working', data.tool);
        break;

      case 'tool.completed':
        this.setAgentStatus(agent.id, 'thinking');
        break;

      case 'approval.request': {
        const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        this.approvalRepo.create({
          id: approvalId,
          run_id: runId,
          agent_id: agent.id,
          summary: data.summary || 'Persetujuan diperlukan untuk eksekusi aksi agen',
          payload_json: JSON.stringify(data.payload || {}),
          status: 'pending',
          decided_by: null,
          decided_at: null,
          created_at: Date.now(),
        });
        this.taskRepo.update(taskId, { status: 'needs_approval' });
        this.setAgentStatus(agent.id, 'waiting_approval');
        streamManager.broadcast({
          type: 'approval_request',
          agent_id: agent.id,
          data: { approval_id: approvalId, run_id: runId },
          timestamp: Date.now(),
        });
        break;
      }

      case 'run.completed':
        this.taskRepo.update(taskId, {
          status: 'done',
          result_md: data.output || 'Tugas selesai dengan sukses.',
        });
        this.setAgentStatus(agent.id, 'idle');
        this.activeStreams.delete(runId);
        break;

      case 'run.failed':
        this.taskRepo.update(taskId, {
          status: 'failed',
          result_md: data.error || 'Eksekusi tugas gagal.',
        });
        this.setAgentStatus(agent.id, 'error');
        this.activeStreams.delete(runId);
        break;

      case 'run.cancelled':
        this.taskRepo.update(taskId, { status: 'cancelled' });
        this.setAgentStatus(agent.id, 'idle');
        this.activeStreams.delete(runId);
        break;
    }
  }

  private startPeriodicHealthChecks(): void {
    if (this.healthInterval) return;
    // Health check every 30s per Section 7 spec
    this.healthInterval = setInterval(async () => {
      const agents = this.agentRepo.getAll();
      for (const agent of agents) {
        if (!agent.active) continue;
        try {
          const client = getHermesClientForAgent(agent);
          await client.capabilities();
        } catch {
          this.setAgentStatus(agent.id, 'offline');
        }
      }
    }, 30000);
  }

  public destroy(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    for (const cancel of this.activeStreams.values()) {
      cancel();
    }
    this.activeStreams.clear();
  }
}
