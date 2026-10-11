/**
 * Tasks Screen — Mobile Kanban Swipe (Rule REQ-076 & Section 8)
 * 4 Columns: Backlog, Running, Needs approval, Done.
 * Task creation modal, "Run now" execution, and Markdown result viewer.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckSquare,
  Plus,
  Play,
  RotateCw,
  FileText,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { Task, TaskPriority, TaskStatus } from '@hermes-office/shared';
import { useOfficeStore } from '../stores/office';
import { api } from '../services/api';
import { tma } from '../services/tma';
import { MarkdownView } from '../components/common/MarkdownView';

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'border-slate-600/40 text-slate-300' },
  { id: 'running', label: 'Running', color: 'border-office-cyan/40 text-office-cyan' },
  { id: 'needs_approval', label: 'Needs Approval', color: 'border-office-warn/40 text-office-warn' },
  { id: 'done', label: 'Done', color: 'border-office-success/40 text-office-success' },
];

export const TasksScreen: React.FC = () => {
  const { t } = useTranslation();
  const { tasks, agents, fetchInitialData } = useOfficeStore();

  // Task creation modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || '');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Result viewer modal state
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);

  // Group tasks by status
  const tasksByStatus: Record<TaskStatus, Task[]> = {
    backlog: tasks.filter((t) => t.status === 'backlog' || t.status === 'queued'),
    running: tasks.filter((t) => t.status === 'running'),
    needs_approval: tasks.filter((t) => t.status === 'needs_approval'),
    done: tasks.filter((t) => t.status === 'done'),
    failed: tasks.filter((t) => t.status === 'failed'),
    queued: [],
    cancelled: tasks.filter((t) => t.status === 'cancelled'),
  };

  // Run a task now
  const handleRunTask = async (taskId: string) => {
    tma.hapticImpact('medium');
    setRunningTaskId(taskId);
    try {
      await api.runTask(taskId);
      tma.hapticNotification('success');
      await fetchInitialData();
    } catch {
      tma.hapticNotification('error');
    } finally {
      setRunningTaskId(null);
    }
  };

  // Create new task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !selectedAgentId || isSubmitting) return;

    tma.hapticImpact('heavy');
    setIsSubmitting(true);
    try {
      await api.createTask({
        id: `task-${Date.now()}`,
        title: newTitle.trim(),
        description: newDescription.trim(),
        agent_id: selectedAgentId,
        priority: newPriority,
        status: 'backlog',
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      setNewTitle('');
      setNewDescription('');
      setCreateModalOpen(false);
      tma.hapticNotification('success');
      await fetchInitialData();
    } catch {
      tma.hapticNotification('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-office-danger/20 text-office-danger font-bold">URGENT</span>;
      case 'high':
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-office-warn/20 text-office-warn font-semibold">HIGH</span>;
      case 'low':
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">LOW</span>;
      default:
        return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-office-cyan/15 text-office-cyan font-medium">NORMAL</span>;
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-24 select-none">
      {/* Screen Header */}
      <div className="p-4 pb-2 flex items-center justify-between border-b border-white/10 bg-office-bg/90 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-office-cyan" />
          <h1 className="text-base font-bold text-white">{t('nav.tasks')}</h1>
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-white/10 text-office-cyan">
            {tasks.length}
          </span>
        </div>

        <button
          onClick={() => {
            tma.hapticImpact('light');
            setSelectedAgentId(agents[0]?.id || '');
            setCreateModalOpen(true);
          }}
          type="button"
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-office-cyan text-office-bg font-semibold text-xs shadow-glow-cyan min-h-[38px] active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Tugas</span>
        </button>
      </div>

      {/* Horizontal Swipe Mobile Kanban Board */}
      <div className="flex-1 overflow-x-auto p-3 flex gap-3 snap-x snap-mandatory no-scrollbar">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.id] || [];

          return (
            <div
              key={col.id}
              className="w-[280px] shrink-0 snap-center flex flex-col rounded-2xl glass-panel bg-slate-950/60 border border-white/10 overflow-hidden max-h-[calc(100vh-160px)]"
            >
              {/* Column Header */}
              <div className={`p-3 border-b flex items-center justify-between bg-black/40 ${col.color}`}>
                <span className="text-xs font-bold tracking-wide">{col.label}</span>
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white/10">
                  {colTasks.length}
                </span>
              </div>

              {/* Task Cards Column List */}
              <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
                {colTasks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-office-muted/60 font-mono">
                    Kosong
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const assignedAgent = agents.find((a) => a.id === task.agent_id);
                    const isRunningThis = runningTaskId === task.id || task.status === 'running';

                    return (
                      <div
                        key={task.id}
                        className={`rounded-xl p-3 border transition-all ${
                          task.status === 'running'
                            ? 'bg-office-cyan/10 border-office-cyan/40 shadow-glow-cyan'
                            : task.status === 'needs_approval'
                            ? 'bg-office-warn/10 border-office-warn/40 shadow-glow-warn'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {/* Header: Title and Priority */}
                        <div className="flex items-start justify-between gap-1.5 mb-1.5">
                          <h3 className="text-xs font-semibold text-white leading-snug line-clamp-2">
                            {task.title}
                          </h3>
                          {getPriorityBadge(task.priority)}
                        </div>

                        {/* Description */}
                        {task.description && (
                          <p className="text-[11px] text-office-muted mb-2 line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        {/* Assigned Agent Chip & Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{assignedAgent?.avatar || '🤖'}</span>
                            <span className="text-[10px] font-medium text-office-text/80 truncate max-w-[100px]">
                              {assignedAgent?.name || task.agent_id}
                            </span>
                          </div>

                          {/* Action Buttons based on status */}
                          {task.status === 'backlog' && (
                            <button
                              onClick={() => handleRunTask(task.id)}
                              disabled={isRunningThis}
                              type="button"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-office-cyan text-office-bg font-semibold text-[10px] shadow-glow-cyan hover:bg-cyan-300 min-h-[30px] active:scale-95 transition-all"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>{isRunningThis ? 'Menjalankan...' : 'Jalankan'}</span>
                            </button>
                          )}

                          {task.status === 'running' && (
                            <div className="flex items-center gap-1 text-[10px] text-office-cyan font-mono animate-pulse">
                              <RotateCw className="w-3 h-3 animate-spin" />
                              <span>Berjalan</span>
                            </div>
                          )}

                          {task.status === 'needs_approval' && (
                            <div className="flex items-center gap-1 text-[10px] text-office-warn font-semibold">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Persetujuan</span>
                            </div>
                          )}

                          {task.status === 'done' && (
                            <button
                              onClick={() => {
                                tma.hapticImpact('light');
                                setViewingTask(task);
                              }}
                              type="button"
                              className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-office-cyan text-[10px] font-mono transition-colors"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Hasil</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal 1: Create Task Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <form
            onSubmit={handleCreateTask}
            className="glass-panel-glow w-full max-w-sm rounded-2xl p-5 bg-slate-950 border border-office-cyan/40 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-office-cyan" />
                <span>Buat Tugas Baru</span>
              </h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                type="button"
                className="p-1 text-office-muted hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              {/* Title input (max 1000) */}
              <div>
                <label className="text-[11px] text-office-muted mb-1 block">Judul Tugas *</label>
                <input
                  type="text"
                  required
                  maxLength={1000}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Contoh: Analisis tren viral hashtag #AI..."
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white placeholder:text-office-muted/40 focus:outline-none focus:border-office-cyan min-h-[44px]"
                />
              </div>

              {/* Description input */}
              <div>
                <label className="text-[11px] text-office-muted mb-1 block">Deskripsi Tugas</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Instruksi detail untuk agen..."
                  className="w-full bg-black/60 border border-white/15 rounded-xl p-2.5 text-white placeholder:text-office-muted/40 focus:outline-none focus:border-office-cyan resize-none"
                />
              </div>

              {/* Assign Agent Dropdown */}
              <div>
                <label className="text-[11px] text-office-muted mb-1 block">Tugaskan ke Agen *</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-office-cyan min-h-[44px]"
                >
                  {agents.map((ag) => (
                    <option key={ag.id} value={ag.id} className="bg-slate-900 text-white">
                      {ag.avatar} {ag.name} ({ag.role} - {ag.department})
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority Selector */}
              <div>
                <label className="text-[11px] text-office-muted mb-1 block">Prioritas</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['low', 'normal', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPriority(p)}
                      className={`py-1.5 rounded-lg text-[10px] font-mono uppercase font-semibold transition-all min-h-[36px] ${
                        newPriority === p
                          ? 'bg-office-cyan text-office-bg shadow-glow-cyan'
                          : 'bg-white/5 text-office-muted hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-office-muted hover:text-white min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim() || isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-office-cyan text-office-bg text-xs font-bold hover:bg-cyan-300 disabled:opacity-40 transition-all shadow-glow-cyan min-h-[44px]"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Tugas'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Markdown Result Viewer Modal */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="glass-panel-glow w-full max-w-md max-h-[80vh] rounded-2xl p-5 bg-slate-950 border border-office-cyan/40 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-office-cyan" />
                <h2 className="text-sm font-bold text-white truncate max-w-[240px]">
                  {viewingTask.title}
                </h2>
              </div>
              <button
                onClick={() => setViewingTask(null)}
                type="button"
                className="p-1 text-office-muted hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {viewingTask.result_md ? (
                <MarkdownView content={viewingTask.result_md} />
              ) : (
                <p className="text-xs text-office-muted font-mono">Belum ada hasil tertulis untuk tugas ini.</p>
              )}
            </div>

            <div className="pt-3 border-t border-white/10 mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingTask(null)}
                className="px-4 py-2 rounded-xl bg-office-cyan text-office-bg font-semibold text-xs shadow-glow-cyan min-h-[40px]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
