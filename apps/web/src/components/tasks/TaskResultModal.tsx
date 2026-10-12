import React from 'react';
import { FileText, X } from 'lucide-react';
import type { Task } from '@hermes-office/shared';
import { MarkdownView } from '../common/MarkdownView';

interface TaskResultModalProps {
  task: Task | null;
  onClose: () => void;
}

export const TaskResultModal: React.FC<TaskResultModalProps> = ({ task, onClose }) => {
  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 bg-office-inset backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
      <div className="glass-panel-glow w-full max-w-md max-h-[80vh] rounded-2xl p-5 bg-office-elevated border border-office-accent/40 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-office-border mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-office-accent-ink" />
            <h2 className="text-sm font-bold text-office-text truncate max-w-[240px]">
              {task.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1 text-office-muted hover:text-office-text min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {task.result_md ? (
            <MarkdownView content={task.result_md} />
          ) : (
            <p className="text-xs text-office-muted font-mono">Belum ada hasil tertulis untuk tugas ini.</p>
          )}
        </div>

        <div className="pt-3 border-t border-office-border mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-office-accent text-office-on-accent font-semibold text-xs shadow-nu-raised min-h-[44px]"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
