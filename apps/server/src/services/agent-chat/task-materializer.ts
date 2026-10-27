/**
 * Fase 4 — Materializer Task Otomatis dari Giliran Chat (REQ Visibilitas Task & Runs).
 *
 * Menjawab masalah: "tasks = 0 padahal ada 13 tool call".
 * Aturan:
 *  1. Turn chat dengan >= 1 tool call otomatis dimaterialkan menjadi record di tabel `tasks`
 *     (status 'running', source 'chat', run_id, tool_calls_count).
 *  2. Begitu run selesai, status task diperbarui menjadi 'done' atau 'failed'.
 *  3. Obrolan biasa (casual chat) tanpa pemanggilan tool TIDAK PERNAH dibuatkan task.
 *
 * Fix materialisasi (25 Okt 2026): bukti produksi menunjukkan 10 run hanya
 * menghasilkan 1 task — karena hanya turn yang memanggil tool yang dibuatkan
 * task, sementara turn obrolan biasa (mayoritas) tidak menghasilkan apa pun.
 * Sekarang SETIAP run yang menyelesaikan giliran menghasilkan tepat satu task:
 *  - turn dengan tool  → task dibuat saat tool pertama (source 'chat').
 *  - turn obrolan biasa → task dibuat saat run selesai (source 'chat'),
 *    supaya riwayat kerja agen terlihat penuh, bukan cuma yang memakai tool.
 *  - turn yang gagal SEBELUM tool pertama → tidak ada task (tidak ada yang
 *    bisa dilaporkan sebagai pekerjaan).
 * Idempoten lewat `getByRunId` sebelum insert + indeks UNIQUE partial
 * `idx_tasks_run_id_chat_unique` (migrasi 013, HANYA source='chat').
 */
import type Database from 'better-sqlite3';
import { TaskRepository } from '../../db/repositories/tasks.js';
import type { Task } from '@hermes-office/shared';
import { stripIdentity } from '../hermes/identity-scope.js';
import { streamManager } from '../stream.js';
import { telegramNotifications } from '../notifications.js';

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
   * Pastikan ADA tepat satu task untuk `runId` — buat bila belum ada.
   *
   * Satu pintu untuk kedua jalur (tool pertama maupun turn obrolan biasa)
   * supaya aturan "satu run = satu task" hanya ditulis sekali. Idempoten:
   * `getByRunId` diperiksa lebih dulu, dan migrasi 013 memasang indeks UNIQUE
   * partial `idx_tasks_run_id_chat_unique` (run_id NOT NULL AND
   * source='chat') sebagai jaring pengaman tingkat database — dibatasi ke
   * source 'chat' karena task orkestrator/cron boleh berbagi run_id gateway.
   */
  private ensureTask(
    runId: string,
    agentId: string,
    userInput?: string,
    createdBy?: number,
    toolName?: string
  ): Task | null {
    const existing = this.taskRepo.getByRunId(runId);
    if (existing) return existing;

    const now = Date.now();
    const taskId = `task_chat_${now}_${Math.random().toString(36).substring(2, 6)}`;

    // Judul ringkas dan informatif: pesan pemilik dulu, nama tool sebagai cadangan.
    // Pesan keluar bisa berprefiks blok identitas (fix identitas) — blok itu
    // milik aplikasi, bukan milik pemilik, jadi tidak boleh muncul sebagai
    // judul task yang ia lihat.
    let title = 'Tugas Obrolan';
    const cleanInput = stripIdentity(userInput?.trim().replace(/\s+/g, ' ') ?? '');
    if (cleanInput) {
      title = cleanInput.length > 80 ? `${cleanInput.slice(0, 77)}...` : cleanInput;
    } else if (toolName) {
      title = `Eksekusi Tool: ${toolName}`;
    }

    const description = toolName
      ? `Tugas otomatis dibuat dari pemanggilan tool '${toolName}' dalam percakapan.`
      : 'Tugas otomatis dibuat dari giliran obrolan dengan agen.';

    const newTask: Task = {
      id: taskId,
      title,
      description,
      agent_id: agentId,
      priority: 'normal',
      status: 'running',
      run_id: runId,
      result_md: null,
      due_at: null,
      created_by: createdBy ?? 1,
      created_at: now,
      updated_at: now,
      source: 'chat',
      tool_calls_count: toolName ? 1 : 0,
    };

    this.taskRepo.create(newTask);

    streamManager.broadcast({
      type: 'task_update',
      agent_id: agentId,
      task: {
        id: newTask.id,
        status: newTask.status,
        title: newTask.title,
        agent_id: agentId,
        updated_at: now,
      },
      timestamp: now,
    });

    return newTask;
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

    // Tool pertama untuk run ini — task dibuat lewat satu pintu yang sama
    // dengan jalur obrolan biasa supaya aturan "satu run = satu task" hanya
    // ditulis sekali.
    const created = this.ensureTask(
      options.runId,
      options.agentId,
      options.userInput,
      options.createdBy,
      options.toolName
    );
    if (!created) {
      // ensureTask hanya mengembalikan null bila task sudah ada — sudah
      // diperiksa di atas, jadi cabang ini tidak terjangkau. Dibuang ke
      // penanganan eksplisit alih-alih assertion supaya tipe tetap jujur.
      throw new Error(`ensureTask gagal membuat task untuk run ${options.runId}`);
    }
    return created;
  }

  /**
   * Dipanggil saat run selesai (`run.completed` / `onDone`).
   *
   * Fix materialisasi: bila run selesai TANPA satu pun pemanggilan tool
   * (turn obrolan biasa), task dibuat di sini — supaya setiap run yang
   * menyelesaikan giliran punya tepat satu task. Turn yang sudah punya task
   * (karena memanggil tool) hanya diperbarui statusnya.
   *
   * @param userInput  pesan pemilik untuk giliran ini (judul task)
   * @param agentId    agen pemilik run (dibutuhkan bila task belum ada)
   * @param createdBy  id pemilik (opsional)
   */
  public completeTask(
    runId: string,
    resultMd?: string,
    options: { userInput?: string; agentId?: string; createdBy?: number } = {}
  ): Task | null {
    let task = this.taskRepo.getByRunId(runId);

    // Turn obrolan biasa: belum ada task untuk run ini → buat sekarang.
    // Tanpa agentId tidak ada agen yang bisa disebut sebagai pemilik task,
    // jadi dipanggil tanpa agentId task TIDAK dikarang (jaga perilaku lama
    // untuk pemanggil yang tidak memberi konteks).
    if (!task && options.agentId) {
      task = this.ensureTask(runId, options.agentId, options.userInput, options.createdBy);
    }

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

    try {
      const agentRow = this.db.prepare('SELECT name, department FROM agents WHERE id = ?').get(task.agent_id) as
        | { name: string; department?: string }
        | undefined;
      telegramNotifications.notifyTaskCompleted(
        { id: updated.id, title: updated.title, department: agentRow?.department },
        agentRow?.name || 'Agen Virtual',
        updated.result_md || undefined
      ).catch(() => {});
    } catch {
      // Abaikan kegagalan pengiriman notifikasi agar tidak merusak alur chat
    }

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

    try {
      const agentRow = this.db.prepare('SELECT name FROM agents WHERE id = ?').get(task.agent_id) as
        | { name: string }
        | undefined;
      telegramNotifications.notifyRunFailed(
        { id: updated.id, title: updated.title },
        agentRow?.name || 'Agen Virtual',
        updated.result_md || 'Eksekusi tugas gagal.'
      ).catch(() => {});
    } catch {
      // Abaikan kegagalan pengiriman notifikasi agar tidak merusak alur chat
    }

    return updated;
  }
}
