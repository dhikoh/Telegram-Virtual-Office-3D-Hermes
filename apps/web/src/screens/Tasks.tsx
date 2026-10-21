/**
 * Tasks Screen — Mobile Kanban Swipe & Cron Schedules (Rule REQ-076, Section 8, Fase 4 & 5)
 * 4 Columns: Backlog, Running, Needs approval, Done.
 * Source Filter: All / Direct / Chat Auto-Task.
 * Mode Switcher: Task Board vs Cron Schedules.
 * Task creation modal, "Run now" execution, and Markdown result & Run Timeline viewer.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckSquare,
  Plus,
  Play,
  RotateCw,
  FileText,
  AlertTriangle,
  History,
  Pencil,
  Square,
  Trash2,
} from 'lucide-react';
import type { Task, TaskStatus } from '@hermes-office/shared';
import { useOfficeStore } from '../stores/office';
import { api } from '../services/api';
import { tma } from '../services/tma';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal';
import { EditTaskModal } from '../components/tasks/EditTaskModal';
import { TaskResultModal } from '../components/tasks/TaskResultModal';
import { CronScheduleView } from '../components/tasks/CronScheduleView';

/**
 * Kolom papan. Audit 2026-10-21: 'cancelled' dan 'failed' sebelumnya TIDAK
 * dirender, jadi setiap tugas yang baru dihentikan (atau gagal) lenyap dari
 * papan tanpa bekas — terlihat seperti tugas yang hilang, bukan berhenti.
 */
const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'border-office-border/40 text-office-muted' },
  { id: 'running', label: 'Running', color: 'border-office-accent/40 text-office-accent-ink' },
  { id: 'needs_approval', label: 'Needs Approval', color: 'border-office-warn/40 text-office-warn' },
  { id: 'done', label: 'Done', color: 'border-office-success/40 text-office-success' },
  { id: 'failed', label: 'Failed', color: 'border-red-500/40 text-red-400' },
  { id: 'cancelled', label: 'Cancelled', color: 'border-office-border/60 text-office-muted' },
];

export const TasksScreen: React.FC = () => {
  const { t } = useTranslation();
  const { tasks, agents, fetchInitialData, stopTask, removeTask, updateTask } = useOfficeStore();

  const [screenMode, setScreenMode] = useState<'board' | 'cron'>('board');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [modalInitialTab, setModalInitialTab] = useState<'result' | 'events'>('result');
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'chat'>('all');

  const handleDeleteTask = async (task: Task) => {
    if (!window.confirm(t('tasks.deleteConfirm', { name: task.title }))) return;
    tma.hapticNotification('warning');
    try {
      await removeTask(task.id);
      tma.hapticNotification('success');
    } catch (err: unknown) {
      tma.hapticNotification('error');
      useOfficeStore
        .getState()
        .addTickerMessage(err instanceof Error ? err.message : t('tasks.deleteFailed'), 'error');
    }
  };

  /** Modal untuk memperbaiki judul/keterangan/prioritas/penerima tugas. */
  const handleOpenEdit = (task: Task) => {
    tma.hapticImpact('light');
    setEditingTask(task);
  };

  /**
   * Audit 2026-10-21 — Stop Task di papan.
   * Sebelumnya papan tidak punya tombol ini sama sekali: penghentian hanya
   * bisa dilakukan dari laci agen, dan bahkan di sana hasilnya ditelan `catch {}`.
   */
  const handleStopTask = async (task: Task) => {
    if (stoppingTaskId) return;
    setStoppingTaskId(task.id);
    tma.hapticNotification('warning');
    try {
      await stopTask(task.id);
    } catch (err: unknown) {
      tma.hapticNotification('error');
      useOfficeStore
        .getState()
        .addTickerMessage(err instanceof Error ? err.message : t('tasks.stopFailed'), 'error');
            } finally {
              setStoppingTaskId(null);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (sourceFilter === 'manual') return task.source === 'manual' || !task.source;
    if (sourceFilter === 'chat') return task.source === 'chat';
    return true;
  });

  const tasksByStatus: Record<TaskStatus, Task[]> = {
    backlog: filteredTasks.filter((t) => t.status === 'backlog' || t.status === 'queued'),
    running: filteredTasks.filter((t) => t.status === 'running'),
    needs_approval: filteredTasks.filter((t) => t.status === 'needs_approval'),
    done: filteredTasks.filter((t) => t.status === 'done'),
    failed: filteredTasks.filter((t) => t.status === 'failed'),
    queued: [],
    cancelled: filteredTasks.filter((t) => t.status === 'cancelled'),
  };

  const handleRunTask = async (taskId: string) => {
    tma.hapticImpact('medium');
    setRunningTaskId(taskId);
    try {
      await api.runTask(taskId);
      await fetchInitialData();
    } catch {
      tma.hapticNotification('error');
    } finally {
      setRunningTaskId(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20 select-none">
      {/* Top Header */}
      <div className="p-4 pb-2 flex items-center justify-between border-b border-office-border bg-office-surface/90 backdrop-blur-md sticky top-0 z-30 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CheckSquare className="w-5 h-5 text-office-accent-ink shrink-0" />
          <h1 className="text-base font-bold text-office-text truncate">{t('nav.tasks')}</h1>
          {screenMode === 'board' && (
            <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-office-hover text-office-accent-ink">
              {filteredTasks.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Mode Switcher: Board vs Cron */}
          <div className="flex items-center p-0.5 rounded-xl bg-office-inset border border-office-border/60">
            <button
              type="button"
              onClick={() => {
                tma.hapticImpact('light');
                setScreenMode('board');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all min-h-[36px] ${
                screenMode === 'board'
                  ? 'bg-office-accent text-office-on-accent shadow-sm'
                  : 'text-office-muted hover:text-office-text'
              }`}
            >
              {t('cron.tabBoard')}
            </button>
            <button
              type="button"
              onClick={() => {
                tma.hapticImpact('light');
                setScreenMode('cron');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all min-h-[36px] ${
                screenMode === 'cron'
                  ? 'bg-office-accent text-office-on-accent shadow-sm'
                  : 'text-office-muted hover:text-office-text'
              }`}
            >
              ⏱️ {t('cron.tabCron')}
            </button>
          </div>

          {screenMode === 'board' && (
            <button
              onClick={() => {
                tma.hapticImpact('light');
                setCreateModalOpen(true);
              }}
              type="button"
              aria-label={t('tasks.createTask')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-office-accent text-office-on-accent font-semibold text-xs shadow-nu-raised min-h-[44px] active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t('tasks.createTask')}</span>
            </button>
          )}
        </div>
      </div>

      {screenMode === 'cron' ? (
        <CronScheduleView />
      ) : (
        <>
          {/* Source Filter Tabs */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-office-border bg-office-surface/60 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                tma.hapticImpact('light');
                setSourceFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 min-h-[36px] ${
                sourceFilter === 'all'
                  ? 'bg-office-accent text-office-on-accent shadow-sm'
                  : 'bg-office-hover text-office-muted hover:text-office-text'
              }`}
            >
              <span>{t('tasks.filterAll')}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-office-inset/40">
                {tasks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                tma.hapticImpact('light');
                setSourceFilter('manual');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 min-h-[36px] ${
                sourceFilter === 'manual'
                  ? 'bg-office-accent text-office-on-accent shadow-sm'
                  : 'bg-office-hover text-office-muted hover:text-office-text'
              }`}
            >
              <span>{t('tasks.filterManual')}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-office-inset/40">
                {tasks.filter((t) => t.source === 'manual' || !t.source).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                tma.hapticImpact('light');
                setSourceFilter('chat');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 min-h-[36px] ${
                sourceFilter === 'chat'
                  ? 'bg-office-accent text-office-on-accent shadow-sm'
                  : 'bg-office-hover text-office-muted hover:text-office-text'
              }`}
            >
              <span>💬 {t('tasks.filterChat')}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-office-inset/40">
                {tasks.filter((t) => t.source === 'chat').length}
              </span>
            </button>
          </div>

          {/* Horizontal Swipe Mobile Kanban Board */}
          <div className="flex-1 overflow-x-auto p-3 flex gap-3 snap-x snap-mandatory no-scrollbar">
            {COLUMNS.map((col) => {
              const colTasks = tasksByStatus[col.id] || [];

              return (
                <div
                  key={col.id}
                  className="w-[280px] shrink-0 snap-center flex flex-col rounded-2xl glass-panel bg-office-elevated border border-office-border overflow-hidden max-h-[calc(100vh-210px)]"
                >
                  {/* Column Header */}
                  <div className={`p-3 border-b flex items-center justify-between bg-office-inset ${col.color}`}>
                    <span className="text-xs font-bold tracking-wide">{col.label}</span>
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-office-hover">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Task Cards Column List */}
                  <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
                    {colTasks.length === 0 ? (
                      <div className="py-8 text-center text-xs text-office-text/70 font-mono">
                        {t('tasks.empty')}
                      </div>
                    ) : (
                      colTasks.map((task) => {
                        const assignedAgent = agents.find((a) => a.id === task.agent_id);
                        const isRunningThis = runningTaskId === task.id || task.status === 'running';
                        const isChat = task.source === 'chat';
                        const toolCalls = task.tool_calls_count ?? 0;

                        return (
                          <div
                            key={task.id}
                            className={`rounded-xl p-3 border transition-all ${
                              task.status === 'running'
                                ? 'bg-office-accent/10 border-office-accent/40 shadow-nu-raised'
                                : task.status === 'needs_approval'
                                ? 'bg-office-warn/10 border-office-warn/40 shadow-nu-raised'
                                : 'bg-office-hover border-office-border hover:border-office-border'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <span className="font-semibold text-xs text-office-text leading-tight">
                                {task.title}
                              </span>
                              <span
                                className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                  task.priority === 'urgent'
                                    ? 'bg-office-danger/20 text-office-danger'
                                    : task.priority === 'high'
                                    ? 'bg-office-warn/20 text-office-warn'
                                    : 'bg-office-hover text-office-muted'
                                }`}
                              >
                                {task.priority}
                              </span>
                            </div>

                            {/* Badges: Source & Tool Calls */}
                            <div className="flex items-center gap-1.5 flex-wrap mb-2">
                              <span
                                className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold ${
                                  isChat
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-office-inset text-office-muted'
                                }`}
                              >
                                {isChat ? `💬 ${t('tasks.badgeChat')}` : `📋 ${t('tasks.badgeDirect')}`}
                              </span>

                              {toolCalls > 0 && (
                                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-office-inset text-cyan-300 border border-cyan-500/20">
                                  🔧 {toolCalls} {toolCalls > 1 ? t('tasks.toolCallsPlural') : t('tasks.toolCalls')}
                                </span>
                              )}
                            </div>

                            {task.description && (
                              <p className="text-[11px] text-office-muted mb-2 line-clamp-2">
                                {task.description}
                              </p>
                            )}

                            <div className="flex items-center justify-between pt-2 border-t border-office-border gap-1 flex-wrap">
                              <div className="flex items-center gap-1.5 text-[10px] text-office-muted min-w-0">
                                <span>{assignedAgent?.avatar || '🤖'}</span>
                                <span className="truncate max-w-[80px]">
                                  {assignedAgent?.name || 'Unassigned'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                {task.status === 'backlog' && (
                                  <button
                                    onClick={() => handleRunTask(task.id)}
                                    disabled={isRunningThis}
                                    type="button"
                                    aria-label={`${t('tasks.runNow')} ${task.title}`}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-office-accent text-office-on-accent font-semibold text-xs shadow-nu-raised hover:bg-cyan-300 min-h-[36px] active:scale-95 transition-all"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>{isRunningThis ? t('tasks.running') : t('tasks.runNow')}</span>
                                  </button>
                                )}

                                {task.status === 'running' && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex items-center gap-1 text-[10px] text-office-accent-ink font-mono animate-pulse min-h-[36px]">
                                      <RotateCw className="w-3 h-3 animate-spin" />
                                      <span>{t('tasks.statusRunning')}</span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        tma.hapticImpact('light');
                                        setModalInitialTab('events');
                                        setViewingTask(task);
                                      }}
                                      type="button"
                                      aria-label={`${t('tasks.viewTimeline')} ${task.title}`}
                                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-office-hover text-cyan-300 text-xs font-mono transition-colors min-h-[36px]"
                                    >
                                      <History className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                {task.status === 'needs_approval' && (
                                  <div className="flex items-center gap-1 text-[10px] text-office-warn font-semibold min-h-[36px]">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>{t('tasks.needsApproval')}</span>
                                  </div>
                                )}

                                {task.status === 'done' && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        tma.hapticImpact('light');
                                        setModalInitialTab('result');
                                        setViewingTask(task);
                                      }}
                                      type="button"
                                      aria-label={`${t('tasks.viewResult')} ${task.title}`}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-office-hover hover:bg-office-hover text-office-accent-ink text-xs font-mono transition-colors min-h-[36px]"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span>{t('tasks.viewResult')}</span>
                                    </button>
                                    {task.run_id && (
                                      <button
                                        onClick={() => {
                                          tma.hapticImpact('light');
                                          setModalInitialTab('events');
                                          setViewingTask(task);
                                        }}
                                        type="button"
                                        aria-label={`${t('tasks.viewTimeline')} ${task.title}`}
                                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-office-hover hover:bg-office-hover text-office-muted hover:text-cyan-300 text-xs font-mono transition-colors min-h-[36px]"
                                      >
                                        <History className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}

                                {task.status === 'failed' && (
                                  <button
                                    onClick={() => {
                                      tma.hapticImpact('light');
                                      setModalInitialTab('events');
                                      setViewingTask(task);
                                    }}
                                    type="button"
                                    aria-label={`${t('tasks.viewTimeline')} ${task.title}`}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-mono min-h-[36px]"
                                  >
                                    <History className="w-3.5 h-3.5" />
                                    <span>{t('tasks.viewTimeline')}</span>
                                  </button>
                                )}

                                {/* Audit 2026-10-21 — Hentikan / Edit / Hapus */}
                                {task.status === 'running' && (
                                  <button
                                    onClick={() => handleStopTask(task)}
                                    type="button"
                                    disabled={stoppingTaskId === task.id}
                                    aria-label={`${t('tasks.stopTask')} ${task.title}`}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-semibold min-h-[40px] disabled:opacity-60 active:scale-95 transition-transform"
                                  >
                                    <Square className="w-3.5 h-3.5" />
                                    <span>{t('tasks.stopTask')}</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => handleOpenEdit(task)}
                                  type="button"
                                  aria-label={`${t('tasks.editTask')} ${task.title}`}
                                  className="p-2 rounded-lg bg-office-surface text-office-muted border border-office-border/40 hover:text-office-text active:scale-95 transition-transform min-h-[40px] min-w-[40px] flex items-center justify-center"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteTask(task)}
                                  type="button"
                                  aria-label={`${t('tasks.deleteTask')} ${task.title}`}
                                  className="p-2 rounded-lg bg-office-surface text-office-muted border border-office-border/40 hover:text-red-400 active:scale-95 transition-transform min-h-[40px] min-w-[40px] flex items-center justify-center"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
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
        </>
      )}

      {/* Modals */}
      <CreateTaskModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        agents={agents}
        onCreate={async (taskData) => {
          const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await api.createTask({
            id: taskId,
            ...taskData,
            status: 'backlog',
            run_id: null,
            result_md: null,
            due_at: null,
            created_by: 0,
            source: 'manual',
            tool_calls_count: 0,
          });
          await fetchInitialData();
        }}
      />

      <EditTaskModal
        task={editingTask}
        agents={agents}
        onClose={() => setEditingTask(null)}
        onSave={async (id, body) => {
          await updateTask(id, body);
        }}
      />

      <TaskResultModal
        task={viewingTask}
        initialTab={modalInitialTab}
        onClose={() => setViewingTask(null)}
      />
    </div>
  );
};
