/**
 * Floating "Ask Office" Button (Rule REQ-073 & Section 8)
 * Quick floating action button to chat with the default orchestrator agent.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { tma } from '../../services/tma';
import { usePowerStore } from '../../stores/power';

interface AskOfficeProps {
  onClick: () => void;
}

export const AskOffice: React.FC<AskOfficeProps> = ({ onClick }) => {
  const { t } = useTranslation();
  const { isLowPower } = usePowerStore();

  const handleClick = () => {
    tma.hapticImpact('medium');
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      className={`fixed bottom-20 right-4 z-30 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-office-elevated text-office-accent-ink border border-office-accent/40 backdrop-blur-md shadow-nu-raised active:scale-95 transition-all min-h-[44px] ${
        isLowPower ? '' : 'hover:border-office-accent animate-pulse-ring'
      }`}
    >
      <div className="w-6 h-6 rounded-full bg-office-accent/20 flex items-center justify-center">
        <Sparkles className="w-3.5 h-3.5 text-office-accent-ink" />
      </div>
      <span className="text-xs font-semibold tracking-wide">
        {t('office.askOffice')}
      </span>
    </button>
  );
};
