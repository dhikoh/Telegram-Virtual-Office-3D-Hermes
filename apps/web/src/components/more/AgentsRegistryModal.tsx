/**
 * Agents Registry Modal (Rule REQ-080)
 * Displays all active agents registered in the office, connection health check, and details.
 */

import React, { useState } from 'react';
import { useOfficeStore } from '../../stores/office';
import { Users, X, CheckCircle2, AlertCircle, RefreshCw, Pencil, Trash2 } from 'lucide-react';
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
  const { agents, tasks, patchAgent, deleteAgent } = useOfficeStore();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<Record<string, 'ok' | 'error'>>({});
  // Tahap 8 — edit & hapus agen (UI nyata untuk endpoint PATCH/DELETE)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen) return null;

  const startEdit = (id: string) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    setEditingId(id);
    setEditName(agent.name);
    setEditRole(agent.role);
    setConfirmDeleteId(null);
    setActionError(null);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim() || !editRole.trim()) {
      setActionError('Nama dan peran tidak boleh kosong.');
      return;
    }
    setBusyId(id);
    setActionError(null);
    try {
      await patchAgent(id, { name: editName.trim(), role: editRole.trim() });
      setEditingId(null);
      tma.hapticNotification('success');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (id: string) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    setBusyId(id);
    setActionError(null);
    try {
      await patchAgent(id, { active: agent.active ? 0 : 1 });
      tma.hapticImpact('light');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await deleteAgent(id);
      setConfirmDeleteId(null);
      tma.hapticNotification('warning');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

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
              <React.Fragment key={agent.id}>
                <div
                  className={`p-3 rounded-xl bg-office-inset border border-office-border flex items-center justify-between gap-3 ${
                    agent.active ? '' : 'opacity-60'
                  }`}
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
                        {!agent.active && (
                          <span className="text-[9px] font-mono font-bold bg-office-danger/20 text-office-danger px-1.5 py-0.5 rounded leading-none">
                            NONAKTIF
                          </span>
                        )}
                        {agent.isDemo && (
                          <span className="text-[9px] font-mono font-bold bg-office-accent/20 text-office-accent-ink px-1.5 py-0.5 rounded leading-none">
                            DEMO
                          </span>
                        )}
                        {agent.is_system && (
                          <span className="text-[9px] font-mono font-bold bg-office-violet/20 text-office-violet px-1.5 py-0.5 rounded leading-none">
                            SISTEM
                          </span>
                        )}
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
                    {!agent.isDemo && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(agent.id)}
                          aria-label={`Edit ${agent.name}`}
                          title="Edit Agen"
                          className="p-2 rounded-lg bg-office-hover text-office-muted hover:text-office-text transition-colors min-h-[36px]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {/* Tahap 9 — agen sistem tidak punya tombol hapus (juga dijaga server). */}
                        {!agent.is_system && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(agent.id);
                              setEditingId(null);
                              setActionError(null);
                            }}
                            aria-label={`Hapus ${agent.name}`}
                            title="Hapus Agen"
                            className="p-2 rounded-lg bg-office-hover text-office-danger hover:text-office-danger transition-colors min-h-[36px]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {editingId === agent.id && (
                  <div className="p-3 rounded-xl bg-office-elevated border border-office-accent/40 flex flex-col gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nama agen"
                      aria-label="Nama agen"
                      className="bg-office-inset border border-office-border rounded-lg px-3 py-2 text-xs text-office-text min-h-[40px]"
                    />
                    <input
                      type="text"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      placeholder="Peran agen"
                      aria-label="Peran agen"
                      className="bg-office-inset border border-office-border rounded-lg px-3 py-2 text-xs text-office-text min-h-[40px]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleActive(agent.id)}
                        disabled={busyId === agent.id}
                        className={`px-3 py-2 rounded-lg text-[11px] font-bold border min-h-[36px] ${
                          agent.active
                            ? 'border-office-danger/50 text-office-danger'
                            : 'border-office-success/50 text-office-success'
                        }`}
                      >
                        {agent.active ? 'Nonaktifkan' : 'Aktifkan lagi'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(agent.id)}
                        disabled={busyId === agent.id}
                        className="px-3 py-2 rounded-lg bg-office-accent text-office-on-accent text-[11px] font-bold min-h-[36px] disabled:opacity-50"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-2 rounded-lg bg-office-hover border border-office-border text-[11px] text-office-muted min-h-[36px]"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                {confirmDeleteId === agent.id && (
                  <div className="p-3 rounded-xl bg-office-elevated border border-office-danger/50 flex flex-col gap-2">
                    <span className="text-[11px] text-office-text">
                      Hapus <strong>{agent.name}</strong> dari kantor?
                    </span>
                    <span className="text-[10px] text-office-muted">
                      Agen dihapus permanen dari roster beserta kunci API tersimpan dan{' '}
                      {tasks.filter((t) => t.agent_id === agent.id).length} tugas yang ditugaskan
                      kepadanya. Riwayat di gateway tetap tersimpan.
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void confirmDelete(agent.id)}
                        disabled={busyId === agent.id}
                        className="px-3 py-2 rounded-lg bg-office-danger text-office-on-accent text-[11px] font-bold min-h-[36px] disabled:opacity-50"
                      >
                        {busyId === agent.id ? 'Menghapus...' : 'Ya, hapus'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-2 rounded-lg bg-office-hover border border-office-border text-[11px] text-office-muted min-h-[36px]"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                {actionError && editingId !== agent.id && confirmDeleteId !== agent.id && (
                  <div className="p-2 rounded-lg bg-office-danger/10 border border-office-danger/40 text-[10px] text-office-danger break-all">
                    {actionError}
                  </div>
                )}
              </React.Fragment>
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
