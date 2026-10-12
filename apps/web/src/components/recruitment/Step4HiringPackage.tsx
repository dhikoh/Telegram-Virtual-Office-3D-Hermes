/**
 * Recruitment Wizard - Step 4: Hiring Package & Registration (Rule REQ-084 & REQ-092)
 */

import React, { useState } from 'react';
import type { AgentHiringSpec } from '@hermes-office/shared';
import {
  generateSoulMarkdown,
  generateHiringCommands,
  generateHiringChecklist,
} from '@hermes-office/shared';
import {
  Copy,
  Check,
  ArrowLeft,
  CheckCircle2,
  Terminal,
  ShieldCheck,
  Sparkles,
  Server,
  Save,
} from 'lucide-react';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { MarkdownView } from '../common/MarkdownView';
import { useOfficeStore } from '../../stores/office';

interface Step4HiringPackageProps {
  spec: AgentHiringSpec;
  onFinish: () => void;
  onBack: () => void;
}

export const Step4HiringPackage: React.FC<Step4HiringPackageProps> = ({
  spec,
  onFinish,
  onBack,
}) => {
  const { fetchInitialData, addTickerMessage } = useOfficeStore();
  const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-agent';
  const pkg = React.useMemo(() => {
    const soulMd = generateSoulMarkdown(spec);
    const hash = slug.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const suggestedPort = 8650 + (hash % 40);
    return {
      slug,
      soul_md: soulMd,
      commands_md: generateHiringCommands(spec, slug, suggestedPort, soulMd),
      checklist: generateHiringChecklist(slug, suggestedPort),
    };
  }, [spec, slug]);

  // Checklist state
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [copiedCommands, setCopiedCommands] = useState(false);

  // Registration Form State
  const [baseUrl, setBaseUrl] = useState('');
  const [hermesProfile, setHermesProfile] = useState(slug);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [hiredSuccess, setHiredSuccess] = useState(false);
  const [draftSuccess, setDraftSuccess] = useState(false);

  const toggleCheck = (index: number) => {
    tma.hapticSelection();
    setCheckedItems({ ...checkedItems, [index]: !checkedItems[index] });
  };

  const handleCopyCommands = async () => {
    try {
      await navigator.clipboard.writeText(pkg.commands_md);
      tma.hapticNotification('success');
      setCopiedCommands(true);
      setTimeout(() => setCopiedCommands(false), 2000);
    } catch {
      tma.hapticNotification('error');
    }
  };

  // Save as Draft (Rule REQ-061 & REQ-084)
  const handleSaveDraft = async () => {
    tma.hapticImpact('medium');
    setIsDrafting(true);
    try {
      await api.createHiringDraft({
        form: spec,
        soul_md: pkg.soul_md,
        commands_md: pkg.commands_md,
      });
      tma.hapticNotification('success');
      setDraftSuccess(true);
      setTimeout(() => setDraftSuccess(false), 3000);
    } catch {
      tma.hapticNotification('error');
    } finally {
      setIsDrafting(false);
    }
  };

  // Mark Hired & Register to Virtual Office (Rule REQ-084 & Section 8)
  const handleMarkHired = async () => {
    tma.hapticImpact('heavy');
    setIsSubmitting(true);
    try {
      const draftRes = await api.createHiringDraft({
        form: spec,
        soul_md: pkg.soul_md,
        commands_md: pkg.commands_md,
      });

      const newAgentId = `agent_${pkg.slug}_${Date.now().toString(36)}`;

      await api.markHired(draftRes.id, {
        id: newAgentId,
        name: spec.name,
        role: spec.role,
        department: spec.department,
        avatar: spec.avatar || '🤖',
        soul_summary: spec.mission,
        ...(baseUrl.trim() ? { hermes_base_url: baseUrl.trim() } : {}),
        hermes_profile: hermesProfile.trim() || pkg.slug,
        active: 1,
        hired_at: Date.now(),
      });

      tma.hapticNotification('success');
      setHiredSuccess(true);
      addTickerMessage(`Agen baru "${spec.name}" (${spec.role}) resmi bergabung ke kantor!`, 'success');
      await fetchInitialData();

      setTimeout(() => {
        onFinish();
      }, 1600);
    } catch {
      tma.hapticNotification('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hiredSuccess) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4 text-center animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-full bg-office-success/20 border border-office-success flex items-center justify-center text-3xl shadow-nu-raised">
          {spec.avatar || '🎉'}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-office-text">Selamat Datang di Tim!</h3>
          <p className="text-xs text-office-muted">
            Agen <strong className="text-office-text">{spec.name}</strong> ({spec.role}) telah resmi didaftarkan ke Virtual Office departemen <span className="text-office-accent-ink font-bold">{spec.department.toUpperCase()}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-office-success">
          <CheckCircle2 className="w-4 h-4" />
          <span>Profil & Kredensial Tersimpan Aman</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-h-[72vh] overflow-y-auto pr-1">
      {/* Information Banner */}
      <div className="rounded-xl p-3 bg-office-violet/10 border border-office-violet/30 flex items-start gap-2.5 text-xs text-office-violet">
        <ShieldCheck className="w-4 h-4 shrink-0 text-office-violet mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold block text-office-text">Paket Penerimaan VPS (Rule REQ-084)</span>
          Perintah CLI diverifikasi dari dokumentasi resmi Hermes. Mini App tidak pernah mengeksekusi shell langsung di VPS (Rule S6).
        </div>
      </div>

      {/* VPS Checklist */}
      <div>
        <label className="text-[11px] text-office-muted font-bold block mb-1.5">Checklist Pengaturan VPS:</label>
        <div className="flex flex-col gap-1.5">
          {pkg.checklist.map((item, idx) => (
            <div
              key={idx}
              onClick={() => toggleCheck(idx)}
              className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center gap-2 transition-all ${
                checkedItems[idx]
                  ? 'bg-office-success/10 border-office-success/30 text-office-success'
                  : 'bg-office-inset border-office-border text-office-muted hover:text-office-text'
              }`}
            >
              <div
                className={`w-4 h-4 rounded flex items-center justify-center border ${
                  checkedItems[idx] ? 'bg-office-success border-office-success text-office-muted font-bold' : 'border-office-border'
                }`}
              >
                {checkedItems[idx] && <Check className="w-3 h-3" />}
              </div>
              <span className="flex-1">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Verified VPS CLI Commands Block */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-office-accent-ink" />
            <label className="text-[11px] font-bold text-office-text">Instruksi Terminal VPS</label>
          </div>
          <button
            type="button"
            onClick={handleCopyCommands}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-office-hover hover:bg-office-hover text-[10px] font-mono text-office-accent-ink"
          >
            {copiedCommands ? <Check className="w-3 h-3 text-office-success" /> : <Copy className="w-3 h-3" />}
            <span>{copiedCommands ? 'Tersalin' : 'Salin Perintah'}</span>
          </button>
        </div>
        <div className="p-3 rounded-xl bg-office-inset border border-office-border text-[11px] font-mono max-h-48 overflow-y-auto">
          <MarkdownView content={pkg.commands_md} />
        </div>
      </div>

      {/* Registration Form */}
      <div className="p-3 rounded-xl bg-office-inset border border-office-border flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-office-accent-ink" />
          <span className="text-xs font-bold text-office-text">Formulir Registrasi Kantor Virtual</span>
        </div>

        <div>
          <label className="text-[10px] text-office-muted block mb-1">Ganti Hermes Base URL (Opsional)</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Kosongkan untuk default server"
            className="w-full px-3 py-1.5 rounded-lg bg-office-inset border border-office-border text-xs text-office-text font-mono focus:outline-none focus:border-office-accent"
          />
        </div>

        <div>
          <label className="text-[10px] text-office-muted block mb-1">Hermes Profile Slug</label>
          <input
            type="text"
            value={hermesProfile}
            onChange={(e) => setHermesProfile(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-office-inset border border-office-border text-xs text-office-text font-mono focus:outline-none focus:border-office-accent"
          />
        </div>
      </div>

      {draftSuccess && (
        <div className="p-2 rounded-lg bg-office-success/10 border border-office-success/30 text-xs text-office-success text-center">
          Draft penerimaan berhasil disimpan di server!
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-2 border-t border-office-border">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-muted hover:text-office-text min-h-[44px] flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali</span>
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isDrafting}
            className="flex-1 py-2.5 rounded-xl bg-office-inset border border-office-border text-xs font-bold text-office-text hover:bg-office-inset min-h-[44px] flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5 text-office-accent-ink" />
            <span>{isDrafting ? 'Menyimpan...' : 'Simpan Draft'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleMarkHired}
          disabled={isSubmitting}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-office-accent to-office-violet text-office-muted font-bold text-xs hover:opacity-90 min-h-[48px] shadow-nu-raised flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isSubmitting ? 'Mendaftarkan Agen...' : 'Daftarkan & Rekrut Agen'}</span>
        </button>
      </div>
    </div>
  );
};
