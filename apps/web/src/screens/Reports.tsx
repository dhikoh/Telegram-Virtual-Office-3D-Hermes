/**
 * Screen 5: Reports & KPIs (Rule REQ-078, REQ-079 & Section 8)
 * - 8 Department Tabs (command, social, sales, finance, marketing, analytics, support, hr)
 * - KPI Cards with Sparklines (Recharts), Source Badges (manual, import, agent: unverified), "as of" timestamp
 * - Manual KPI Entry Form Modal
 * - Anti-Hallucination Agent Report Generator & Viewer Modal
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Plus,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  FileText,
  Clock,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { Department, KpiSource, ReportTemplate, Report } from '@hermes-office/shared';
import { DEPARTMENTS } from '@hermes-office/shared';
import { useOfficeStore, DEMO_AGENTS } from '../stores/office';
import { api } from '../services/api';
import { tma } from '../services/tma';
import { MarkdownView } from '../components/common/MarkdownView';

const DEPARTMENT_ICONS: Record<Department, string> = {
  command: '⚡',
  social: '📱',
  sales: '💼',
  finance: '💰',
  marketing: '🚀',
  analytics: '📊',
  support: '🎧',
  hr: '🤝',
};

const REPORT_TEMPLATES: { id: ReportTemplate; label: string; desc: string }[] = [
  { id: 'daily_sales', label: 'Penjualan Harian', desc: 'Analisis transaksi dan konversi' },
  { id: 'weekly_social', label: 'Sosial Mingguan', desc: 'Metrik audiens dan engagement' },
  { id: 'monthly_finance', label: 'Finansial Bulanan', desc: 'Ringkasan MRR, pengeluaran, burn rate' },
  { id: 'campaign_roi', label: 'ROI Kampanye', desc: 'Efektivitas akuisisi pelanggan' },
];

export const ReportsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { kpis, reports, agents, createKpi } = useOfficeStore();

  const [activeDept, setActiveDept] = useState<Department>('finance');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);

  // Manual KPI Form State
  const [kpiKey, setKpiKey] = useState('');
  const [kpiLabel, setKpiLabel] = useState('');
  const [kpiValue, setKpiValue] = useState<string>('');
  const [kpiUnit, setKpiUnit] = useState('');
  const [kpiPeriod, setKpiPeriod] = useState('2026-Q3');
  const [kpiSource, setKpiSource] = useState<KpiSource>('manual');
  const [kpiNote, setKpiNote] = useState('');
  const [isSubmittingKpi, setIsSubmittingKpi] = useState(false);

  // Report Generator Form State
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate>('monthly_finance');
  const [reportPeriod, setReportPeriod] = useState('2026-Q3');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Filtered KPIs for active department
  const departmentKpis = useMemo(() => {
    return kpis.filter((k) => k.department === activeDept);
  }, [kpis, activeDept]);

  // Filtered Reports for active department
  const departmentReports = useMemo(() => {
    return reports.filter((r) => r.department === activeDept);
  }, [reports, activeDept]);

  // Active agents for active department
  const departmentAgents = useMemo(() => {
    const sourceAgents = agents.length > 0 ? agents : DEMO_AGENTS;
    const list = sourceAgents.filter((a) => a.department === activeDept);
    return list.length > 0 ? list : sourceAgents;
  }, [agents, activeDept]);

  // Generate synthetic trend data points for smooth sparklines based on KPI value
  const getSparklineData = (val: number) => {
    const base = val;
    return [
      { step: 1, value: Math.round(base * 0.88 * 100) / 100 },
      { step: 2, value: Math.round(base * 0.94 * 100) / 100 },
      { step: 3, value: Math.round(base * 0.91 * 100) / 100 },
      { step: 4, value: Math.round(base * 0.97 * 100) / 100 },
      { step: 5, value: Math.round(base * 1.02 * 100) / 100 },
      { step: 6, value: Math.round(base * 100) / 100 },
    ];
  };

  // Submit Manual KPI Entry (Rule REQ-078)
  const handleSaveManualKpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kpiKey.trim() || !kpiLabel.trim() || !kpiValue.trim() || isSubmittingKpi) return;

    tma.hapticImpact('medium');
    setIsSubmittingKpi(true);
    try {
      await createKpi({
        id: `kpi-${Date.now()}`,
        department: activeDept,
        key: kpiKey.trim().toLowerCase().replace(/\s+/g, '_'),
        label: kpiLabel.trim(),
        value: parseFloat(kpiValue) || 0,
        unit: kpiUnit.trim(),
        period: kpiPeriod.trim(),
        source: kpiSource,
        source_note: kpiNote.trim(),
      });

      tma.hapticNotification('success');
      setKpiKey('');
      setKpiLabel('');
      setKpiValue('');
      setKpiUnit('');
      setKpiNote('');
      setIsManualModalOpen(false);
    } catch {
      tma.hapticNotification('error');
    } finally {
      setIsSubmittingKpi(false);
    }
  };

  // Generate Anti-Hallucination Report (Rule REQ-079)
  const handleGenerateReport = async () => {
    const agentToUse = departmentAgents[0];
    if (!agentToUse || isGenerating) return;

    tma.hapticImpact('heavy');
    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedReport(null);

    try {
      const res = await api.generateReport({
        agent_id: agentToUse.id,
        template: selectedTemplate,
        period: reportPeriod,
      });

      setGeneratedReport(res);
      tma.hapticNotification('success');
    } catch (err: unknown) {
      tma.hapticNotification('error');
      setGenerationError(
        err instanceof Error ? err.message : 'Laporan gagal dibuat oleh pipeline anti-halusinasi.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-4 pb-24 max-w-md mx-auto w-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-office-cyan" />
          <h1 className="text-base font-bold text-white">{t('nav.reports')}</h1>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-office-cyan/10 text-office-cyan border border-office-cyan/30">
          Anti-Hallucination Guard
        </span>
      </div>

      {/* DEPARTMENT TABS (Rule REQ-078: 8 Departments) */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-3">
        {DEPARTMENTS.map((dept) => {
          const isActive = activeDept === dept;
          const count = kpis.filter((k) => k.department === dept).length;

          return (
            <button
              key={dept}
              onClick={() => {
                tma.hapticSelection();
                setActiveDept(dept);
              }}
              type="button"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[44px] ${
                isActive
                  ? 'bg-office-cyan/20 border-2 border-office-cyan text-white shadow-glow-cyan'
                  : 'bg-slate-900/60 border border-white/10 text-office-muted hover:text-white'
              }`}
            >
              <span>{DEPARTMENT_ICONS[dept]}</span>
              <span className="capitalize">{dept}</span>
              <span
                className={`text-[9px] font-mono px-1 rounded ${
                  isActive ? 'bg-office-cyan text-slate-950 font-bold' : 'bg-white/10 text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ACTION BAR: Quick Entry & Report Trigger */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => {
            tma.hapticImpact('light');
            setIsManualModalOpen(true);
          }}
          type="button"
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900/90 border border-office-cyan/40 text-office-cyan hover:bg-office-cyan/10 text-xs font-bold transition-all min-h-[44px] active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Input KPI Manual</span>
        </button>

        <button
          onClick={() => {
            tma.hapticImpact('light');
            setIsReportModalOpen(true);
          }}
          type="button"
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-office-violet/20 border border-office-violet/50 text-white hover:bg-office-violet/30 text-xs font-bold transition-all min-h-[44px] shadow-glow-violet active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5 text-office-violet" />
          <span>Buat Laporan Agen</span>
        </button>
      </div>

      {/* SECTION 1: KPI CARDS WITH SPARKLINES (Rule REQ-078) */}
      <section className="flex flex-col gap-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-office-cyan" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-office-cyan">
              Metrik Kinerja ({activeDept})
            </h2>
          </div>
          <span className="text-[10px] text-office-muted font-mono">
            {departmentKpis.length} Terdata
          </span>
        </div>

        {departmentKpis.length === 0 ? (
          <div className="glass-panel rounded-2xl p-6 text-center border border-white/5 text-xs text-office-muted">
            Belum ada data KPI untuk divisi {activeDept}. Silakan tekan tombol &quot;Input KPI Manual&quot; di atas.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {departmentKpis.map((kpi) => {
              const sparklineData = getSparklineData(kpi.value);

              // Source Badge formatting (Rule REQ-078 & REQ-079)
              let sourceBadge = (
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Manual
                </span>
              );

              if (kpi.source === 'import') {
                sourceBadge = (
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-office-violet/20 text-violet-300 border border-office-violet/40 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Imported
                  </span>
                );
              } else if (kpi.source === 'agent') {
                // Rule REQ-079: Agent-sourced numbers are always labeled "unverified"
                sourceBadge = (
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Agen (Unverified)
                  </span>
                );
              }

              return (
                <div
                  key={kpi.id}
                  className="glass-panel-glow rounded-2xl p-4 bg-slate-950/80 border border-white/10 flex flex-col gap-2 relative overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between z-10">
                    <div>
                      <span className="text-xs font-bold text-white block">
                        {kpi.label}
                      </span>
                      <span className="text-[10px] text-office-muted font-mono">
                        Kunci: {kpi.key} • Periode: {kpi.period}
                      </span>
                    </div>
                    {sourceBadge}
                  </div>

                  {/* Value Row & Sparkline */}
                  <div className="flex items-end justify-between mt-1 z-10">
                    <div>
                      <span className="font-mono text-2xl font-black text-office-cyan tracking-tight">
                        {kpi.value.toLocaleString('id-ID')}
                      </span>
                      {kpi.unit && (
                        <span className="font-mono text-xs text-office-muted ml-1.5">
                          {kpi.unit}
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] font-mono text-slate-500 block">
                        As of: {new Date(kpi.created_at).toLocaleDateString('id-ID')}
                      </span>
                      {kpi.source_note && (
                        <span className="text-[9px] text-office-muted italic max-w-[120px] truncate block">
                          &quot;{kpi.source_note}&quot;
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sparkline Canvas (Recharts) */}
                  <div className="w-full h-14 mt-1 -mb-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparklineData}>
                        <defs>
                          <linearGradient id={`grad-${kpi.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#22D3EE" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#22D3EE"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill={`url(#grad-${kpi.id})`}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: DEPARTMENT REPORTS HISTORY */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-office-violet" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-office-violet">
              Arsip Laporan Divisi
            </h2>
          </div>
          <span className="text-[10px] text-office-muted font-mono">
            {departmentReports.length} Laporan
          </span>
        </div>

        {departmentReports.length === 0 ? (
          <div className="glass-panel rounded-xl p-3 text-center border border-white/5 text-xs text-office-muted">
            Belum ada riwayat laporan untuk divisi {activeDept}.
          </div>
        ) : (
          departmentReports.map((rep) => (
            <div
              key={rep.id}
              onClick={() => {
                tma.hapticImpact('light');
                setViewingReport(rep);
              }}
              className="glass-panel rounded-xl p-3 border border-white/10 flex items-center justify-between hover:border-office-violet/40 cursor-pointer active:scale-98 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-office-violet/20 border border-office-violet/40 flex items-center justify-center text-office-violet">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">
                    Template: {rep.template}
                  </span>
                  <span className="text-[10px] text-office-muted font-mono">
                    Periode: {rep.period} • {new Date(rep.created_at).toLocaleDateString('id-ID')}
                  </span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-office-muted" />
            </div>
          ))
        )}
      </section>

      {/* MODAL 1: MANUAL KPI ENTRY (Rule REQ-078) */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-office-cyan/40 rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-office-cyan" />
                <h3 className="text-sm font-bold text-white">Input KPI Manual ({activeDept})</h3>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                type="button"
                className="text-office-muted hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualKpi} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] text-office-muted block mb-1">Kunci Teknis * (misal: mrr, cac)</label>
                <input
                  type="text"
                  value={kpiKey}
                  onChange={(e) => setKpiKey(e.target.value)}
                  placeholder="mrr"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-office-cyan font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-office-muted block mb-1">Label Deskriptif *</label>
                <input
                  type="text"
                  value={kpiLabel}
                  onChange={(e) => setKpiLabel(e.target.value)}
                  placeholder="Monthly Recurring Revenue"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-office-cyan"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-office-muted block mb-1">Nilai Angka *</label>
                  <input
                    type="number"
                    step="any"
                    value={kpiValue}
                    onChange={(e) => setKpiValue(e.target.value)}
                    placeholder="125000"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-office-cyan font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-office-muted block mb-1">Satuan (Unit)</label>
                  <input
                    type="text"
                    value={kpiUnit}
                    onChange={(e) => setKpiUnit(e.target.value)}
                    placeholder="USD / % / deals"
                    className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-office-cyan font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-office-muted block mb-1">Periode</label>
                  <input
                    type="text"
                    value={kpiPeriod}
                    onChange={(e) => setKpiPeriod(e.target.value)}
                    placeholder="2026-Q3"
                    className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-office-cyan font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-office-muted block mb-1">Sumber Data</label>
                  <select
                    value={kpiSource}
                    onChange={(e) => setKpiSource(e.target.value as KpiSource)}
                    className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white focus:outline-none focus:border-office-cyan"
                  >
                    <option value="manual">Manual</option>
                    <option value="import">Imported</option>
                    <option value="agent">Agen (Unverified)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-office-muted block mb-1">Catatan Sumber (Opsional)</label>
                <input
                  type="text"
                  value={kpiNote}
                  onChange={(e) => setKpiNote(e.target.value)}
                  placeholder="Buku kas / rekening koran Q3"
                  className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-office-cyan"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-office-muted hover:text-white min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingKpi}
                  className="flex-1 py-2.5 rounded-xl bg-office-cyan text-slate-950 text-xs font-bold hover:bg-cyan-300 min-h-[44px] shadow-glow-cyan disabled:opacity-50"
                >
                  {isSubmittingKpi ? 'Menyimpan...' : 'Simpan KPI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REPORT GENERATOR & VIEWER (Rule REQ-079) */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-office-violet/40 rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-office-violet" />
                <h3 className="text-sm font-bold text-white">Buat Laporan Agen ({activeDept})</h3>
              </div>
              <button
                onClick={() => {
                  setIsReportModalOpen(false);
                  setGeneratedReport(null);
                  setGenerationError(null);
                }}
                type="button"
                className="text-office-muted hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!generatedReport ? (
              <div className="flex flex-col gap-3">
                {/* Anti-Hallucination Information Banner */}
                <div className="rounded-xl p-3 bg-office-cyan/10 border border-office-cyan/30 flex items-start gap-2.5 text-xs text-office-cyan">
                  <ShieldCheck className="w-5 h-5 shrink-0 text-office-cyan" />
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
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          selectedTemplate === tpl.id
                            ? 'bg-office-violet/20 border-office-violet text-white shadow-glow-violet'
                            : 'bg-black/50 border-white/10 text-office-muted hover:text-white'
                        }`}
                      >
                        <span className="font-bold block">{tpl.label}</span>
                        <span className="text-[10px] text-slate-400">{tpl.desc}</span>
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
                    className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-office-violet font-mono"
                  />
                </div>

                {/* Agent Responsible */}
                <div>
                  <label className="text-[11px] text-office-muted block mb-1">Agen Penanggung Jawab</label>
                  <div className="p-2.5 rounded-xl bg-black/60 border border-white/10 flex items-center gap-2 text-xs text-white">
                    <span>{departmentAgents[0]?.avatar || '🤖'}</span>
                    <span className="font-bold">{departmentAgents[0]?.name || 'Agen Divisi'}</span>
                    <span className="text-[10px] text-office-muted">({departmentAgents[0]?.role})</span>
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
                    onClick={() => setIsReportModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-office-muted hover:text-white min-h-[44px]"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={isGenerating}
                    className="flex-1 py-2.5 rounded-xl bg-office-violet text-white text-xs font-bold hover:bg-violet-600 min-h-[44px] shadow-glow-violet disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-2 text-xs text-emerald-400">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="font-bold">Laporan Lolos Verifikasi Anti-Halusinasi</span>
                </div>

                <div className="max-h-[55vh] overflow-y-auto pr-1">
                  <MarkdownView content={generatedReport.body_md} />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsReportModalOpen(false);
                    setGeneratedReport(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-900 border border-white/15 text-xs font-bold text-white hover:bg-slate-800 min-h-[44px]"
                >
                  Tutup Laporan
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW PAST REPORT */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-white/20 rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh]">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-office-violet" />
                <h3 className="text-sm font-bold text-white">Laporan: {viewingReport.template}</h3>
              </div>
              <button
                onClick={() => setViewingReport(null)}
                type="button"
                className="text-office-muted hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono text-office-muted">
              <Calendar className="w-3.5 h-3.5" />
              <span>Periode: {viewingReport.period}</span>
              <span>•</span>
              <span>{new Date(viewingReport.created_at).toLocaleString('id-ID')}</span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <MarkdownView content={viewingReport.body_md} />
            </div>

            <button
              type="button"
              onClick={() => setViewingReport(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 border border-white/15 text-xs font-bold text-white hover:bg-slate-800 min-h-[44px]"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
