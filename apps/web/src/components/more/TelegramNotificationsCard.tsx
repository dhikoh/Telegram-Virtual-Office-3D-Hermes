/**
 * Telegram Notifications Settings Card (Rule REQ-085 & REQ-093)
 * Displays bot notification status, triggers, and interactive notification test.
 */

import React, { useState } from 'react';
import { Bell, CheckCircle2, Send, ExternalLink, ShieldCheck } from 'lucide-react';
import { tma } from '../../services/tma';

export const TelegramNotificationsCard: React.FC = () => {
  const [testSent, setTestSent] = useState(false);
  const [previewNotification, setPreviewNotification] = useState<string | null>(null);

  const handleTestNotification = () => {
    tma.hapticNotification('success');
    setTestSent(true);
    setPreviewNotification(
      '⚠️ Persetujuan Diperlukan\nAgen: Nova Social\nRingkasan: Publikasi Tweet Kampanye Peluncuran\nID: appr_demo_sample'
    );
    setTimeout(() => {
      setTestSent(false);
    }, 4000);
  };

  return (
    <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-office-accent/15 text-office-accent-ink">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-office-text">Notifikasi Telegram Bot</span>
            <span className="text-[10px] text-office-muted">Pesan langsung ke CEO via sendMessage</span>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-office-success/20 text-office-success border border-office-success/30">
          <CheckCircle2 className="w-3 h-3" />
          Aktif
        </span>
      </div>

      {/* Triggers list */}
      <div className="bg-office-elevated rounded-lg p-2.5 border border-office-border flex flex-col gap-1.5 text-[11px] text-office-muted">
        <div className="flex items-center gap-1.5">
          <span className="text-office-warn">⚠️</span>
          <span>Persetujuan Aksi Agen Tertunda</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-office-danger">🚨</span>
          <span>Kegagalan / Error Eksekusi Tugas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-office-accent-ink">📊</span>
          <span>Laporan Kinerja Departemen Siap</span>
        </div>
      </div>

      {/* Action / Test Button (Touch target >= 44px) */}
      <button
        onClick={handleTestNotification}
        type="button"
        aria-label="Uji Notifikasi Telegram Bot"
        className="w-full py-2.5 px-3 rounded-lg bg-office-hover hover:bg-office-hover border border-office-border flex items-center justify-between text-xs text-office-text min-h-[44px] transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-office-accent-ink" />
          <span>Uji Format Notifikasi Bot</span>
        </div>
        <span className="text-[10px] font-mono text-office-accent-ink font-semibold">
          {testSent ? 'Terkirim ✓' : 'Kirim Uji'}
        </span>
      </button>

      {/* Preview box if triggered */}
      {previewNotification && (
        <div className="p-2.5 rounded-lg bg-office-elevated border border-office-accent/30 flex flex-col gap-1.5 animate-in fade-in">
          <span className="text-[9px] font-mono text-office-muted uppercase tracking-wider">
            Simulasi Tampilan Telegram:
          </span>
          <pre className="text-[11px] text-cyan-200 font-mono whitespace-pre-wrap leading-tight">
            {previewNotification}
          </pre>
          <div className="mt-1 pt-1 border-t border-office-border flex items-center justify-between">
            <span className="text-[10px] text-office-muted">Tombol Telegram:</span>
            <span className="text-[10px] font-semibold text-office-accent-ink flex items-center gap-1">
              [Buka Virtual Office] <ExternalLink className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-office-muted pt-0.5">
        <ShieldCheck className="w-3.5 h-3.5 text-office-success shrink-0" />
        <span>Kepatuhan REQ-011: Server hanya menggunakan sendMessage, aman tanpa konflik webhook.</span>
      </div>
    </div>
  );
};
