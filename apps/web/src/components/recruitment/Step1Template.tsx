/**
 * Recruitment Wizard - Step 1: Role Template Choice (Rule REQ-081)
 */

import React from 'react';
import {
  RECRUITMENT_TEMPLATES,
  type RoleTemplate,
  type AgentHiringSpec,
} from '@hermes-office/shared';
import { Sparkles, ArrowRight, UserPlus } from 'lucide-react';
import { tma } from '../../services/tma';

interface Step1TemplateProps {
  onSelect: (spec: AgentHiringSpec) => void;
  onCancel: () => void;
}

export const Step1Template: React.FC<Step1TemplateProps> = ({ onSelect, onCancel }) => {
  const handleSelectTemplate = (tpl: RoleTemplate) => {
    tma.hapticSelection();
    onSelect({
      name: tpl.name,
      role: tpl.role,
      department: tpl.department,
      avatar: tpl.avatar,
      mission: tpl.mission,
      tone: tpl.tone,
      responsibilities: [...tpl.responsibilities],
      allowed_tools: [...tpl.allowed_tools],
      boundaries: [...tpl.boundaries],
      approval_actions: [...tpl.approval_actions],
      reporting_cadence: tpl.reporting_cadence,
    });
  };

  const handleSelectCustom = () => {
    tma.hapticImpact('medium');
    onSelect({
      name: 'Agen Baru',
      role: 'Spesialis Operasional',
      department: 'command',
      avatar: '🤖',
      mission: 'Membantu operasional perusahaan dengan efisiensi dan keandalan tinggi.',
      tone: 'Profesional, santun, dan fokus pada solusi.',
      responsibilities: [
        'Menganalisis kebutuhan operasional harian.',
        'Mengeksekusi tugas terdelegasi secara terukur.',
        'Mendokumentasikan hasil pekerjaan ke dalam sistem.',
        'Melaporkan kemajuan berkala kepada CEO.',
      ],
      allowed_tools: ['web_search', 'task_runner'],
      boundaries: [
        'Dilarang membocorkan kredensial atau token API perusahaan.',
        'Dilarang mengarang angka atau memalsukan laporan.',
      ],
      approval_actions: [
        'Transaksi keuangan / pengeluaran uang',
        'Publikasi konten resmi ke ranah publik',
      ],
      reporting_cadence: 'Harian atau saat tugas selesai',
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-office-muted leading-relaxed">
        Pilih template peran pra-definisi dengan 4 tanggung jawab standar, atau buat profil kustom:
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
        {RECRUITMENT_TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            onClick={() => handleSelectTemplate(tpl)}
            className="p-3 rounded-xl bg-office-elevated border border-office-border hover:border-office-accent/50 hover:bg-office-accent/5 cursor-pointer transition-all flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{tpl.avatar}</span>
                <span className="text-xs font-bold text-office-text">{tpl.role}</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-office-hover text-office-accent-ink">
                {tpl.department}
              </span>
            </div>
            <p className="text-[11px] text-office-muted line-clamp-2 leading-relaxed">
              {tpl.mission}
            </p>
            <div className="pt-1 flex items-center justify-between text-[10px] text-office-muted">
              <span>4 tanggung jawab standar</span>
              <ArrowRight className="w-3 h-3 text-office-accent-ink" />
            </div>
          </div>
        ))}

        {/* Custom Agent Option */}
        <div
          onClick={handleSelectCustom}
          className="p-3 rounded-xl bg-office-violet/10 border border-office-violet/30 hover:border-office-violet hover:bg-office-violet/20 cursor-pointer transition-all flex flex-col justify-between gap-1.5"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-office-violet" />
            <span className="text-xs font-bold text-office-text">Agen Kustom (Buat Baru)</span>
          </div>
          <p className="text-[11px] text-office-muted">
            Tentukan peran, misi, alat bantu, dan batasan operasional unik dari awal.
          </p>
          <div className="pt-1 flex items-center justify-between text-[10px] text-office-violet font-bold">
            <span>Kustomisasi penuh</span>
            <Sparkles className="w-3 h-3" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-office-border">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-muted hover:text-office-text min-h-[44px]"
        >
          Batal
        </button>
      </div>
    </div>
  );
};
