/**
 * Agents Registry Modal (Rule REQ-080)
 * Displays all active agents registered in the office, connection health check, and details.
 */

import React, { useState } from 'react';
import { useOfficeStore } from '../../stores/office';
import { Users, X, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { tma } from '../../services/tma';

interface AgentsRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent?: (id: string) => void;
}

export const AgentsRegistryModal: React.FC<AgentsRegistryModalProps> = ({
  isOpen,
  onClose,
  onSelectAgent,
}) => {
  const { agents } = useOfficeStore();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<Record<string, 'ok' | 'error'>>({});

  if (!isOpen) return null;

  const handleTestHealth = async (agentId: string) => {
    tma.hapticImpact('light');
    setTestingId(agentId);
    try {
      const res = await api.getAgentHealth(agentId);
      if (res.status === 'ok') {
        setHealthStatus((prev) => ({ ...prev, [agentId]: 'ok' }));
        tma.hapticNotification('success');
      } else {
        setHealthStatus((prev) => ({ ...prev, [agentId]: 'error' }));
        tma.hapticNotification('warning');
      }
    } catch {
      setHealthStatus((prev) => ({ ...prev, [agentId]: 'error' }));
      tma.hapticNotification('error');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] isolate flex items-center justify-center bg-office-inset backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-office-elevated border border-office-accent/40 rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-office-border">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-office-accent-ink" />
            <h3 className="text-sm font-bold text-office-text">Registri Agen ({agents.length})</h3>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-office-muted hover:text-office-text p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {agents.length === 0 ? (
            <div className="p-8 text-center text-xs text-office-muted">
              Belum ada agen terdaftar di sistem.
            </div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.id}
                className="p-3 rounded-xl bg-office-inset border border-office-border flex items-center justify-between gap-3"
              >
                <div
                  className="flex items-center gap-2.5 flex-1 cursor-pointer"
                  onClick={() => {
                    if (onSelectAgent) {
                      onSelectAgent(agent.id);
                      onClose();
                    }
                  }}
                >
                  <span className="text-2xl">{agent.avatar || '🤖'}</span>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-office-text">{agent.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-office-hover text-office-accent-ink">
                        {agent.department}
                      </span>
                    </div>
                    <span className="text-[11px] text-office-muted">{agent.role}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {healthStatus[agent.id] === 'ok' && (
                    <span className="text-[10px] font-mono text-office-success flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Online</span>
                    </span>
                  )}
                  {healthStatus[agent.id] === 'error' && (
                    <span className="text-[10px] font-mono text-office-danger flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Error</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleTestHealth(agent.id)}
                    disabled={testingId === agent.id}
                    title="Uji Koneksi Gateway"
                    className="p-2 rounded-lg bg-office-hover hover:bg-office-hover text-office-muted hover:text-office-accent-ink transition-colors min-h-[36px]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingId === agent.id ? 'animate-spin text-office-accent-ink' : ''}`} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-muted hover:text-office-text min-h-[44px]"
        >
          Tutup
        </button>
      </div>
    </div>
  );
};
