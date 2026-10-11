/**
 * Tasks Screen Shell (Phase 3 Web Shell placeholder; full Kanban in Phase 4)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare } from 'lucide-react';

export const TasksScreen: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen p-4 pb-24 max-w-md mx-auto w-full">
      <div className="flex items-center gap-2 mb-4">
        <CheckSquare className="w-5 h-5 text-office-cyan" />
        <h1 className="text-lg font-bold text-office-text">{t('nav.tasks')}</h1>
      </div>

      <div className="glass-panel rounded-2xl p-6 text-center border border-white/10 flex flex-col items-center my-auto">
        <div className="w-12 h-12 rounded-xl bg-office-cyan/10 flex items-center justify-center text-office-cyan mb-3">
          <CheckSquare className="w-6 h-6" />
        </div>
        <h2 className="text-sm font-bold text-office-text mb-1">Kanban & Task Dispatcher</h2>
        <p className="text-xs text-office-muted leading-relaxed">
          Fitur manajemen tugas, antrean backlog, dan pelacakan live execution akan diaktifkan secara lengkap di Phase 4.
        </p>
      </div>
    </div>
  );
};
