/**
 * Screen 5: Reports & KPIs (Rule REQ-078, REQ-079 & Section 8)
 * - 8 Department Tabs (command, social, sales, finance, marketing, analytics, support, hr)
 * - KPI Cards with Sparklines (Recharts), Source Badges (manual, import, agent: unverified), "as of" timestamp
 * - Modular modals for Manual KPI Entry, Anti-Hallucination Generator, and Report Viewer
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Plus,
  Sparkles,
  TrendingUp,
  FileText,
  Clock,
  ArrowRight,
} from 'lucide-react';
import type { Department, OfficeDepartment, Report } from '@hermes-office/shared';
import { DEPARTMENTS } from '@hermes-office/shared';
import { useOfficeStore } from '../stores/office';
import { api } from '../services/api';
import { tma } from '../services/tma';
import { KpiEntryModal } from '../components/reports/KpiEntryModal';
import { GenerateReportModal } from '../components/reports/GenerateReportModal';
import { ReportDetailModal } from '../components/reports/ReportDetailModal';

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

export const ReportsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { kpis, reports, agents, createKpi, fetchInitialData } = useOfficeStore();

  const [activeDept, setActiveDept] = useState<Department>('finance');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);

  // Tahap 10 — chips follow the departments table (renamed / added rooms show
  // up here too); an empty or failed fetch keeps the static seed list so the
  // screen never renders a filter row with nothing in it.
  const [rooms, setRooms] = useState<OfficeDepartment[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .getDepartments()
      .then((rows) => {
        if (alive && Array.isArray(rows) && rows.length > 0) setRooms(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const filterRooms = useMemo<{ id: Department; label: string; icon: string }[]>(() => {
    if (rooms.length > 0) {
      return rooms.map((room) => ({
        id: room.id,
        label: room.name ?? room.id,
        icon: DEPARTMENT_ICONS[room.id] ?? '🏢',
      }));
    }
    return DEPARTMENTS.map((id) => ({ id, label: id, icon: DEPARTMENT_ICONS[id] ?? '🏢' }));
  }, [rooms]);

  const departmentKpis = useMemo(() => {
    return kpis.filter((k) => k.department === activeDept);
  }, [kpis, activeDept]);

  const departmentReports = useMemo(() => {
    return reports.filter((r) => r.department === activeDept);
  }, [reports, activeDept]);

  const departmentAgents = useMemo(() => {
    // Tahap 7: only really hired agents can report. The old DEMO_AGENTS
    // fallback sent the report generator a fictional agent id.
    return agents.filter((a) => a.department === activeDept && !a.isDemo);
  }, [agents, activeDept]);

  const handleTabChange = (dept: Department) => {
    tma.hapticSelection();
    setActiveDept(dept);
  };

  return (
    <div className="flex flex-col min-h-screen p-4 pb-24 max-w-md mx-auto w-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-office-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-office-accent-ink" />
          <h1 className="text-base font-bold text-office-text">{t('nav.reports')}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              tma.hapticImpact('light');
              setIsManualModalOpen(true);
            }}
            type="button"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-office-hover hover:bg-office-hover border border-office-border text-xs text-office-text min-h-[44px]"
          >
            <Plus className="w-3.5 h-3.5 text-office-accent-ink" />
            <span>KPI</span>
          </button>

          <button
            onClick={() => {
              tma.hapticImpact('medium');
              setIsReportModalOpen(true);
            }}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-office-accent text-office-on-accent text-xs font-semibold shadow-nu-raised hover:opacity-90 min-h-[44px]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Buat Laporan</span>
          </button>
        </div>
      </div>

      {/* 8 Department Filter Chips (wraps: the row used to overflow the viewport) */}
      <div className="flex flex-wrap gap-2 pb-3 mb-3">
        {filterRooms.map((room) => {
          const isActive = activeDept === room.id;
          return (
            <button
              key={room.id}
              onClick={() => handleTabChange(room.id)}
              type="button"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all min-h-[44px] ${
                isActive
                  ? 'bg-office-accent text-office-on-accent shadow-nu-raised'
                  : 'bg-office-hover text-office-muted hover:text-office-text border border-office-border'
              }`}
            >
              <span>{room.icon}</span>
              <span className="capitalize">{room.label}</span>
            </button>
          );
        })}
      </div>

      {/* Department KPI Metric Cards */}
      <section className="flex flex-col gap-3 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-office-muted">
            Metrik KPI {activeDept}
          </h2>
          <span className="text-[11px] text-office-text/70 font-mono">{departmentKpis.length} tercatat</span>
        </div>

        {departmentKpis.length === 0 ? (
          <div className="glass-panel rounded-2xl p-6 text-center border border-office-border flex flex-col items-center gap-2">
            <TrendingUp className="w-6 h-6 text-office-muted" />
            <span className="text-xs text-office-muted">Belum ada data KPI untuk departemen ini.</span>
            <button
              onClick={() => setIsManualModalOpen(true)}
              type="button"
              className="mt-1 text-xs text-office-accent-ink font-bold underline min-h-[44px] flex items-center"
            >
              + Tambah KPI pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {departmentKpis.map((kpi) => {
              return (
                <div
                  key={kpi.id}
                  className="glass-panel rounded-2xl p-3 border border-office-border flex flex-col justify-between relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-1 z-10">
                    <span className="text-[11px] font-semibold text-office-text/75 leading-tight line-clamp-1">
                      {kpi.label}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${
                        kpi.source === 'agent'
                          ? 'bg-office-warn/20 text-office-warn border border-office-warn/30'
                          : kpi.source === 'import'
                          ? 'bg-sky-500/15 text-sky-700 border border-sky-500/30'
                          : 'bg-office-success/20 text-office-success'
                      }`}
                    >
                      {kpi.source === 'agent' ? 'Unverified' : kpi.source}
                    </span>
                  </div>

                  <div className="my-2 z-10">
                    <div className="text-base font-bold font-mono text-office-text">
                      {kpi.value.toLocaleString()} <span className="text-[10px] text-office-text/70 font-sans">{kpi.unit}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-office-text/70 font-mono mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{kpi.period}</span>
                    </div>
                  </div>

                  {/* Tahap 7: the old sparkline was synthesised (value * 0.75 …)
                      — a chart of invented history. Show the recorded facts only. */}
                  <div className="mt-1 -mb-1 flex items-center gap-1 text-[10px] text-office-text/60 font-mono">
                    <Clock className="w-2.5 h-2.5" />
                    <span>Tercatat {new Date(kpi.created_at).toLocaleDateString('id-ID')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Generated Reports List */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-office-muted">
            Laporan Kinerja ({activeDept})
          </h2>
          <span className="text-[11px] text-office-text/70 font-mono">{departmentReports.length} laporan</span>
        </div>

        {departmentReports.length === 0 ? (
          <div className="glass-panel rounded-2xl p-5 text-center border border-office-border text-xs text-office-muted">
            Belum ada laporan yang dihasilkan untuk {activeDept}.
          </div>
        ) : (
          departmentReports.map((rep) => (
            <div
              key={rep.id}
              onClick={() => {
                tma.hapticImpact('light');
                setViewingReport(rep);
              }}
              className="glass-panel rounded-xl p-3 border border-office-border hover:border-office-violet/50 cursor-pointer flex items-center justify-between transition-all min-h-[48px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-office-violet/20 text-office-violet">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-office-text capitalize">
                    {rep.template.replace(/_/g, ' ')}
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

      {/* Modals */}
      <KpiEntryModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        activeDept={activeDept}
        onSave={async (newKpi) => {
          const kpiId = `kpi_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await createKpi({
            id: kpiId,
            ...newKpi,
            department: activeDept,
          });
        }}
      />

      <GenerateReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        activeDept={activeDept}
        departmentAgents={departmentAgents}
        onReportCreated={() => {
          fetchInitialData();
        }}
      />

      <ReportDetailModal
        report={viewingReport}
        onClose={() => setViewingReport(null)}
      />
    </div>
  );
};
