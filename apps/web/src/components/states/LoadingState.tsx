import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Memuat data...',
  className = '',
}) => {
  return (
    <div
      data-testid="loading-state"
      className={`flex flex-col items-center justify-center p-8 gap-3 text-office-muted ${className}`}
    >
      <Loader2 className="w-8 h-8 animate-spin text-office-accent-ink" />
      <span className="text-xs font-mono">{message}</span>
    </div>
  );
};
