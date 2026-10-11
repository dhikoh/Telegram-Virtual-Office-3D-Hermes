/**
 * Reports Screen Shell (Phase 3 Web Shell; full charts & anti-hallucination reports in Phase 5)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';

export const ReportsScreen: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen p-4 pb-24 max-w-md mx-auto w-full">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-office-violet" />
        <h1 className="text-lg font-bold text-office-text">{t('nav.reports')}</h1>
      </div>

      <div className="glass-panel rounded-2xl p-6 text-center border border-white/10 flex flex-col items-center my-auto">
        <div className="w-12 h-12 rounded-xl bg-office-violet/10 flex items-center justify-center text-office-violet mb-3">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="text-sm font-bold text-office-text mb-1">Laporan & Analisis KPI</h2>
        <p className="text-xs text-office-muted leading-relaxed">
          Grafik sparkline Recharts, input KPI manual, dan generator laporan anti-halusinasi akan diaktifkan di Phase 5.
        </p>
      </div>
    </div>
  );
};
