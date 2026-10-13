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
  AlertTriangle,
} from 'lucide-react';
import type { Task, TaskStatus } from '@hermes-office/shared';
import { useOfficeStore } from '../stores/office';
import { api } from '../services/api';
import { tma } from '../services/tma';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal';
import { TaskResultModal } from '../components/tasks/TaskResultModal';

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'border-office-border/40 text-office-muted' },
  { id: 'running', label: 'Running', color: 'border-office-accent/40 text-office-accent-ink' },
  { id: 'needs_approval', label: 'Needs Approval', color: 'border-office-warn/40 text-office-warn' },
  { id: 'done', label: 'Done', color: 'border-office-success/40 text-office-success' },
];

export const TasksScreen: React.FC = () => {
  const { t } = useTranslation();
  const { tasks, agents, fetchInitialData } = useOfficeStore();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);

  const tasksByStatus: Record<TaskStatus, Task[]> = {
    backlog: tasks.filter((t) => t.status === 'backlog' || t.status === 'queued'),
    running: tasks.filter((t) => t.status === 'running'),
    needs_approval: tasks.filter((t) => t.status === 'needs_approval'),
    done: tasks.filter((t) => t.status === 'done'),
    failed: tasks.filter((t) => t.status === 'failed'),
    queued: [],
    cancelled: tasks.filter((t) => t.status === 'cancelled'),
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
      <div className="p-4 pb-2 flex items-center justify-between border-b border-office-border bg-office-surface/90 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-office-accent-ink" />
          <h1 className="text-base font-bold text-office-text">{t('nav.tasks')}</h1>
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-office-hover text-office-accent-ink">
            {tasks.length}
          </span>
        </div>

        <button
          onClick={() => {
            tma.hapticImpact('light');
            setCreateModalOpen(true);
          }}
          type="button"
          aria-label="Buat Tugas Baru"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-office-accent text-office-on-accent font-semibold text-xs shadow-nu-raised min-h-[44px] active:scale-95 transition-all"
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
              className="w-[280px] shrink-0 snap-center flex flex-col rounded-2xl glass-panel bg-office-elevated border border-office-border overflow-hidden max-h-[calc(100vh-160px)]"
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
                            className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded ${
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

                        {task.description && (
                          <p className="text-[11px] text-office-muted mb-2 line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-office-border">
                          <div className="flex items-center gap-1.5 text-[10px] text-office-muted">
                            <span>{assignedAgent?.avatar || '🤖'}</span>
                            <span className="truncate max-w-[100px]">
                              {assignedAgent?.name || 'Unassigned'}
                            </span>
                          </div>

                          {task.status === 'backlog' && (
                            <button
                              onClick={() => handleRunTask(task.id)}
                              disabled={isRunningThis}
                              type="button"
                              aria-label={`Jalankan tugas ${task.title}`}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-office-accent text-office-on-accent font-semibold text-xs shadow-nu-raised hover:bg-cyan-300 min-h-[44px] active:scale-95 transition-all"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{isRunningThis ? 'Menjalankan...' : 'Jalankan'}</span>
                            </button>
                          )}

                          {task.status === 'running' && (
                            <div className="flex items-center gap-1 text-[10px] text-office-accent-ink font-mono animate-pulse min-h-[44px]">
                              <RotateCw className="w-3 h-3 animate-spin" />
                              <span>Berjalan</span>
                            </div>
                          )}

                          {task.status === 'needs_approval' && (
                            <div className="flex items-center gap-1 text-[10px] text-office-warn font-semibold min-h-[44px]">
                              <AlertTriangle className="w-3.5 h-3.5" />
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
                              aria-label={`Lihat hasil tugas ${task.title}`}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-office-hover hover:bg-office-hover text-office-accent-ink text-xs font-mono transition-colors min-h-[44px]"
                            >
                              <FileText className="w-3.5 h-3.5" />
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
          });
          await fetchInitialData();
        }}
      />

      <TaskResultModal
        task={viewingTask}
        onClose={() => setViewingTask(null)}
      />
    </div>
  );
};
