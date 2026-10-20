import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, RefreshCw, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import type { CronJob } from '@hermes-office/shared';
import { api } from '../../services/api';
import { tma } from '../../services/tma';

export const CronScheduleView: React.FC = () => {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCronJobs();
      setJobs(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchJobs();
  }, []);

  const handleRefresh = () => {
    tma.hapticImpact('light');
    void fetchJobs();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
      {/* Sub Header */}
      <div className="flex items-center justify-between pb-2 border-b border-office-border/60">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold text-office-text">{t('cron.title')}</h2>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-office-hover text-cyan-300">
            {jobs.length}
          </span>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          aria-label="Refresh cron jobs"
          className="p-1.5 rounded-lg bg-office-hover text-office-muted hover:text-office-text min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Body */}
      {loading && jobs.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-office-muted">
          <Clock className="w-6 h-6 animate-spin text-cyan-400" />
          <span className="text-xs font-mono">{t('tasks.loadingEvents')}</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-12 text-center text-xs text-office-muted font-mono">
          {t('cron.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {jobs.map((job) => {
            const isActive = job.enabled !== false && job.state !== 'paused';

            return (
              <div
                key={job.id}
                className="rounded-2xl p-3.5 glass-panel bg-office-elevated border border-office-border flex flex-col gap-2.5 shadow-sm"
              >
                {/* Header card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-xs text-office-text leading-tight">
                      {job.name}
                    </span>
                    <span className="font-mono text-[10px] text-office-muted">{job.id}</span>
                  </div>

                  <span
                    className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-office-hover text-office-muted'
                    }`}
                  >
                    {isActive ? t('cron.active') : t('cron.paused')}
                  </span>
                </div>

                {/* Schedule Display */}
                <div className="flex items-center gap-1.5 text-xs text-cyan-300 font-mono bg-cyan-950/20 p-2 rounded-xl border border-cyan-800/30">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{job.cron_wib || job.cron || '—'}</span>
                </div>

                {/* Assigned Agent */}
                <div className="flex items-center justify-between pt-2 border-t border-office-border/60 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{job.agent_avatar || '🤖'}</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-office-muted">{t('cron.assignedTo')}</span>
                      <span className="font-semibold text-[11px] text-office-text">
                        {job.agent_name || job.agent_id || 'Umum'}
                      </span>
                    </div>
                  </div>

                  {job.last_status && (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      <span className="capitalize">{job.last_status}</span>
                    </div>
                  )}
                </div>

                {/* Skills tags */}
                {job.skills && job.skills.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pt-1">
                    {job.skills.map((skill) => (
                      <span
                        key={skill}
                        className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-office-hover text-office-muted border border-office-border/40"
                      >
                        #{skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
