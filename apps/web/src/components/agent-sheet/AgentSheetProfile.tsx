import React, { useState } from 'react';
import { HeartPulse, CheckCircle, AlertCircle } from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';

interface AgentSheetProfileProps {
  agent: OfficeAgent;
}

export const AgentSheetProfile: React.FC<AgentSheetProfileProps> = ({ agent }) => {
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'healthy' | 'error'>('idle');
  const [healthMessage, setHealthMessage] = useState<string | null>(null);

  const handleCheckHealth = async () => {
    setHealthStatus('checking');
    try {
      const res = await api.getAgentHealth(agent.id);
      setHealthStatus(res.status === 'healthy' ? 'healthy' : 'error');
      setHealthMessage(res.status === 'healthy' ? 'Gateway aktif & siap melayani tugas' : 'Gateway merespons dengan kendala');
      tma.hapticNotification('success');
    } catch (err: unknown) {
      setHealthStatus('error');
      setHealthMessage(err instanceof Error ? err.message : 'Gateway tidak terjangkau');
      tma.hapticNotification('error');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
      <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2">
        <span className="text-xs font-semibold text-office-accent-ink">Ringkasan Karakter (SOUL)</span>
        <p className="text-xs text-office-text/90 leading-relaxed bg-office-inset p-2.5 rounded-lg border border-office-border">
          {agent.soul_summary || 'Tidak ada deskripsi jiwa (SOUL) tersimpan.'}
        </p>
      </div>

      <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2 text-xs">
        <span className="text-xs font-semibold text-office-text">Spesifikasi Profile</span>
        <div className="flex justify-between py-1 border-b border-office-border">
          <span className="text-office-muted">Hermes Profile:</span>
          <span className="font-mono text-office-text">{agent.hermes_profile}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-office-muted">Endpoint Gateway:</span>
          <span className="font-mono text-office-text">
            {agent.endpoint_configured ? 'Endpoint terpasang' : 'Belum diatur'}
          </span>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-office-text">
            <HeartPulse className="w-4 h-4 text-office-accent-ink" />
            <span>Kesehatan Gateway Agen</span>
          </div>
          <button
            onClick={handleCheckHealth}
            disabled={healthStatus === 'checking'}
            type="button"
            className="px-3 py-1.5 rounded-lg bg-office-accent/10 hover:bg-office-accent/20 border border-office-accent/30 text-xs font-semibold text-office-accent-ink transition-colors min-h-[44px] flex items-center justify-center"
          >
            {healthStatus === 'checking' ? 'Memeriksa...' : 'Uji Koneksi'}
          </button>
        </div>
        {healthMessage && (
          <div
            className={`p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
              healthStatus === 'healthy'
                ? 'bg-office-success/10 text-office-success border border-office-success/30'
                : 'bg-office-danger/10 text-office-danger border border-office-danger/30'
            }`}
          >
            {healthStatus === 'healthy' ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span>{healthMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
