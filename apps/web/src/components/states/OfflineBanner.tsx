import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export interface OfflineBannerProps {
  message?: string;
  onReconnect?: () => void;
  className?: string;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  message = 'Koneksi terputus. Mode offline aktif.',
  onReconnect,
  className = '',
}) => {
  return (
    <div
      data-testid="offline-banner"
      role="alert"
      className={`w-full py-2 px-3 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2 ${className}`}
    >
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="font-mono">{message}</span>
      </div>
      {onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="px-2.5 py-1 min-h-[32px] rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-semibold text-amber-200 transition-colors flex items-center gap-1 shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Hubungkan</span>
        </button>
      )}
    </div>
  );
};
