import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { useOfficeStore } from '../../stores/office';
import { tma } from '../../services/tma';

interface MessengerFABProps {
  onClick: () => void;
}

export const MessengerFAB: React.FC<MessengerFABProps> = ({ onClick }) => {
  const { t } = useTranslation();
  const { agents } = useOfficeStore();

  const handleClick = () => {
    tma.hapticImpact('medium');
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      aria-label={t('messenger.title')}
      className="fixed bottom-36 right-4 z-30 flex items-center gap-2 px-3 py-2.5 rounded-full bg-office-elevated text-cyan-300 border border-cyan-500/40 backdrop-blur-md shadow-nu-raised hover:border-cyan-400 active:scale-95 transition-all min-h-[44px]"
    >
      <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center relative">
        <MessageCircle className="w-3.5 h-3.5 text-cyan-300" />
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
      </div>
      <span className="text-xs font-semibold tracking-wide text-office-text">
        {t('messenger.title')}
      </span>
      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
        {agents.length}
      </span>
    </button>
  );
};
