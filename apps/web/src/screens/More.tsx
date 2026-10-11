/**
 * More / Settings Screen (Phase 3 Web Shell)
 * Language selection (id/en), Low-power mode toggle, Fullscreen, Haptics test.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Globe, Zap, Maximize, UserPlus } from 'lucide-react';
import { usePowerStore } from '../stores/power';
import { tma } from '../services/tma';
import { changeLanguage } from '../i18n';

interface MoreScreenProps {
  onOpenRecruitment?: () => void;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({ onOpenRecruitment }) => {
  const { t, i18n } = useTranslation();
  const { isLowPower, toggleLowPower } = usePowerStore();

  const handleLanguageChange = (lang: 'id' | 'en') => {
    tma.hapticSelection();
    changeLanguage(lang);
  };

  const handleTogglePower = () => {
    tma.hapticImpact('medium');
    toggleLowPower();
  };

  const handleFullscreen = () => {
    tma.hapticImpact('light');
    tma.requestFullscreen();
  };

  const testHaptic = (type: 'light' | 'medium' | 'heavy') => {
    tma.hapticImpact(type);
  };

  return (
    <div className="flex flex-col min-h-screen p-4 pb-24 max-w-md mx-auto w-full select-none">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-office-cyan" />
        <h1 className="text-lg font-bold text-office-text">{t('nav.more')}</h1>
      </div>

      <div className="flex flex-col gap-3">
        {/* Language Selection Card (Rule REQ-099) */}
        <div className="glass-panel rounded-xl p-3.5 border border-white/10 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-office-text">
            <Globe className="w-4 h-4 text-office-cyan" />
            <span>{t('lang.switch')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleLanguageChange('id')}
              type="button"
              className={`py-2 px-3 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                i18n.language === 'id'
                  ? 'bg-office-cyan text-office-bg font-bold shadow-glow-cyan'
                  : 'bg-white/5 text-office-muted hover:text-white'
              }`}
            >
              {t('lang.id')}
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              type="button"
              className={`py-2 px-3 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                i18n.language === 'en'
                  ? 'bg-office-cyan text-office-bg font-bold shadow-glow-cyan'
                  : 'bg-white/5 text-office-muted hover:text-white'
              }`}
            >
              {t('lang.en')}
            </button>
          </div>
        </div>

        {/* Low-Power Mode Card (Rule REQ-067) */}
        <div className="glass-panel rounded-xl p-3.5 border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${isLowPower ? 'bg-office-warn/20 text-office-warn' : 'bg-white/5 text-office-muted'}`}>
              <Zap className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-office-text">{t('power.label')}</span>
              <span className="text-[10px] text-office-muted">
                {isLowPower ? 'Animasi dinonaktifkan' : 'Performa & animasi penuh'}
              </span>
            </div>
          </div>
          <button
            onClick={handleTogglePower}
            type="button"
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 min-h-[44px] flex items-center ${
              isLowPower ? 'bg-office-warn' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                isLowPower ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Telegram WebApp Controls */}
        <div className="glass-panel rounded-xl p-3.5 border border-white/10 flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-office-text">Integrasi Telegram</span>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleFullscreen}
              type="button"
              className="w-full py-2.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-between text-xs text-office-text min-h-[44px]"
            >
              <div className="flex items-center gap-2">
                <Maximize className="w-4 h-4 text-office-cyan" />
                <span>Layar Penuh (Telegram v8.0+)</span>
              </div>
              <span className="text-[10px] font-mono text-office-muted">Aktifkan</span>
            </button>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-office-muted">Uji Haptic Feedback:</span>
              <div className="flex gap-1.5">
                {(['light', 'medium', 'heavy'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => testHaptic(style)}
                    type="button"
                    className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-office-cyan border border-white/10 min-h-[32px]"
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recruitment Room Shortcut */}
        <button
          onClick={onOpenRecruitment}
          type="button"
          className="glass-panel rounded-xl p-3.5 border border-office-violet/30 bg-office-violet/5 hover:bg-office-violet/10 flex items-center justify-between text-xs text-office-text transition-all min-h-[48px]"
        >
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-4 h-4 text-office-violet" />
            <div className="flex flex-col text-left">
              <span className="font-semibold text-white">Ruang Rekrutmen Agen</span>
              <span className="text-[10px] text-office-muted">Buat profil SOUL.md agen baru (Phase 6)</span>
            </div>
          </div>
          <span className="text-office-violet font-bold">&gt;</span>
        </button>

        {/* App Version Info */}
        <div className="text-center py-4 text-[10px] font-mono text-office-muted/60">
          Hermes Virtual Office v0.1.0 • Phase 3 Web Shell
        </div>
      </div>
    </div>
  );
};
