import React from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Tidak Ada Data',
  description = 'Belum ada item untuk ditampilkan.',
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      data-testid="empty-state"
      className={`flex flex-col items-center justify-center p-8 gap-3 text-center text-office-muted ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-office-hover border border-office-border flex items-center justify-center text-office-accent-ink mb-1">
        <Inbox className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-office-text">{title}</h3>
      <p className="text-xs max-w-xs text-office-muted leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 px-4 py-2 min-h-[44px] rounded-xl bg-office-accent/15 hover:bg-office-accent/25 border border-office-accent/30 text-xs font-semibold text-office-accent-ink transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
