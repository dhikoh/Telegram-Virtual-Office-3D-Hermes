/**
 * Tahap 14 — Proyek & peta DAG (docs/DESIGN_DIRECTION.md §14).
 *
 * Satu modal dua tampilan:
 *  - Daftar: proyek + progres subtask (done/total) + buat baru. Dekomposisi
 *    berjalan di belakang layar oleh orkestrator; status dipantau dari daftar
 *    (bila `decompose_error` ada, pesannya tampil apa adanya — tidak pernah
 *    diganti teks manis, dan tidak ada subtask karangan).
 *  - Detail: peta DAG — kolom = kedalaman dependensi, node = subtask, warna
 *    node = warna departemen agen yang ditugasi, pinggir node = status.
 *    Status live: memakai listener `task_update` yang SUDAH dipakai store
 *    (bukan EventSource kedua) + poll ringan saat proyek masih berjalan.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, GitBranch, Play, Plus, RefreshCw, X } from 'lucide-react';
import { useOfficeStore } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import type { Project, ProjectTask } from '@hermes-office/shared';

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProjectListItem = Project & { subtask_total: number; subtask_done: number };

const STATUS_STYLE: Record<string, { border: string; text: string; label: string }> = {
  queued: { border: '#64748B', text: 'text-office-muted', label: 'Menunggu' },
  running: { border: '#FBBF24', text: 'text-amber-300', label: 'Berjalan' },
  done: { border: '#34D399', text: 'text-emerald-300', label: 'Selesai' },
  failed: { border: '#F43F5E', text: 'text-rose-300', label: 'Gagal' },
};

const PROJECT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  running: 'Berjalan',
  blocked: 'Menunggu persetujuan',
  done: 'Selesai',
  failed: 'Gagal',
};

/** Kedalaman DAG: level 0 = subtask akar (tanpa dependensi). */
function computeLevels(tasks: ProjectTask[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const levels = new Map<string, number>();
  const resolve = (id: string, guard: Set<string>): number => {
    const cached = levels.get(id);
    if (cached !== undefined) return cached;
    if (guard.has(id)) return 0; // defensif: server sudah menjamin tanpa siklus
    guard.add(id);
    const task = byId.get(id);
    const deps = task?.depends_on ?? [];
    const level = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((d) => resolve(d, guard)));
    levels.set(id, level);
    return level;
  };
  for (const t of tasks) resolve(t.id, new Set());
  return levels;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({ isOpen, onClose }) => {
  const { agents, departments, tasks: storeTasks, addTickerMessage } = useOfficeStore();

  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ project: Project; tasks: ProjectTask[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await api.listProjects();
      setItems(res.projects);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api.getProject(id));
    } catch {
      /* daftar tetap bisa dimuat ulang; galat tampil di aksi lain */
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    void refreshList();
  }, [isOpen, refreshList]);

  // Idx live: manfaatkan listener task_update yang sudah dipakai store
  // (tasks berubah → refresh detail), plus poll ringan selama proyek jalan.
  useEffect(() => {
    if (!selectedId || !detail) return;
    const active = detail.project.status === 'draft' || detail.project.status === 'running';
    if (!active) return;
    void refreshDetail(selectedId);
    const timer = window.setInterval(() => void refreshDetail(selectedId), 4000);
    return () => window.clearInterval(timer);
  }, [selectedId, detail, refreshDetail, storeTasks]);

  const agentColor = useMemo(() => {
    const deptColor = new Map(departments.map((d) => [d.id, d.color]));
    const color = new Map<string, string>();
    for (const agent of agents) {
      color.set(agent.id, deptColor.get(agent.department) ?? '#94A3B8');
    }
    return color;
  }, [agents, departments]);

  if (!isOpen) return null;

  const submitCreate = async () => {
    if (!newTitle.trim()) {
      setCreateError('Judul wajib diisi.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.createProject({ title: newTitle.trim(), goal: newGoal.trim() });
      setNewTitle('');
      setNewGoal('');
      addTickerMessage(`Proyek "${res.project.title}" dibuat — orkestrator sedang memecahnya jadi subtask.`);
      tma.hapticNotification('success');
      await refreshList();
      setSelectedId(res.project.id);
      await refreshDetail(res.project.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
      tma.hapticNotification('error');
    } finally {
      setCreating(false);
    }
  };

  const runProject = async () => {
    if (!selectedId) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.runProject(selectedId);
      addTickerMessage(`Proyek berjalan: ${res.started} subtask dijalankan.`);
      tma.hapticNotification('success');
      await refreshDetail(selectedId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      tma.hapticNotification('error');
    } finally {
      setBusy(false);
    }
  };

  const project = detail?.project;
  const subtasks = detail?.tasks ?? [];

  return (
    <div
      className="fixed inset-0 z-[100] isolate flex items-center justify-center bg-office-inset backdrop-blur-md p-4 animate-in fade-in duration-200"
      data-testid="projects-modal"
    >
      <div className="bg-office-elevated border border-office-accent/40 rounded-2xl w-full max-w-lg p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-office-border">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-office-accent-ink" />
            <h3 className="text-sm font-bold text-office-text" data-testid="projects-title">
              {selectedId ? 'Detail Proyek' : 'Proyek Kantor'}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {!selectedId && (
              <button
                type="button"
                onClick={() => void refreshList()}
                className="p-1.5 rounded-lg hover:bg-office-hover text-office-muted"
                data-testid="projects-refresh"
                aria-label="Muat ulang"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-office-hover text-office-muted"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {selectedId && project ? (
          /* ------------------------- DETAIL + PETA DAG ------------------------- */
          <div className="flex flex-col gap-3 overflow-y-auto pr-1" data-testid="project-detail">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                  void refreshList();
                }}
                className="flex items-center gap-1 text-[11px] text-office-muted hover:text-office-text"
                data-testid="project-back"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Kembali
              </button>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border border-office-border ${STATUS_STYLE[project.status === 'done' ? 'done' : project.status === 'failed' ? 'failed' : project.status === 'running' ? 'running' : 'queued']?.text ?? 'text-office-muted'}`}
                data-testid="project-status"
              >
                {PROJECT_STATUS_LABEL[project.status] ?? project.status}
              </span>
            </div>

            <div>
              <p className="text-sm font-semibold text-office-text">{project.title}</p>
              {project.goal && <p className="text-[11px] text-office-muted mt-0.5">{project.goal}</p>}
            </div>

            {project.decompose_error && (
              <div
                className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded-lg p-2.5 whitespace-pre-wrap"
                data-testid="project-decompose-error"
              >
                Dekomposisi gagal — tidak ada subtask yang dibuat. Pesan orkestrator:
                <br />
                {project.decompose_error}
              </div>
            )}

            {actionError && (
              <div
                className="text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/40 rounded-lg p-2.5"
                data-testid="project-error"
              >
                {actionError}
              </div>
            )}

            {subtasks.length > 0 && (
              <DagMap tasks={subtasks} agentColor={agentColor} />
            )}

            {project.status === 'done' && project.summary && (
              <div
                className="text-[11px] text-office-text bg-office-inset border border-office-border rounded-lg p-2.5 whitespace-pre-wrap"
                data-testid="project-summary"
              >
                <span className="font-semibold text-office-muted">Ringkasan hasil:</span>
                <br />
                {project.summary}
              </div>
            )}

            {(project.status === 'draft' || project.status === 'running') && (
              <button
                type="button"
                onClick={() => void runProject()}
                disabled={busy || subtasks.length === 0}
                className="w-full glass-panel border border-office-accent/40 hover:bg-office-hover rounded-xl py-2.5 text-xs font-semibold text-office-text flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="project-run"
              >
                <Play className="w-3.5 h-3.5" />
                {subtasks.length === 0 ? 'Menunggu dekomposisi…' : 'Jalankan Proyek'}
              </button>
            )}
          </div>
        ) : (
          /* ----------------------------- DAFTAR ----------------------------- */
          <div className="flex flex-col gap-3 overflow-y-auto pr-1">
            <div className="flex flex-col gap-2 glass-panel border border-office-border rounded-xl p-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Judul proyek (wajib)"
                className="bg-office-inset border border-office-border rounded-lg px-3 py-2 text-xs text-office-text placeholder:text-office-muted focus:outline-none focus:border-office-accent"
                data-testid="project-title-input"
              />
              <textarea
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="Tujuan / deskripsi singkat (opsional)"
                rows={2}
                className="bg-office-inset border border-office-border rounded-lg px-3 py-2 text-xs text-office-text placeholder:text-office-muted focus:outline-none focus:border-office-accent resize-none"
                data-testid="project-goal-input"
              />
              {createError && (
                <p className="text-[11px] text-rose-300" data-testid="project-create-error">
                  {createError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void submitCreate()}
                disabled={creating}
                className="w-full bg-office-accent/20 hover:bg-office-accent/30 border border-office-accent/50 rounded-lg py-2 text-xs font-semibold text-office-text flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="project-create-submit"
              >
                <Plus className="w-3.5 h-3.5" />
                {creating ? 'Membuat…' : 'Buat Proyek'}
              </button>
            </div>

            {listError && (
              <p className="text-[11px] text-rose-300" data-testid="project-list-error">
                {listError}
              </p>
            )}

            {items.length === 0 && !loading && !listError && (
              <p className="text-[11px] text-office-muted text-center py-4" data-testid="projects-empty">
                Belum ada proyek. Buat satu — orkestrator akan memecahnya jadi subtask berantai.
              </p>
            )}

            {items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedId(p.id);
                  void refreshDetail(p.id);
                }}
                className="glass-panel border border-office-border hover:bg-office-hover rounded-xl p-3 text-left flex items-center justify-between gap-2"
                data-testid="project-item"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-office-text truncate">{p.title}</span>
                  <span className="text-[10px] text-office-muted">
                    {p.subtask_done}/{p.subtask_total} subtask •{' '}
                    {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <span className="text-[10px] text-office-muted shrink-0">
                  {p.decompose_error ? 'perlu perhatian' : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Peta DAG: kolom = level dependensi, node = subtask, pinggir = warna status,
 * isi = warna departemen agen (dari data departments, fallback slate).
 * SVG murni — tanpa pustaka graf, tanpa animasi berat.
 */
const DagMap: React.FC<{ tasks: ProjectTask[]; agentColor: Map<string, string> }> = ({
  tasks,
  agentColor,
}) => {
  const levels = useMemo(() => computeLevels(tasks), [tasks]);
  const columns = useMemo(() => {
    const max = Math.max(0, ...levels.values());
    const cols: ProjectTask[][] = Array.from({ length: max + 1 }, () => []);
    for (const t of tasks) cols[levels.get(t.id) ?? 0].push(t);
    return cols;
  }, [tasks, levels]);

  const NODE_W = 132;
  const NODE_H = 44;
  const COL_GAP = 60;
  const ROW_GAP = 14;
  const width = columns.length * NODE_W + Math.max(0, columns.length - 1) * COL_GAP + 8;
  const height = Math.max(...columns.map((c) => c.length), 1) * (NODE_H + ROW_GAP) + 8;
  const posOf = (id: string): { x: number; y: number } | null => {
    const level = levels.get(id);
    if (level === undefined) return null;
    const index = columns[level].findIndex((t) => t.id === id);
    if (index < 0) return null;
    return { x: 4 + level * (NODE_W + COL_GAP), y: 4 + index * (NODE_H + ROW_GAP) };
  };

  return (
    <div className="border border-office-border rounded-xl bg-office-inset p-2 overflow-x-auto" data-testid="project-dag">
      <svg width={width} height={height} role="img" aria-label="Peta alur kerja subtask">
        {tasks.flatMap((t) =>
          t.depends_on.map((dep) => {
            const from = posOf(dep);
            const to = posOf(t.id);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            return (
              <path
                key={`${dep}->${t.id}`}
                d={`M ${x1} ${y1} C ${x1 + COL_GAP / 2} ${y1}, ${x2 - COL_GAP / 2} ${y2}, ${x2} ${y2}`}
                stroke="#475569"
                strokeWidth={1.5}
                fill="none"
              />
            );
          })
        )}
        {tasks.map((t) => {
          const pos = posOf(t.id);
          if (!pos) return null;
          const style = STATUS_STYLE[t.status] ?? STATUS_STYLE.queued;
          const color = agentColor.get(t.agent_id) ?? '#94A3B8';
          return (
            <g key={t.id} data-testid="dag-node">
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={`${color}22`}
                stroke={style.border}
                strokeWidth={1.5}
              />
              <text x={pos.x + 8} y={pos.y + 18} fontSize={10} fill="#E2E8F0">
                {t.title.length > 18 ? `${t.title.slice(0, 17)}…` : t.title}
              </text>
              <text x={pos.x + 8} y={pos.y + 33} fontSize={9} fill={style.border}>
                {style.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
