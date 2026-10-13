import React, { useState } from 'react';
import { Sparkles, ShieldCheck, Clock, AlertCircle, X } from 'lucide-react';
import type { Department, ReportTemplate, Report, AgentPublic } from '@hermes-office/shared';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { MarkdownView } from '../common/MarkdownView';

const REPORT_TEMPLATES: { id: ReportTemplate; label: string; desc: string }[] = [
  { id: 'daily_sales', label: 'Penjualan Harian', desc: 'Analisis transaksi dan konversi' },
  { id: 'weekly_social', label: 'Sosial Mingguan', desc: 'Metrik audiens dan engagement' },
  { id: 'monthly_finance', label: 'Finansial Bulanan', desc: 'Ringkasan MRR, pengeluaran, burn rate' },
  { id: 'campaign_roi', label: 'ROI Kampanye', desc: 'Efektivitas akuisisi pelanggan' },
];

interface GenerateReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDept: Department;
  departmentAgents: AgentPublic[];
  onReportCreated: (report: Report) => void;
}

export const GenerateReportModal: React.FC<GenerateReportModalProps> = ({
  isOpen,
  onClose,
  activeDept,
  departmentAgents,
  onReportCreated,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate>('monthly_finance');
  const [reportPeriod, setReportPeriod] = useState('2026-Q3');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);

  if (!isOpen) return null;

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    tma.hapticImpact('heavy');

    const agent = departmentAgents[0];
    if (!agent) {
      // Tahap 7: no fictional `demo-<dept>` agents any more — a report must
      // come from a really hired agent of this department.
      setGenerationError('Belum ada agen di divisi ini. Rekrut agen dulu sebelum membuat laporan.');
      setIsGenerating(false);
      tma.hapticNotification('error');
      return;
    }
    const agentId = agent.id;

    try {
      const res = await api.generateReport({
        agent_id: agentId,
        template: selectedTemplate,
        period: reportPeriod,
      });

      setGeneratedReport(res);
      onReportCreated(res);
      tma.hapticNotification('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghasilkan laporan';
      setGenerationError(msg);
      tma.hapticNotification('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setGeneratedReport(null);
    setGenerationError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] isolate flex items-center justify-center bg-office-inset backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-office-elevated border border-office-violet/40 rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-office-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-office-violet" />
            <h3 className="text-sm font-bold text-office-text">Buat Laporan Agen ({activeDept})</h3>
          </div>
          <button
            onClick={handleClose}
            type="button"
            className="text-office-muted hover:text-office-text p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!generatedReport ? (
          <div className="flex flex-col gap-3">
            {/* Anti-Hallucination Information Banner */}
            <div className="rounded-xl p-3 bg-office-accent/10 border border-office-accent/30 flex items-start gap-2.5 text-xs text-office-accent-ink">
              <ShieldCheck className="w-5 h-5 shrink-0 text-office-accent-ink" />
              <div className="leading-relaxed">
                <span className="font-bold block">Jaminan Anti-Halusinasi (Rule REQ-079)</span>
                Agen diinstruksikan menganalisis <strong className="underline">hanya</strong> angka KPI yang tercatat di basis data terverifikasi.
              </div>
            </div>

            {/* Template Selection */}
            <div>
              <label className="text-[11px] text-office-muted block mb-1">Pilih Template Laporan</label>
              <div className="flex flex-col gap-1.5">
                {REPORT_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all min-h-[44px] flex flex-col justify-center ${
                      selectedTemplate === tpl.id
                        ? 'bg-office-violet/20 border-office-violet text-office-text shadow-nu-raised'
                        : 'bg-office-inset border-office-border text-office-muted hover:text-office-text'
                    }`}
                  >
                    <span className="font-bold block">{tpl.label}</span>
                    <span className="text-[10px] text-office-muted">{tpl.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Period Input */}
            <div>
              <label className="text-[11px] text-office-muted block mb-1">Periode Laporan</label>
              <input
                type="text"
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value)}
                placeholder="2026-Q3"
                className="w-full px-3 py-2 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-text/70 focus:outline-none focus:border-office-violet font-mono min-h-[44px]"
              />
            </div>

            {/* Agent Responsible */}
            <div>
              <label className="text-[11px] text-office-muted block mb-1">Agen Penanggung Jawab</label>
              <div className="p-2.5 rounded-xl bg-office-inset border border-office-border flex items-center gap-2 text-xs text-office-text min-h-[44px]">
                {departmentAgents.length > 0 ? (
                  <>
                    <span>{departmentAgents[0].avatar || '🤖'}</span>
                    <span className="font-bold">{departmentAgents[0].name}</span>
                    <span className="text-[10px] text-office-muted">({departmentAgents[0].role})</span>
                  </>
                ) : (
                  <span className="text-office-warn">
                    Belum ada agen divisi {activeDept} — rekrut dulu dari tab Kantor.
                  </span>
                )}
              </div>
            </div>

            {generationError && (
              <div className="p-3 rounded-xl bg-office-danger/20 border border-office-danger/40 text-xs text-office-danger flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{generationError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-muted hover:text-office-text min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={isGenerating || departmentAgents.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-office-accent text-office-on-accent text-xs font-bold hover:opacity-90 min-h-[44px] shadow-nu-raised disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isGenerating ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Hasilkan Laporan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Generated Report View */
          <div className="flex flex-col gap-3">
            <div className="p-3 rounded-xl bg-office-success/15 border border-office-success/40 flex items-center gap-2 text-xs text-office-success">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="font-bold">Laporan Lolos Verifikasi Anti-Halusinasi</span>
            </div>

            <div className="max-h-[55vh] overflow-y-auto pr-1">
              <MarkdownView content={generatedReport.body_md} />
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-2.5 rounded-xl bg-office-elevated border border-office-border text-xs font-bold text-office-text hover:bg-office-inset min-h-[44px]"
            >
              Tutup Laporan
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
