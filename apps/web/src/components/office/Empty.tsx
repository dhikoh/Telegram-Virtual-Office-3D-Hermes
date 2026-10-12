/**
 * Empty State Onboarding Card (Rule REQ-074 & Section 8)
 * Displayed when no agents are registered yet.
 * Includes "Load demo office" CTA button with prominent DEMO badges.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Building2, ShieldCheck, Zap } from 'lucide-react';
import { useOfficeStore } from '../../stores/office';
import { tma } from '../../services/tma';

export const EmptyOffice: React.FC = () => {
  const { t } = useTranslation();
  const { loadDemoOffice, isLoading } = useOfficeStore();

  const handleLoadDemo = async () => {
    tma.hapticImpact('heavy');
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
          {t('office.emptyDesc')}
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

        {/* Action Button: Load Demo Office */}
        <button
          onClick={handleLoadDemo}
          disabled={isLoading}
          type="button"
          className="w-full py-3 px-4 rounded-xl bg-office-accent text-office-on-accent font-semibold text-sm flex items-center justify-center gap-2 hover:bg-cyan-300 active:scale-95 transition-all shadow-nu-raised min-h-[46px] disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isLoading ? t('office.loadingDemo') : t('office.loadDemo')}</span>
        </button>

        <span className="text-[10px] text-office-muted/70 mt-3 font-mono">
          Semua agen simulasi ditandai badge DEMO resmi.
        </span>
      </div>
    </div>
  );
};
