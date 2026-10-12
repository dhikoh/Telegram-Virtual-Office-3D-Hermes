import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'Terjadi kesalahan saat memuat data.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      data-testid="error-state"
      className={`flex flex-col items-center justify-center p-8 gap-3 text-center text-office-red ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-office-red/10 border border-office-red/30 flex items-center justify-center text-office-red mb-1">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-white">Gagal Memuat Data</h3>
      <p className="text-xs max-w-xs text-office-red/90 leading-relaxed font-mono">{message}</p>
      {onRetry && (
        <button
          type="button"
          data-testid="retry-button"
          onClick={onRetry}
          className="mt-2 px-4 py-2 min-h-[44px] rounded-xl bg-office-red/15 hover:bg-office-red/25 border border-office-red/40 text-xs font-semibold text-office-red transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Coba Lagi</span>
        </button>
      )}
    </div>
  );
};
