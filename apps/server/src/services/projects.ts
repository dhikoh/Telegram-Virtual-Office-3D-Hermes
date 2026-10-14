import type Database from 'better-sqlite3';
import { TaskSchema } from '@hermes-office/shared';
import type { Project, ProjectSubtask, Task } from '@hermes-office/shared';
import { ProjectRepository } from '../db/repositories/projects.js';
import { TaskRepository } from '../db/repositories/tasks.js';
import { AgentRepository } from '../db/repositories/agents.js';
import { AuditRepository } from '../db/repositories/audit.js';
import { getServerHermesClient } from './hermes/index.js';
import type { OfficeDispatcher } from './dispatcher.js';

/**
 * Tahap 14 — proyek & orkestrasi subtask berantai (docs/DESIGN_DIRECTION.md §14).
 *
 * Prinsip kejujuran yang dijaga di sini:
 *  - Subtask HANYA berasal dari balasan orkestrator. Bila JSON tidak bisa
 *    dibaca, proyek tetap `draft` dengan `decompose_error` berisi pesan
 *    apa adanya — tidak pernah ada subtask karangan.
 *  - Rantai berjalan sendiri: subtask akar dijalankan saat pemilik menekan
 *    "Jalankan"; ketika satu subtask `done`, dependen yang seluruh
 *    dependensinya `done` ikut dijalankan; saat semuanya `done`, ringkasan
 *    final diminta ke orkestrator dan disimpan apa adanya (bila gagal,
 *    summary tetap null + audit `project.summary_failed`).
 *  - Subtask gagal → proyek `failed`, rantai berhenti, tidak ada dependent
 *    yang dijalankan.
 */

const ORCHESTRATOR_ID = 'agent_orchestrator';
const MAX_SUBTASKS = 6;

type SubtaskRow = Task & { depends_on: string | null; project_id: string | null };

export class ProjectService {
  private projectRepo: ProjectRepository;
  private taskRepo: TaskRepository;
  private agentRepo: AgentRepository;
  private auditRepo: AuditRepository;

  constructor(
    private db: Database.Database,
    private getDispatcher: () => OfficeDispatcher
  ) {
    this.projectRepo = new ProjectRepository(db);
    this.taskRepo = new TaskRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.auditRepo = new AuditRepository(db);
  }

  /** Minta orkestrator memecah proyek menjadi subtask JSON. Jujur pada kegagalan. */
  public async decompose(project: Project, userId: number): Promise<void> {
    const instruction = [
      'Anda adalah orkestrator kantor virtual. Pecah tujuan berikut menjadi 3-6 subtask kerja nyata.',
      'Balas HANYA dengan satu array JSON, tanpa teks lain, tanpa markdown:',
      '[{"title": "judul singkat", "detail": "instruksi kerja konkret", "agent": "id atau nama agen, atau null", "depends_on": [indeks sebelumnya]}]',
      'Aturan: depends_on hanya berisi indeks subtask yang mendahului (graf tanpa siklus); 1-6 elemen; judul dan detail dalam Bahasa Indonesia.',
      '',
      `Judul proyek: ${project.title}`,
      `Tujuan: ${project.goal || '(tidak ada tujuan tambahan)'}`,
    ].join('\n');

    let reply: string;
    try {
      const client = getServerHermesClient();
      const chunks: string[] = [];
      await client.chatStream([{ role: 'user', content: instruction }], (chunk) => {
        chunks.push(chunk);
      });
      reply = chunks.join('');
    } catch (err) {
      this.failDecompose(project, userId, `Gateway menolak/menggagalkan chat dekomposisi: ${(err as Error)?.message || err}`);
      return;
    }

    if (!reply.trim()) {
      this.failDecompose(project, userId, 'Orkestrator membalas kosong — tidak ada subtask yang dibuat.');
      return;
    }

    let parsed: ProjectSubtask[];
    try {
      parsed = this.parseSubtasks(reply);
    } catch (err) {
      const snippet = reply.trim().slice(0, 300);
      this.failDecompose(
        project,
        userId,
        `Balasan orkestrator bukan JSON subtask yang valid (${(err as Error)?.message || err}). Balasan asli: "${snippet}"`
      );
      return;
    }

    this.createSubtasks(project, parsed, userId);
    this.auditRepo.logAction(
      userId,
      'project.decompose',
      project.id,
      JSON.stringify({ subtasks: parsed.length, titles: parsed.map((s) => s.title) })
    );
  }

  /** Parse toleran: cari blok [...] pertama-ke-terakhir, validasi ketat. */
  public parseSubtasks(reply: string): ProjectSubtask[] {
    const cleaned = reply.replace(/```(?:json)?/gi, '');
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('tidak ditemukan array JSON');
    }
    const raw: unknown = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('bukan array berisi subtask');
    if (raw.length > MAX_SUBTASKS) throw new Error(`lebih dari ${MAX_SUBTASKS} subtask`);

    const out: ProjectSubtask[] = [];
    for (const [i, item] of raw.entries()) {
      const sub = item as Record<string, unknown>;
      if (typeof sub.title !== 'string' || !sub.title.trim()) {
        throw new Error(`subtask #${i} tanpa judul`);
      }
      const depends = Array.isArray(sub.depends_on) ? sub.depends_on : [];
      for (const dep of depends) {
        if (typeof dep !== 'number' || !Number.isInteger(dep) || dep < 0 || dep >= i) {
          throw new Error(`subtask #${i} menunjuk dependensi tidak sah (${String(dep)})`);
        }
      }
      out.push({
        title: sub.title.trim().slice(0, 1000),
        detail: typeof sub.detail === 'string' ? sub.detail : '',
        agent: typeof sub.agent === 'string' && sub.agent.trim() ? sub.agent.trim() : null,
        depends_on: [...new Set(depends as number[])],
      });
    }
    return out;
  }

  /** Buat baris task dari hasil dekomposisi + pasang project_id/depends_on. */
  private createSubtasks(project: Project, subs: ProjectSubtask[], userId: number): void {
    const ids: string[] = [];
    const now = Date.now();

    for (const [i, sub] of subs.entries()) {
      const taskId = `task_prj_${now}_${i}_${Math.random().toString(36).substring(2, 6)}`;
      const parsedTask = TaskSchema.safeParse({
        id: taskId,
        title: sub.title,
        description: sub.detail || `${project.title} — bagian ${i + 1}`,
        agent_id: this.resolveAgentId(sub.agent),
        priority: 'normal',
        status: 'queued',
        run_id: null,
        result_md: null,
        due_at: null,
        created_by: userId,
        created_at: now + i,
        updated_at: now,
      });
      if (!parsedTask.success) continue; // tidak pernah memalsukan task tak valid
      this.taskRepo.create(parsedTask.data as Task);
      this.projectRepo.attach(taskId, project.id, sub.depends_on.map((d) => ids[d]).filter(Boolean));
      ids.push(taskId);
    }
  }

  /** Cocokkan nama/id agen dari orkestrator; tidak dikenal → orkestrator. */
  private resolveAgentId(agent: string | null): string {
    if (!agent) return ORCHESTRATOR_ID;
    const byId = this.agentRepo.getById(agent);
    if (byId) return byId.id;
    const needle = agent.toLowerCase();
    const byName = this.agentRepo.getAll().find((a) => a.name?.toLowerCase() === needle);
    return byName ? byName.id : ORCHESTRATOR_ID;
  }

  private failDecompose(project: Project, userId: number, message: string): void {
    this.projectRepo.update(project.id, { status: 'draft', decompose_error: message });
    this.auditRepo.logAction(userId, 'project.decompose_failed', project.id, JSON.stringify({ error: message }));
  }

  /** Jalankan semua subtask yang dependensinya sudah done (subtask akar: antrean kosong). */
  public async runReady(projectId: string): Promise<number> {
    const project = this.projectRepo.getById(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const subs = this.projectRepo.getTasks(projectId) as SubtaskRow[];
    const statusById = new Map(subs.map((t) => [t.id, t.status]));
    const ready = subs.filter(
      (t) => t.status === 'queued' && this.depsOf(t).every((d) => statusById.get(d) === 'done')
    );

    if (ready.length === 0) return 0;
    this.projectRepo.setStatus(projectId, 'running');

    const dispatcher = this.getDispatcher();
    for (const t of ready) {
      try {
        await dispatcher.runTask(t.id);
      } catch (err) {
        // runTask sudah menandai task failed + audit task.run_failed; rantai
        // berhenti lewat handleSettled saat status failed terbroadcast.
        void err;
      }
    }
    return ready.length;
  }

  /**
   * Hook dari dispatcher: dipanggil saat satu task masuk done/failed.
   * Bila task itu subtask proyek, majukan rantainya (atau hentikan bila gagal).
   */
  public async handleSettled(taskId: string): Promise<void> {
    const row = this.db
      .prepare('SELECT project_id, status FROM tasks WHERE id = ?')
      .get(taskId) as { project_id: string | null; status: string } | undefined;
    if (!row?.project_id) return;

    const project = this.projectRepo.getById(row.project_id);
    if (!project || project.status !== 'running') return; // rantai hanya berjalan setelah run dimulai

    if (row.status === 'failed') {
      this.projectRepo.update(project.id, { status: 'failed', completed_at: Date.now() });
      this.auditRepo.logAction(project.created_by, 'project.failed', project.id, JSON.stringify({ failed_task: taskId }));
      return;
    }
    if (row.status !== 'done') return;

    const subs = this.projectRepo.getTasks(project.id) as SubtaskRow[];
    const allDone = subs.length > 0 && subs.every((t) => t.status === 'done');
    if (allDone) {
      await this.completeProject(project);
      return;
    }
    await this.runReady(project.id);
  }

  /** Semua subtask done → minta ringkasan final; kalau gagal, summary tetap null + audit. */
  private async completeProject(project: Project): Promise<void> {
    const subs = this.projectRepo.getTasks(project.id) as SubtaskRow[];
    const prompt = [
      'Anda adalah orkestrator kantor virtual. Semua subtask berikut selesai.',
      'Tulis ringkasan hasil akhir proyek dalam Bahasa Indonesia, maksimal 300 kata, langsung pada intinya.',
      `Proyek: ${project.title}`,
      `Tujuan: ${project.goal}`,
      '',
      ...subs.map((t) => `- ${t.title}: ${t.status === 'done' ? (t.result_md?.slice(0, 800) || '(selesai tanpa catatan hasil)') : t.status}`),
    ].join('\n');

    let summary: string | null = null;
    try {
      const client = getServerHermesClient();
      const chunks: string[] = [];
      await client.chatStream([{ role: 'user', content: prompt }], (chunk) => {
        chunks.push(chunk);
      });
      summary = chunks.join('').trim() || null;
    } catch (err) {
      this.auditRepo.logAction(
        project.created_by,
        'project.summary_failed',
        project.id,
        JSON.stringify({ error: (err as Error)?.message || String(err) })
      );
    }

    this.projectRepo.update(project.id, { status: 'done', completed_at: Date.now(), summary });
    this.auditRepo.logAction(project.created_by, 'project.complete', project.id, JSON.stringify({ subtasks: subs.length, has_summary: summary !== null }));
  }

  private depsOf(row: SubtaskRow): string[] {
    if (!row.depends_on) return [];
    try {
      const parsed: unknown = JSON.parse(row.depends_on);
      return Array.isArray(parsed) ? (parsed.filter((x): x is string => typeof x === 'string')) : [];
    } catch {
      return [];
    }
  }
}
