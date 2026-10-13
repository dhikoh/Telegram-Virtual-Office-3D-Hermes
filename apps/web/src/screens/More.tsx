/**
 * Screen 6: More & Management (Rule REQ-080)
 * - Agents Registry
 * - Recruitment Room (4-step wizard)
 * - Security Audit Log (Rule S9)
 * - Settings (Language, Low-power, Fullscreen, Haptics)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Globe,
  Zap,
  Maximize,
  UserPlus,
  Users,
  Shield,
  Sparkles,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { usePowerStore } from '../stores/power';
import { GRAPHICS_PRESETS, type GraphicsPreset } from '@hermes-office/shared';
import { useOfficeStore } from '../stores/office';
import { tma } from '../services/tma';
import { changeLanguage } from '../i18n';
import { RecruitmentWizard } from '../components/recruitment/RecruitmentWizard';
import { AgentsRegistryModal } from '../components/more/AgentsRegistryModal';
import { AuditLogModal } from '../components/more/AuditLogModal';
import { SkillsModal } from '../components/more/SkillsModal';
import { RoomsManagerModal } from '../components/more/RoomsManagerModal';
import { AccountCard } from '../components/more/AccountCard';
import { TelegramNotificationsCard } from '../components/more/TelegramNotificationsCard';
import { ViewModeCard } from '../components/more/ViewModeCard';

interface MoreScreenProps {
  onOpenRecruitment?: () => void;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({ onOpenRecruitment }) => {
  const { t, i18n } = useTranslation();
  const { isLowPower, preset, lastFps, setPreset } = usePowerStore();
  const { agents, departments, setSelectedAgentId } = useOfficeStore();

  const [isRecruitmentOpen, setIsRecruitmentOpen] = useState(false);
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);

  const handleLanguageChange = (lang: 'id' | 'en') => {
    tma.hapticSelection();
    changeLanguage(lang);
  };

  const handlePreset = (next: GraphicsPreset) => {
    tma.hapticImpact('medium');
    setPreset(next);
  };

  const handleFullscreen = () => {
    tma.hapticImpact('light');
    tma.requestFullscreen();
  };

  const testHaptic = (type: 'light' | 'medium' | 'heavy') => {
    tma.hapticImpact(type);
  };

  const openRecruitment = () => {
    tma.hapticImpact('medium');
    if (onOpenRecruitment) {
      onOpenRecruitment();
    } else {
      setIsRecruitmentOpen(true);
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-4 pb-24 max-w-md mx-auto w-full select-none">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-office-accent-ink" />
        <h1 className="text-lg font-bold text-office-text">{t('nav.more')}</h1>
      </div>

      <div className="flex flex-col gap-3">
        {/* Section 1: Management Shortcuts (Recruitment Room & Registry) */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold text-office-muted uppercase tracking-wider px-1">
            Manajemen Tim & Agen
          </span>

          {/* Recruitment Room Shortcut (Rule REQ-081 through REQ-084) */}
          <button
            onClick={openRecruitment}
            type="button"
            className="glass-panel rounded-xl p-3.5 border border-office-violet/40 bg-office-violet/10 hover:bg-office-violet/20 flex items-center justify-between text-xs text-office-text transition-all min-h-[52px] shadow-nu-raised"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-office-violet/20 text-office-violet">
                <UserPlus className="w-5 h-5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-office-text text-sm">Ruang Rekrutmen Agen (HR)</span>
                <span className="text-[11px] text-office-muted">
                  Buat profil SOUL.md & instruksi VPS baru
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-office-violet" />
          </button>

          {/* Agents Registry Shortcut (Rule REQ-080) */}
          <button
            onClick={() => {
              tma.hapticImpact('light');
              setIsRegistryOpen(true);
            }}
            type="button"
            className="glass-panel rounded-xl p-3.5 border border-office-border hover:bg-office-hover flex items-center justify-between text-xs text-office-text transition-all min-h-[48px]"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-office-accent/15 text-office-accent-ink">
                <Users className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-office-text">Registri Agen Kantor</span>
                <span className="text-[10px] text-office-muted">
                  {agents.length} agen aktif • Cek status & koneksi gateway
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-office-muted" />
          </button>

          {/* Tahap 8 — Gateway Skills & Capabilities */}
          <button
            onClick={() => {
              tma.hapticImpact('light');
              setIsSkillsOpen(true);
            }}
            type="button"
            className="glass-panel rounded-xl p-3.5 border border-office-border hover:bg-office-hover flex items-center justify-between text-xs text-office-text transition-all min-h-[48px]"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-office-inset text-office-muted">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-office-text">Kemampuan Gateway</span>
                <span className="text-[10px] text-office-muted">
                  Skill terpasang & fitur runtime yang dilaporkan Hermes
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-office-muted" />
          </button>

          {/* Tahap 10 — ruang jadi data: rename, warna, urutan, sembunyikan */}
          <button
            onClick={() => {
              tma.hapticImpact('light');
              setIsRoomsOpen(true);
            }}
            type="button"
            className="glass-panel rounded-xl p-3.5 border border-office-border hover:bg-office-hover flex items-center justify-between text-xs text-office-text transition-all min-h-[48px]"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-office-inset text-office-muted">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-office-text">Kelola Ruang Kantor</span>
                <span className="text-[10px] text-office-muted">
                  {departments.length} ruang • Nama, warna, urutan, sembunyikan
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-office-muted" />
          </button>

          {/* Security Audit Log Shortcut (Rule S9) */}
          <button
            onClick={() => {
              tma.hapticImpact('light');
              setIsAuditOpen(true);
            }}
            type="button"
            className="glass-panel rounded-xl p-3.5 border border-office-border hover:bg-office-hover flex items-center justify-between text-xs text-office-text transition-all min-h-[48px]"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-office-inset text-office-muted">
                <Shield className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-office-text">Log Audit Keamanan</span>
                <span className="text-[10px] text-office-muted">
                  Riwayat aksi mutasi sistem & otentikasi
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-office-muted" />
          </button>
        </div>

        {/* Section 2: Settings */}
        <div className="flex flex-col gap-2 pt-2">
          <span className="text-[11px] font-bold text-office-muted uppercase tracking-wider px-1">
            Pengaturan & Aksesibilitas
          </span>

          {/* Language Selection Card (Rule REQ-099) */}
          <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-office-text">
              <Globe className="w-4 h-4 text-office-accent-ink" />
              <span>{t('lang.switch')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleLanguageChange('id')}
                type="button"
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                  i18n.language === 'id'
                    ? 'bg-office-accent text-office-on-accent font-bold shadow-nu-raised'
                    : 'bg-office-hover text-office-muted hover:text-office-text'
                }`}
              >
                {t('lang.id')}
              </button>
              <button
                onClick={() => handleLanguageChange('en')}
                type="button"
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                  i18n.language === 'en'
                    ? 'bg-office-accent text-office-on-accent font-bold shadow-nu-raised'
                    : 'bg-office-hover text-office-muted hover:text-office-text'
                }`}
              >
                {t('lang.en')}
              </button>
            </div>
          </div>

          {/* Graphics preset card: penuh / rendah / otomatis (Tahap 6, Rule REQ-067).
              The old binary ECO switch became three presets, and "otomatis" shows
              the frame rate the probe is actually measuring. */}
          <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    isLowPower ? 'bg-office-warn/20 text-office-warn' : 'bg-office-hover text-office-muted'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-office-text">{t('power.label')}</span>
                  <span className="text-[10px] text-office-muted">
                    {isLowPower ? 'Animasi dinonaktifkan (hemat daya)' : 'Performa & animasi penuh'}
                    {preset === 'otomatis' && lastFps !== null ? ` \u2022 ${lastFps} fps` : ''}
                  </span>
                </div>
              </div>
              {preset === 'otomatis' && (
                <span className="text-[9px] font-mono font-bold text-office-accent-ink bg-office-accent/20 px-1.5 py-0.5 rounded">
                  AUTO
                </span>
              )}
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Preset grafis">
              {GRAPHICS_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={preset === p}
                  onClick={() => handlePreset(p)}
                  className={`flex-1 min-h-[44px] rounded-lg border text-xs font-semibold transition-colors active:scale-95 ${
                    preset === p
                      ? 'bg-office-accent text-office-on-accent border-office-accent shadow-nu-raised'
                      : 'bg-office-inset text-office-text/75 border-office-border hover:border-office-accent/70'
                  }`}
                >
                  {p === 'penuh' ? 'Penuh' : p === 'rendah' ? 'Rendah' : 'Otomatis'}
                </button>
              ))}
            </div>
          </div>

          {/* View Mode 2D / 3D Selection Card (Rule 9.3 & REQ-108) */}
          <ViewModeCard />

          {/* Telegram Notifications Settings Card (Rule REQ-085 & REQ-093) */}
          <TelegramNotificationsCard />

          {/* Telegram WebApp Controls */}
          <div className="glass-panel rounded-xl p-3.5 border border-office-border flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-office-text">Integrasi Telegram</span>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleFullscreen}
                type="button"
                aria-label="Layar Penuh Telegram"
                className="w-full py-2.5 px-3 rounded-lg bg-office-hover hover:bg-office-hover flex items-center justify-between text-xs text-office-text min-h-[44px]"
              >
                <div className="flex items-center gap-2">
                  <Maximize className="w-4 h-4 text-office-accent-ink" />
                  <span>Layar Penuh (Telegram v8.0+)</span>
                </div>
                <span className="text-[10px] font-mono text-office-muted">Aktifkan</span>
              </button>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-office-muted">Uji Haptic Feedback:</span>
                <div className="flex gap-2">
                  {(['light', 'medium', 'heavy'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => testHaptic(style)}
                      type="button"
                      aria-label={`Uji getar ${style}`}
                      className="px-3 py-2 rounded bg-office-hover hover:bg-office-hover text-[10px] font-mono text-office-accent-ink border border-office-border min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95 transition-transform"
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tahap 8 — Akun: identitas sesi Telegram yang diautentikasi server */}
        <AccountCard />

        {/* App Version Info */}
        <div className="text-center py-4 text-[10px] font-mono text-office-muted">
          Hermes Virtual Office v1.0.0 • Phase 7 (Notifications & Polish)
        </div>
      </div>

      {/* Modals */}
      <RecruitmentWizard
        isOpen={isRecruitmentOpen}
        onClose={() => setIsRecruitmentOpen(false)}
      />

      <AgentsRegistryModal
        isOpen={isRegistryOpen}
        onClose={() => setIsRegistryOpen(false)}
        onSelectAgent={(id) => setSelectedAgentId(id)}
      />

      <AuditLogModal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
      />

      <SkillsModal
        isOpen={isSkillsOpen}
        onClose={() => setIsSkillsOpen(false)}
      />

      {/* Tahap 10 — Kelola Ruang Kantor */}
      <RoomsManagerModal
        isOpen={isRoomsOpen}
        onClose={() => setIsRoomsOpen(false)}
      />
    </div>
  );
};
