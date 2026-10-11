/**
 * Inbox Screen Shell (Phase 3 Web Shell; full approval resolution in Phase 4)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, ShieldAlert } from 'lucide-react';
import { useOfficeStore } from '../stores/office';

export const InboxScreen: React.FC = () => {
  const { t } = useTranslation();
  const { approvals } = useOfficeStore();

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  return (
    <div className="flex flex-col min-h-screen p-4 pb-24 max-w-md mx-auto w-full">
      <div className="flex items-center gap-2 mb-4">
        <Inbox className="w-5 h-5 text-office-warn" />
        <h1 className="text-lg font-bold text-office-text">{t('nav.inbox')}</h1>
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="glass-panel rounded-2xl p-6 text-center border border-white/10 flex flex-col items-center my-auto">
          <div className="w-12 h-12 rounded-xl bg-office-warn/10 flex items-center justify-center text-office-warn mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-office-text mb-1">Tidak Ada Persetujuan Tertunda</h2>
          <p className="text-xs text-office-muted leading-relaxed">
            Semua aksi operasional agen berjalan normal tanpa memerlukan konfirmasi manual.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pendingApprovals.map((app) => (
            <div key={app.id} className="glass-panel rounded-xl p-4 border border-office-warn/40 bg-office-warn/5">
              <div className="flex items-center gap-2 text-office-warn text-xs font-semibold mb-1">
                <ShieldAlert className="w-4 h-4" />
                <span>Persetujuan Diperlukan</span>
              </div>
              <p className="text-xs text-office-text mb-2">{app.summary}</p>
              <span className="text-[10px] text-office-muted font-mono">Run ID: {app.run_id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
