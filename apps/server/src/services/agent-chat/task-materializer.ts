/**
 * Fase 4 — Materializer Task Otomatis dari Giliran Chat (REQ Visibilitas Task & Runs).
 *
 * Menjawab masalah: "tasks = 0 padahal ada 13 tool call".
 * Aturan:
 *  1. Turn chat dengan >= 1 tool call otomatis dimaterialkan menjadi record di tabel `tasks`
 *     (status 'running', source 'chat', run_id, tool_calls_count).
 *  2. Begitu run selesai, status task diperbarui menjadi 'done' atau 'failed'.
 *  3. Obrolan biasa (casual chat) tanpa pemanggilan tool TIDAK PERNAH dibuatkan task.
 */
import type Database from 'better-sqlite3';
import { TaskRepository } from '../../db/repositories/tasks.js';
import type { Task } from '@hermes-office/shared';
import { streamManager } from '../stream.js';

export interface MaterializeToolCallOptions {
  runId: string;
  agentId: string;
  userInput?: string;
  toolName?: string;
  preview?: string;
  createdBy?: number;
}

export class ChatTaskMaterializer {
  private taskRepo: TaskRepository;

  constructor(private db: Database.Database) {
    this.taskRepo = new TaskRepository(db);
  }

  /**
   * Dipanggil saat terdeteksi event pemanggilan tool (`tool.started`, `tool_call`, dll.).
   * Jika task belum ada untuk `runId` ini, buat task baru dengan source 'chat' & status 'running'.
   * Jika sudah ada, tambahkan hitungan `tool_calls_count`.
   */
  public recordToolCall(options: MaterializeToolCallOptions): Task {
    const existing = this.taskRepo.getByRunId(options.runId);
    if (existing) {
      this.taskRepo.incrementToolCalls(existing.id, 1);
      const updated = this.taskRepo.getById(existing.id)!;
      streamManager.broadcast({
        type: 'task_update',
        agent_id: options.agentId,
        task: {
          id: updated.id,
          status: updated.status,
          title: updated.title,
          agent_id: options.agentId,
          updated_at: updated.updated_at,
        },
        timestamp: Date.now(),
      });
      return updated;
    }

    const now = Date.now();
    const taskId = `task_chat_${now}_${Math.random().toString(36).substring(2, 6)}`;

    // Tentukan judul task yang ringkas dan informatif
    let title = 'Tugas Obrolan';
    if (options.userInput && options.userInput.trim()) {
      const cleanInput = options.userInput.trim().replace(/\s+/g, ' ');
      title = cleanInput.length > 80 ? `${cleanInput.slice(0, 77)}...` : cleanInput;
    } else if (options.toolName) {
      title = `Eksekusi Tool: ${options.toolName}`;
    }

    const description = options.toolName
      ? `Tugas otomatis dibuat dari pemanggilan tool '${options.toolName}' dalam percakapan.`
      : 'Tugas otomatis dibuat dari eksekusi tool dalam percakapan.';

    const newTask: Task = {
      id: taskId,
      title,
      description,
      agent_id: options.agentId,
      priority: 'normal',
      status: 'running',
      run_id: options.runId,
      result_md: null,
      due_at: null,
      created_by: options.createdBy ?? 1,
      created_at: now,
      updated_at: now,
      source: 'chat',
      tool_calls_count: 1,
    };

    this.taskRepo.create(newTask);

    streamManager.broadcast({
      type: 'task_update',
      agent_id: options.agentId,
      task: {
        id: newTask.id,
        status: newTask.status,
        title: newTask.title,
        agent_id: options.agentId,
        updated_at: newTask.updated_at,
      },
      timestamp: now,
    });

    return newTask;
  }

  /**
   * Dipanggil saat run selesai (`run.completed` / `onDone`).
   * Jika ada task untuk `runId` ini, perbarui status menjadi 'done'.
   */
  public completeTask(runId: string, resultMd?: string): Task | null {
    const task = this.taskRepo.getByRunId(runId);
    if (!task) return null;

    const now = Date.now();
    this.taskRepo.update(task.id, {
      status: 'done',
      result_md: resultMd || task.result_md || 'Tugas selesai dengan sukses.',
    });

    const updated = this.taskRepo.getById(task.id)!;
    streamManager.broadcast({
      type: 'task_update',
      agent_id: task.agent_id,
      task: {
        id: updated.id,
        status: 'done',
        title: updated.title,
        agent_id: task.agent_id,
        result_md: updated.result_md,
        updated_at: now,
      },
      timestamp: now,
    });

    return updated;
  }

  /**
   * Dipanggil saat run gagal (`run.failed` / `onError`).
   * Jika ada task untuk `runId` ini, perbarui status menjadi 'failed'.
   */
  public failTask(runId: string, errorReason?: string): Task | null {
    const task = this.taskRepo.getByRunId(runId);
    if (!task) return null;

    const now = Date.now();
    this.taskRepo.update(task.id, {
      status: 'failed',
      result_md: errorReason || task.result_md || 'Eksekusi tugas gagal.',
    });

    const updated = this.taskRepo.getById(task.id)!;
    streamManager.broadcast({
      type: 'task_update',
      agent_id: task.agent_id,
      task: {
        id: updated.id,
        status: 'failed',
        title: updated.title,
        agent_id: task.agent_id,
        result_md: updated.result_md,
        updated_at: now,
      },
      timestamp: now,
    });

    return updated;
  }
}
