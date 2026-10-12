/**
 * Recruitment Wizard - Step 3: SOUL.md Preview (Rule REQ-083)
 */

import React, { useState } from 'react';
import type { AgentHiringSpec } from '@hermes-office/shared';
import { generateSoulMarkdown } from '@hermes-office/shared';
import { Copy, Check, ArrowLeft, ArrowRight, FileCode } from 'lucide-react';
import { tma } from '../../services/tma';
import { MarkdownView } from '../common/MarkdownView';

interface Step3SoulPreviewProps {
  spec: AgentHiringSpec;
  onConfirm: (soulMd: string) => void;
  onBack: () => void;
}

export const Step3SoulPreview: React.FC<Step3SoulPreviewProps> = ({
  spec,
  onConfirm,
  onBack,
}) => {
  const soulMd = React.useMemo(() => generateSoulMarkdown(spec), [spec]);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(soulMd);
      tma.hapticNotification('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      tma.hapticNotification('error');
    }
  };

  const handleNext = () => {
    tma.hapticImpact('medium');
    onConfirm(soulMd);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-office-violet" />
          <span className="text-xs font-bold text-office-text">Preview Berkas SOUL.md</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-office-hover hover:bg-office-hover text-xs font-mono text-office-accent-ink min-h-[36px]"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-office-success" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Tersalin!' : 'Salin SOUL.md'}</span>
        </button>
      </div>

      <div className="text-[11px] text-office-muted leading-relaxed">
        SOUL.md dibuat secara deterministik dengan 9 bagian standar Hermes Agent. Pastikan seluruh misi, batasan, dan kebijakan persetujuan sesuai sebelum lanjut.
      </div>

      {/* Rendered Preview Box */}
      <div className="p-3.5 rounded-xl bg-office-inset border border-office-border max-h-[55vh] overflow-y-auto text-xs font-mono">
        <MarkdownView content={soulMd} />
      </div>

      <div className="flex gap-2 pt-2 border-t border-office-border">
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
          onClick={handleNext}
          className="flex-1 py-2.5 rounded-xl bg-office-violet text-office-text text-xs font-bold hover:bg-violet-600 min-h-[44px] shadow-nu-raised flex items-center justify-center gap-1.5"
        >
          <span>Paket Penerimaan</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
