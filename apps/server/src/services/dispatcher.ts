import type Database from 'better-sqlite3';
import type { Agent, AgentNormalizedStatus, TaskArtifact } from '@hermes-office/shared';
import { AgentRepository } from '../db/repositories/agents.js';
import { TaskRepository } from '../db/repositories/tasks.js';
import { ApprovalRepository } from '../db/repositories/approvals.js';
import { getHermesClientForAgent } from './hermes/index.js';
import { streamManager } from './stream.js';
import { telegramNotifications } from './notifications.js';
import { listTaskArtifacts, registerRunArtifacts } from './artifacts.js';

/**
 * Status tempat artefak run relevan untuk konsumen SSE — hanya saat itu
 * `task_update.artifacts` ikut disiarkan (lihat services/artifacts.ts).
 */
const TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set(['done', 'failed']);

/** Acara run yang diakhiri dispatcher sendiri (updateTask sudah mem-broadcast). */
const TERMINAL_RUN_EVENTS: ReadonlySet<string> = new Set([
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

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

  /**
   * Tahap 7: every task status change is broadcast to the office stream so the
   * board updates live instead of only on reload (Rule S6 transport contract).
   */
  public updateTask(taskId: string, updates: Parameters<TaskRepository['update']>[1]): void {
    this.taskRepo.update(taskId, updates);
    const task = this.taskRepo.getById(taskId);
    if (!task) return;
    streamManager.broadcast({
      type: 'task_update',
      agent_id: task.agent_id,
      task: {
        id: task.id,
        status: task.status,
        title: task.title,
        agent_id: task.agent_id,
        result_md: task.result_md,
        updated_at: task.updated_at,
        // Artefak otomatis: hanya pada status terminal, supaya konsumen SSE tahu
        // berkas mana yang bisa diunduh tepat saat run selesai (lihat services/artifacts.ts).
        ...(TERMINAL_TASK_STATUSES.has(task.status)
          ? { artifacts: this.taskArtifacts(task.id) }
          : {}),
      },
      timestamp: Date.now(),
    });

    // Tahap 14 — rantai proyek: satu-satunya funnel status task, jadi hook
    // ketergantungan subtask disambung ke sini (tanpa polling, tanpa listener
    // SSE tambahan). Kegagalan hook tidak boleh merusak update task biasa.
    if (this.onTaskSettled && (task.status === 'done' || task.status === 'failed')) {
      try {
        void this.onTaskSettled(taskId);
      } catch {
        /* hook rantai gagal — biarkan task biasa tetap selesai */
      }
    }
  }

  /** Tahap 14 — disetel server.ts ke ProjectService.handleSettled. */
  public onTaskSettled?: (taskId: string) => void;

  /** Satu baris per artefak task (kosong bila tidak ada) — dipakai broadcast & API. */
  private taskArtifacts(taskId: string): TaskArtifact[] {
    try {
      return listTaskArtifacts(this.db, [taskId]).get(taskId) ?? [];
    } catch {
      return [];
    }
  }

  public async runTask(taskId: string): Promise<{ run_id: string }> {
    const task = this.taskRepo.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const agent = this.agentRepo.getById(task.agent_id);
    if (!agent) throw new Error(`Agent ${task.agent_id} not found`);

    const client = getHermesClientForAgent(agent, this.db);
    let run_id: string;

    try {
      const res = await client.startRun({
        input: task.description ? `${task.title}\n\n${task.description}` : task.title,
      });
      run_id = res.run_id;
    } catch (err: unknown) {
      this.setAgentStatus(agent.id, 'offline');
      this.updateTask(taskId, {
        status: 'failed',
        result_md: `Hermes connection error: ${(err as Error)?.message || err}`,
      });
      throw err;
    }

    this.updateTask(taskId, {
      status: 'running',
      run_id,
    });

    this.setAgentStatus(agent.id, 'thinking');

    // Subscribe to run events with drop recovery
    this.subscribeRunEvents(task.id, agent, run_id, client);

    return { run_id };
  }

  private subscribeRunEvents(
    taskId: string,
    agent: Agent,
    runId: string,
    client: ReturnType<typeof getHermesClientForAgent>
  ): void {
    let runFinished = false;
    let retries = 0;
    const maxRetries = 5;

    const onEvent = (event: string, rawData: unknown) => {
      if (event === 'stream.dropped') {
        if (!runFinished) {
          handleDrop();
        }
        return;
      }
      if (event === 'run.completed' || event === 'run.failed' || event === 'run.cancelled') {
        runFinished = true;
      }
      this.handleRunEvent(taskId, agent, runId, event, rawData);
    };

    const attemptConnect = async () => {
      try {
        const unsubscribe = await client.streamEvents(runId, onEvent);
        this.activeStreams.set(runId, () => {
          runFinished = true;
          unsubscribe();
        });
      } catch {
        handleDrop();
      }
    };

    const handleDrop = async () => {
      if (runFinished) return;

      if (retries < maxRetries) {
        retries++;
        const delay = Math.min(10 * Math.pow(2, retries - 1), 200);
        setTimeout(async () => {
          if (runFinished) return;
          await attemptConnect();
        }, delay);
        return;
      }

      // Retries exhausted: recover final state via GET /v1/runs/{id}
      try {
        const statusObj = await client.getRunStatus(runId);
        if (statusObj.status === 'completed') {
          runFinished = true;
          this.handleRunEvent(taskId, agent, runId, 'run.completed', {
            output: statusObj.output || 'Tugas selesai.',
          });
          return;
        }
        if (statusObj.status === 'failed') {
          runFinished = true;
          this.handleRunEvent(taskId, agent, runId, 'run.failed', {
            error: 'Hermes execution failed',
          });
          return;
        }
        if (statusObj.status === 'cancelled') {
          runFinished = true;
          this.handleRunEvent(taskId, agent, runId, 'run.cancelled', {});
          return;
        }
      } catch {
        // Status polling also failed
      }

      // If status could not be recovered, fail cleanly so agent never stays stuck
      runFinished = true;
      this.handleRunEvent(taskId, agent, runId, 'run.failed', {
        error: 'SSE connection dropped mid-run and status could not be recovered',
      });
    };

    attemptConnect();
  }

  public async stopTask(taskId: string): Promise<void> {
    const task = this.taskRepo.getById(taskId);
    if (!task || !task.run_id) return;

    const agent = this.agentRepo.getById(task.agent_id);
    if (!agent) return;

    const client = getHermesClientForAgent(agent, this.db);
    await client.stopRun(task.run_id);

    const cleanup = this.activeStreams.get(task.run_id);
    if (cleanup) {
      cleanup();
      this.activeStreams.delete(task.run_id);
    }

    this.updateTask(taskId, { status: 'cancelled' });
    this.setAgentStatus(agent.id, 'idle');
  }

  public async resolveApproval(approvalId: string, decision: 'approve' | 'deny', userId: number): Promise<void> {
    const approval = this.approvalRepo.getById(approvalId);
    if (!approval || approval.status !== 'pending') {
      throw new Error('Approval not found or already resolved');
    }

    const agent = this.agentRepo.getById(approval.agent_id);
    if (!agent) throw new Error('Agent not found');

    const client = getHermesClientForAgent(agent, this.db);
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

    // Artefak otomatis (wiring Tahap 12) — deteksi keluaran berkas di stream run,
    // simpan lewat saveMedia() supaya retensi Tahap 12 ikut berlaku. Gagal di sini
    // TIDAK BOLEH merusak run: registerRunArtifacts menelan kegagalannya sendiri
    // dan hasilnya dicatat audit, bukan dikarang.
    this.captureRunArtifacts(taskId, agent, runId, event, data);

    switch (event) {
      case 'tool.started':
        this.setAgentStatus(agent.id, 'working', data.tool);
        break;

      case 'tool.completed':
        this.setAgentStatus(agent.id, 'thinking');
        break;

      case 'approval.request': {
        const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const summary = data.summary || 'Persetujuan diperlukan untuk eksekusi aksi agen';
        this.approvalRepo.create({
          id: approvalId,
          run_id: runId,
          agent_id: agent.id,
          summary,
          payload_json: JSON.stringify(data.payload || {}),
          status: 'pending',
          decided_by: null,
          decided_at: null,
          created_at: Date.now(),
        });
        this.updateTask(taskId, { status: 'needs_approval' });
        this.setAgentStatus(agent.id, 'waiting_approval');
        streamManager.broadcast({
          type: 'approval_requested',
          agent_id: agent.id,
          approval: {
            id: approvalId,
            run_id: runId,
            agent_id: agent.id,
            summary,
            status: 'pending',
            created_at: Date.now(),
          },
          timestamp: Date.now(),
        });
        telegramNotifications.notifyApprovalPending(
          { id: approvalId, run_id: runId, summary },
          agent.name
        ).catch(() => {});
        break;
      }

      case 'run.completed':
        this.updateTask(taskId, {
          status: 'done',
          result_md: data.output || 'Tugas selesai dengan sukses.',
        });
        this.setAgentStatus(agent.id, 'idle');
        this.activeStreams.delete(runId);
        break;

      case 'run.failed': {
        const task = this.taskRepo.getById(taskId);
        const errMsg = data.error || 'Eksekusi tugas gagal.';
        this.updateTask(taskId, {
          status: 'failed',
          result_md: errMsg,
        });
        this.setAgentStatus(agent.id, 'error');
        this.activeStreams.delete(runId);
        telegramNotifications.notifyRunFailed(
          { id: taskId, title: task?.title || 'Tugas' },
          agent.name,
          errMsg
        ).catch(() => {});
        break;
      }

      case 'run.cancelled':
        this.updateTask(taskId, { status: 'cancelled' });
        this.setAgentStatus(agent.id, 'idle');
        this.activeStreams.delete(runId);
        break;
    }
  }

  /**
   * Hook artefak otomatis: setiap event run diperiksa oleh aturan deteksi di
   * services/artifacts.ts. Bila ada keluaran berkas yang valid, ia disalin ke
   * MEDIA_DIR/artifacts (retensi Tahap 12 otomatis berlaku) dan papan disiarkan
   * ulang agar pemilik langsung melihat `task.artifacts` + `download_url`.
   *
   * Kegagalan apa pun di sini TIDAK boleh mengganggu run: registerRunArtifacts
   * tidak pernah melempar dan hasilnya dicatat audit.
   */
  private captureRunArtifacts(
    taskId: string,
    agent: Agent,
    runId: string,
    event: string,
    data: Record<string, unknown>
  ): void {
    let registered: TaskArtifact[] = [];
    try {
      registered = registerRunArtifacts({
        db: this.db,
        agentId: agent.id,
        taskId,
        runId,
        event,
        data,
      }).registered;
    } catch {
      return;
    }
    if (registered.length === 0) return;

    // Acara terminal (run.completed/failed/cancelled) mem-broadcast sendiri lewat
    // updateTask tepat setelah hook ini dan sudah menyertakan artefaknya; siarkan
    // hanya untuk event di tengah run supaya tidak dobel.
    if (TERMINAL_RUN_EVENTS.has(event)) return;
    const task = this.taskRepo.getById(taskId);
    if (!task) return;
    streamManager.broadcast({
      type: 'task_update',
      agent_id: task.agent_id,
      task: {
        id: task.id,
        status: task.status,
        title: task.title,
        agent_id: task.agent_id,
        result_md: task.result_md,
        updated_at: task.updated_at,
        artifacts: this.taskArtifacts(taskId),
      },
      timestamp: Date.now(),
    });
  }

  private startPeriodicHealthChecks(): void {
    if (this.healthInterval) return;
    // Health check every 30s per Section 7 spec
    this.healthInterval = setInterval(async () => {
      const agents = this.agentRepo.getAll();
      for (const agent of agents) {
        if (!agent.active) continue;
        try {
          const client = getHermesClientForAgent(agent, this.db);
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
