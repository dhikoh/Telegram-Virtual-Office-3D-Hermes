/**
 * View Mode Settings Card (Rule 9.3 & REQ-108)
 * Settings toggle between 2D and 3D floor plan with low-power state awareness.
 */

import React from 'react';
import { Box } from 'lucide-react';
import { useViewModeStore } from '../../stores/view-mode';
import { usePowerStore } from '../../stores/power';
import { tma } from '../../services/tma';

export const ViewModeCard: React.FC = () => {
  const { viewMode, setViewMode, webGLSupported } = useViewModeStore();
  const { isLowPower } = usePowerStore();

  const is3DDisabled = isLowPower || !webGLSupported;

  const handleSelect = (mode: '2D' | '3D') => {
    if (mode === '3D' && is3DDisabled) return;
    tma.hapticSelection();
    setViewMode(mode);
  };

  return (
    <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2.5 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-office-text">
          <Box className="w-4 h-4 text-office-accent-ink" />
          <span>Tampilan Denah Kantor</span>
        </div>
        <span className="text-[10px] font-mono text-office-muted">
          {viewMode} Mode Aktif
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleSelect('2D')}
          type="button"
          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all min-h-[44px] flex flex-col items-center justify-center ${
            viewMode === '2D'
              ? 'bg-office-accent text-office-on-accent font-bold shadow-nu-raised'
              : 'bg-office-hover text-office-muted hover:text-office-text'
          }`}
        >
          <span>2D Flat</span>
          <span className="text-[9px] opacity-75 font-mono">Ringan & Standar</span>
        </button>

        <button
          onClick={() => handleSelect('3D')}
          disabled={is3DDisabled}
          type="button"
          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all min-h-[44px] flex flex-col items-center justify-center ${
            viewMode === '3D'
              ? 'bg-office-accent text-office-on-accent font-bold shadow-nu-raised'
              : is3DDisabled
              ? 'bg-office-hover text-office-muted cursor-not-allowed opacity-40 border border-office-border'
              : 'bg-office-hover text-office-muted hover:text-office-text'
          }`}
        >
          <span>3D Isometrik</span>
          <span className="text-[9px] opacity-75 font-mono">
            {isLowPower ? 'Mati (Mode Hemat)' : !webGLSupported ? 'Tidak Didukung' : 'Procedural Neon'}
          </span>
        </button>
      </div>

      {isLowPower && (
        <span className="text-[10px] text-office-warn font-mono">
          * 3D dinonaktifkan dalam mode hemat daya (Low-Power ECO).
        </span>
      )}
      {!webGLSupported && !isLowPower && (
        <span className="text-[10px] text-office-danger font-mono">
          * Perangkat Anda tidak mendukung WebGL rendering.
        </span>
      )}
    </div>
  );
};
