import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { AgentPublic, TaskPriority } from '@hermes-office/shared';
import { tma } from '../../services/tma';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: AgentPublic[];
  defaultAgentId?: string;
  onCreate: (task: {
    title: string;
    description: string;
    agent_id: string;
    priority: TaskPriority;
  }) => Promise<void>;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  agents,
  defaultAgentId,
  onCreate,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId || agents[0]?.id || '');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    tma.hapticImpact('medium');

    try {
      await onCreate({
        title: newTitle.trim(),
        description: newDescription.trim(),
        agent_id: selectedAgentId || agents[0]?.id || '',
        priority: newPriority,
      });
      tma.hapticNotification('success');
      setNewTitle('');
      setNewDescription('');
      onClose();
    } catch {
      tma.hapticNotification('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-office-inset backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
      <form
        onSubmit={handleSubmit}
        className="glass-panel-glow w-full max-w-sm rounded-2xl p-5 bg-office-elevated border border-office-accent/40 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between pb-3 border-b border-office-border mb-3">
          <h2 className="text-sm font-bold text-office-text flex items-center gap-2">
            <Plus className="w-4 h-4 text-office-accent-ink" />
            <span>Buat Tugas Baru</span>
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="p-1 text-office-muted hover:text-office-text min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 text-xs">
          <div>
            <label className="text-[11px] text-office-muted mb-1 block">Judul Tugas *</label>
            <input
              type="text"
              required
              maxLength={1000}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Contoh: Analisis tren viral hashtag #AI..."
              className="w-full bg-office-inset border border-office-border rounded-xl px-3 py-2 text-office-text placeholder:text-office-muted/40 focus:outline-none focus:border-office-accent min-h-[44px]"
            />
          </div>

          <div>
            <label className="text-[11px] text-office-muted mb-1 block">Deskripsi Tugas</label>
            <textarea
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Instruksi detail untuk agen..."
              className="w-full bg-office-inset border border-office-border rounded-xl p-2.5 text-office-text placeholder:text-office-muted/40 focus:outline-none focus:border-office-accent resize-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-office-muted mb-1 block">Tugaskan ke Agen *</label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-office-inset border border-office-border rounded-xl px-3 py-2 text-office-text focus:outline-none focus:border-office-accent min-h-[44px]"
            >
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id} className="bg-office-elevated text-office-text">
                  {ag.avatar} {ag.name} ({ag.role} - {ag.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-office-muted mb-1 block">Prioritas</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['low', 'normal', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setNewPriority(p)}
                  className={`py-1.5 rounded-lg text-[10px] font-mono uppercase font-semibold transition-all min-h-[44px] flex items-center justify-center ${
                    newPriority === p
                      ? 'bg-office-accent text-office-on-accent shadow-nu-raised'
                      : 'bg-office-hover text-office-muted hover:text-office-text'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4 pt-3 border-t border-office-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-office-hover hover:bg-office-hover text-xs font-semibold text-office-muted hover:text-office-text min-h-[44px]"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!newTitle.trim() || isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-office-accent text-office-on-accent text-xs font-bold hover:bg-cyan-300 disabled:opacity-40 transition-all shadow-nu-raised min-h-[44px]"
          >
            {isSubmitting ? 'Menyimpan...' : 'Simpan Tugas'}
          </button>
        </div>
      </form>
    </div>
  );
};
