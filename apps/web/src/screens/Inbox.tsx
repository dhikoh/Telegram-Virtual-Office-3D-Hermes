/**
 * Inbox Screen — Approvals & Notifications (Rule S7, REQ-035, REQ-077)
 * Displays pending approvals first (with FULL action text, explicit big buttons, haptics),
 * followed by execution errors, and finished reports/task updates.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Inbox,
  ShieldAlert,
  Check,
  X,
  AlertTriangle,
  FileCheck,
  Terminal,
} from 'lucide-react';
import { useOfficeStore } from '../stores/office';
import { api } from '../services/api';
import { tma } from '../services/tma';

export const InboxScreen: React.FC = () => {
  const { t } = useTranslation();
  const { approvals, agents, tasks, fetchInitialData } = useOfficeStore();

  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const failedTasks = tasks.filter((t) => t.status === 'failed');
  const completedTasks = tasks.filter((t) => t.status === 'done');

  // Handle explicit approval resolution (Rule S7: explicit tap, no auto-approve, haptic feedback)
  const handleResolveApproval = async (approvalId: string, decision: 'approve' | 'deny') => {
    setResolvingId(approvalId);
    if (decision === 'approve') {
      tma.hapticNotification('success');
    } else {
      tma.hapticNotification('error');
    }

    try {
      await api.resolveApproval(approvalId, decision);
      await fetchInitialData();
    } catch {
      tma.hapticNotification('error');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-4 pb-24 max-w-md mx-auto w-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-office-border">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-office-warn" />
          <h1 className="text-base font-bold text-office-text">{t('nav.inbox')}</h1>
        </div>
        {pendingApprovals.length > 0 && (
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-office-warn/20 text-office-warn border border-office-warn/40 animate-pulse">
            {pendingApprovals.length} Persetujuan
          </span>
        )}
      </div>

      <div className="flex flex-col gap-5">
        {/* SECTION 1: PENDING APPROVALS FIRST (Rule S7 & REQ-077) */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-office-warn" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-office-warn">
              Persetujuan CEO Tertunda
            </h2>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="glass-panel rounded-xl p-4 text-center border border-office-border text-xs text-office-text/75">
              Tidak ada persetujuan yang memerlukan konfirmasi Anda saat ini.
            </div>
          ) : (
            pendingApprovals.map((app) => {
              const agent = agents.find((a) => a.id === app.agent_id);
              const isResolving = resolvingId === app.id;

              return (
                <div
                  key={app.id}
                  className="glass-panel-glow rounded-2xl p-4 bg-office-elevated border-2 border-office-warn/60 shadow-nu-raised flex flex-col gap-3"
                >
                  {/* Agent Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-office-border">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-office-elevated border border-office-warn/40 flex items-center justify-center text-lg">
                        {agent?.avatar || '🤖'}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-office-text leading-tight block">
                          {agent?.name || app.agent_id}
                        </span>
                        <span className="text-[10px] text-office-warn font-medium">
                          Divisi {agent?.department || 'Command'}
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono bg-office-warn/20 text-office-warn px-2 py-0.5 rounded font-bold">
                      PERLU PERSETUJUAN
                    </span>
                  </div>

                  {/* Summary */}
                  <div>
                    <span className="text-[11px] text-office-muted block mb-0.5">Tindakan Yang Diminta:</span>
                    <p className="text-xs font-medium text-office-text leading-relaxed">
                      {app.summary}
                    </p>
                  </div>

                  {/* FULL ACTION TEXT / PAYLOAD (Rule S7: show FULL action text) */}
                  <div className="rounded-xl bg-office-inset border border-office-border p-3 overflow-x-auto">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-office-warn mb-1">
                      <Terminal className="w-3 h-3" />
                      <span>Detail Aksi Lengkap (Payload)</span>
                    </div>
                    <pre className="font-mono text-[11px] text-office-accent-ink/90 whitespace-pre-wrap break-all leading-tight">
                      {app.payload_json || JSON.stringify(app, null, 2)}
                    </pre>
                  </div>

                  {/* Explicit Decision Buttons (Rule S7 & REQ-035: min-h >= 48px, explicit tap) */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleResolveApproval(app.id, 'deny')}
                      disabled={isResolving}
                      type="button"
                      className="py-3 px-3 rounded-xl bg-office-danger/15 border border-office-danger/40 hover:bg-office-danger/25 text-office-danger text-xs font-bold flex items-center justify-center gap-1.5 min-h-[48px] active:scale-95 transition-all disabled:opacity-40"
                    >
                      <X className="w-4 h-4" />
                      <span>{isResolving ? 'Memproses...' : 'Tolak Aksi'}</span>
                    </button>

                    <button
                      onClick={() => handleResolveApproval(app.id, 'approve')}
                      disabled={isResolving}
                      type="button"
                      className="py-3 px-3 rounded-xl bg-office-success text-office-muted hover:bg-office-success text-xs font-bold flex items-center justify-center gap-1.5 min-h-[48px] active:scale-95 transition-all shadow-[0_0_15px_rgba(52,211,153,0.3)] disabled:opacity-40"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>{isResolving ? 'Memproses...' : 'Setujui Aksi'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* SECTION 2: ERRORS & WARNINGS */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-office-danger" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-office-danger">
              Laporan Galat & Masalah
            </h2>
          </div>

          {failedTasks.length === 0 ? (
            <div className="glass-panel rounded-xl p-3 text-center border border-office-border text-xs text-office-muted">
              Tidak ada kegagalan tugas terdeteksi. Sistem berjalan stabil.
            </div>
          ) : (
            failedTasks.map((t) => (
              <div key={t.id} className="glass-panel rounded-xl p-3 border border-office-danger/30 bg-office-danger/5 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-office-danger shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-xs font-semibold text-office-text">{t.title}</h4>
                  <span className="text-[10px] text-office-muted font-mono">Tugas gagal dieksekusi oleh agen {t.agent_id}</span>
                </div>
              </div>
            ))
          )}
        </section>

        {/* SECTION 3: FINISHED TASKS / NOTIFICATIONS */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-office-success" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-office-success">
              Pemberitahuan Tugas Selesai
            </h2>
          </div>

          {completedTasks.length === 0 ? (
            <div className="glass-panel rounded-xl p-3 text-center border border-office-border text-xs text-office-muted">
              Belum ada tugas selesai pada sesi ini.
            </div>
          ) : (
            completedTasks.slice(0, 5).map((t) => (
              <div key={t.id} className="glass-panel rounded-xl p-3 border border-office-border flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-medium text-office-text">{t.title}</h4>
                  <span className="text-[10px] text-office-muted font-mono">Selesai • Ditugaskan ke: {t.agent_id}</span>
                </div>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-office-success/10 text-office-success border border-office-success/30 font-semibold">
                  DONE
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
};
