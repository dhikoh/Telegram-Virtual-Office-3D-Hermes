/**
 * Edit tugas — Audit 2026-10-21.
 *
 * Papan sebelumnya tidak punya jalan untuk memperbaiki tugas yang salah
 * (judul salah tulis, penerima keliru, prioritas tidak sesuai). Komponen ini
 * mengirim PATCH /api/tasks/:id dengan kolom yang diizinkan server
 * (title, description, priority, agent_id, due_at) dan tidak pernah
 * mengirim `status` — perpindahan status diatur tombol Jalankan/Hentikan.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, X } from 'lucide-react';
import type { AgentPublic, Task, TaskPriority } from '@hermes-office/shared';
import { tma } from '../../services/tma';

interface EditTaskModalProps {
  task: Task | null;
  agents: AgentPublic[];
  onClose: () => void;
  onSave: (
    id: string,
    body: { title: string; description: string; priority: TaskPriority; agent_id: string }
  ) => Promise<void>;
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({ task, agents, onClose, onSave }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [agentId, setAgentId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description || '');
    setPriority(task.priority);
    setAgentId(task.agent_id);
    setError(null);
  }, [task]);

  if (!task) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError(t('tasks.editTitleRequired'));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(task.id, {
        title: title.trim(),
        description: description.trim(),
        priority,
        agent_id: agentId,
      });
      tma.hapticNotification('success');
      onClose();
    } catch (err: unknown) {
      tma.hapticNotification('error');
      setError(err instanceof Error ? err.message : t('tasks.editFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] isolate bg-office-inset backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl glass-panel bg-office-elevated border border-office-border p-4 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-office-text">{t('tasks.editTask')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('tasks.close')}
            className="p-2 rounded-lg bg-office-hover text-office-muted hover:text-office-text min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-office-muted">{t('tasks.editTitle')}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={1000}
            className="px-3 py-2 rounded-xl bg-office-inset border border-office-border text-sm text-office-text min-h-[44px]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-office-muted">{t('tasks.editDescription')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="px-3 py-2 rounded-xl bg-office-inset border border-office-border text-sm text-office-text resize-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-office-muted">{t('tasks.editPriority')}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="px-2 py-2 rounded-xl bg-office-inset border border-office-border text-sm text-office-text min-h-[44px]"
            >
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-office-muted">{t('tasks.editAssignee')}</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="px-2 py-2 rounded-xl bg-office-inset border border-office-border text-sm text-office-text min-h-[44px]"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-xs text-office-danger">{error}</p>}

        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-office-accent text-office-on-accent font-semibold text-sm min-h-[44px] disabled:opacity-60 active:scale-95 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? t('tasks.saving') : t('tasks.editSave')}</span>
        </button>
      </form>
    </div>
  );
};
