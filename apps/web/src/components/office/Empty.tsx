/**
 * Empty State Onboarding Card (Rule REQ-074 & Section 8)
 * Displayed when no agents are registered yet.
 *
 * Tahap 7: the primary path is hiring a real agent (the recruitment wizard is
 * wired end-to-end), not loading a demo. The demo remains available but is
 * secondary and labelled — it never masquerades as production data.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Building2, ShieldCheck, Zap, UserPlus } from 'lucide-react';
import { useOfficeStore } from '../../stores/office';
import { tma } from '../../services/tma';

interface EmptyOfficeProps {
  onOpenRecruitment?: () => void;
}

export const EmptyOffice: React.FC<EmptyOfficeProps> = ({ onOpenRecruitment }) => {
  const { t } = useTranslation();
  const { loadDemoOffice, isLoading } = useOfficeStore();

  const handleHireFirst = () => {
    tma.hapticImpact('heavy');
    if (onOpenRecruitment) {
      onOpenRecruitment();
    } else {
      // Fallback when rendered outside the Office screen shell
      window.location.hash = 'more';
    }
  };

  const handleLoadDemo = async () => {
    tma.hapticImpact('medium');
    await loadDemoOffice();
  };

  return (
    <div className="w-full max-w-sm mx-auto my-6 px-4">
      <div className="glass-panel-glow rounded-2xl p-6 flex flex-col items-center text-center border border-office-accent/30 bg-office-elevated shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-office-accent/10 border border-office-accent/30 flex items-center justify-center text-2xl mb-4 shadow-nu-raised">
          <Building2 className="w-7 h-7 text-office-accent-ink" />
        </div>

        <h2 className="text-lg font-bold text-office-text mb-2">
          {t('office.emptyTitle')}
        </h2>

        <p className="text-xs text-office-muted leading-relaxed mb-6">
          Kantor masih kosong. Rekrut agen pertama untuk mulai bekerja dengan sungguhan.
        </p>

        {/* Feature Highlights */}
        <div className="w-full grid grid-cols-2 gap-2 mb-6 text-left">
          <div className="glass-panel rounded-lg p-2.5 border border-office-border flex items-start gap-2">
            <Zap className="w-4 h-4 text-office-accent-ink shrink-0 mt-0.5" />
            <span className="text-[11px] text-office-text/80 leading-snug">
              8 Divisi Agen Otonom
            </span>
          </div>
          <div className="glass-panel rounded-lg p-2.5 border border-office-border flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-office-warn shrink-0 mt-0.5" />
            <span className="text-[11px] text-office-text/80 leading-snug">
              Gerbang Persetujuan CEO
            </span>
          </div>
        </div>

        {/* Primary CTA: hire a real agent */}
        <button
          onClick={handleHireFirst}
          type="button"
          className="w-full py-3 px-4 rounded-xl bg-office-accent text-office-on-accent font-semibold text-sm flex items-center justify-center gap-2 hover:bg-cyan-300 active:scale-95 transition-all shadow-nu-raised min-h-[46px]"
        >
          <UserPlus className="w-4 h-4" />
          <span>Rekrut Agen Pertama</span>
        </button>

        {/* Secondary, explicitly labelled demo path */}
        <button
          onClick={handleLoadDemo}
          disabled={isLoading}
          type="button"
          className="w-full mt-2 py-2.5 px-4 rounded-xl bg-office-inset border border-office-border font-semibold text-xs flex items-center justify-center gap-2 text-office-muted hover:text-office-text active:scale-95 transition-all min-h-[44px] disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isLoading ? t('office.loadingDemo') : 'Lihat Kantor DEMO (simulasi)'}</span>
        </button>

        <span className="text-[10px] text-office-muted mt-3 font-mono">
          Mode demo menampilkan data simulasi berlabel DEMO.
        </span>
      </div>
    </div>
  );
};
