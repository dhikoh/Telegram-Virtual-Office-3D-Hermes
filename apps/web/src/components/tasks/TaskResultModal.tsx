import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  X,
  History,
  Wrench,
  CheckCircle2,
  PlayCircle,
  AlertCircle,
  Info,
  Clock,
  Download,
} from 'lucide-react';
import type { Task, TaskTimelineEvent } from '@hermes-office/shared';
import { MarkdownView } from '../common/MarkdownView';
import { api } from '../../services/api';

interface TaskResultModalProps {
  task: Task | null;
  onClose: () => void;
  initialTab?: 'result' | 'events';
}

export const TaskResultModal: React.FC<TaskResultModalProps> = ({
  task,
  onClose,
  initialTab = 'result',
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'result' | 'events'>(initialTab);
  const [events, setEvents] = useState<TaskTimelineEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsFetched, setEventsFetched] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
    setEvents([]);
    setEventsFetched(false);
  }, [task?.id, initialTab]);

  useEffect(() => {
    if (!task) return;
    if (activeTab === 'events' && !eventsFetched && !loadingEvents) {
      setLoadingEvents(true);
      api
        .getTaskEvents(task.id)
        .then((res) => {
          setEvents(res.events || []);
          setEventsFetched(true);
        })
        .catch(() => {
          setEvents([]);
          setEventsFetched(true);
        })
        .finally(() => {
          setLoadingEvents(false);
        });
    }
  }, [task, activeTab, eventsFetched, loadingEvents]);

  if (!task) return null;

  const toolCallsCount = task.tool_calls_count ?? 0;
  const isChatSource = task.source === 'chat';
  const taskArtifacts = ((task as unknown as { artifacts?: { id: string; filename: string | null; mime: string | null; size: number; download_url: string }[] }).artifacts) || [];

  const renderEventIcon = (type: string) => {
    if (type.startsWith('tool.started')) {
      return <Wrench className="w-3.5 h-3.5 text-cyan-400" />;
    }
    if (type.startsWith('tool.completed')) {
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    }
    if (type.startsWith('run.started')) {
      return <PlayCircle className="w-3.5 h-3.5 text-blue-400" />;
    }
    if (type.startsWith('run.completed')) {
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    }
    if (type.includes('fail') || type.includes('error')) {
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    }
    return <Info className="w-3.5 h-3.5 text-office-muted" />;
  };

  const formatEventSummary = (event: TaskTimelineEvent) => {
    const payload = event.payload as Record<string, unknown> | null;
    if (!payload || typeof payload !== 'object') {
      return typeof event.payload === 'string' ? event.payload : '';
    }

    if (event.type === 'tool.started') {
      const toolName = payload.tool || payload.name || 'Tool';
      const args = payload.args || payload.arguments || payload.input;
      const argsStr = args ? (typeof args === 'object' ? JSON.stringify(args) : String(args)) : '';
      return `${toolName}${argsStr ? `: ${argsStr}` : ''}`;
    }

    if (event.type === 'tool.completed') {
      const toolName = payload.tool || payload.name || 'Tool';
      const output = payload.output || payload.preview || payload.result;
      const outStr = output ? (typeof output === 'object' ? JSON.stringify(output) : String(output)) : '';
      return `${toolName} selesai${outStr ? ` -> ${outStr.slice(0, 120)}...` : ''}`;
    }

    if (event.type === 'run.started') {
      return 'Eksekusi run dimulai';
    }

    if (event.type === 'run.completed') {
      return 'Eksekusi run selesai dengan sukses';
    }

    if (payload.message && typeof payload.message === 'string') {
      return payload.message;
    }

    return JSON.stringify(payload).slice(0, 140);
  };

  return (
    <div className="fixed inset-0 z-[100] isolate bg-office-inset backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
      <div className="glass-panel-glow w-full max-w-lg max-h-[85vh] rounded-2xl p-5 bg-office-elevated border border-office-accent/40 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-office-border mb-3 gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-office-accent-ink shrink-0" />
              <h2 className="text-sm font-bold text-office-text truncate">{task.title}</h2>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold ${
                  isChatSource
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-office-hover text-office-muted'
                }`}
              >
                {isChatSource ? `💬 ${t('tasks.badgeChat')}` : `📋 ${t('tasks.badgeDirect')}`}
              </span>

              {toolCallsCount > 0 && (
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-office-hover text-cyan-300 border border-cyan-500/20">
                  🔧 {toolCallsCount} {toolCallsCount > 1 ? t('tasks.toolCallsPlural') : t('tasks.toolCalls')}
                </span>
              )}

              <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-office-hover text-office-muted">
                {task.status}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="p-1 text-office-muted hover:text-office-text min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label={t('tasks.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 pb-3 mb-2 border-b border-office-border/60">
          <button
            type="button"
            onClick={() => setActiveTab('result')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'result'
                ? 'bg-office-accent text-office-on-accent shadow-sm'
                : 'text-office-muted hover:text-office-text hover:bg-office-hover'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('tasks.tabResult')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'events'
                ? 'bg-office-accent text-office-on-accent shadow-sm'
                : 'text-office-muted hover:text-office-text hover:bg-office-hover'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{t('tasks.tabEvents')}</span>
            {events.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-office-hover/40 text-office-text">
                {events.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto pr-1">
          {activeTab === 'result' ? (
            <div className="flex flex-col gap-3">
              {task.result_md ? (
                <MarkdownView content={task.result_md} />
              ) : (
                <p className="text-xs text-office-muted font-mono">{t('tasks.noResult')}</p>
              )}

              {taskArtifacts.length > 0 && (
                <div className="mt-4 pt-3 border-t border-office-border/60">
                  <span className="text-[11px] font-semibold text-office-muted block mb-2">
                    Artefak Berkas ({taskArtifacts.length})
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {taskArtifacts.map((art) => (
                      <a
                        key={art.id}
                        href={art.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg bg-office-hover border border-office-border text-xs text-office-text hover:border-cyan-500/40 transition-colors"
                      >
                        <span className="truncate max-w-[240px] font-mono text-[11px]">
                          {art.filename || art.id}
                        </span>
                        <div className="flex items-center gap-1 text-cyan-400 text-[10px]">
                          <Download className="w-3 h-3" />
                          <span>Unduh</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {loadingEvents ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-office-muted">
                  <Clock className="w-5 h-5 animate-spin text-cyan-400" />
                  <span className="text-xs font-mono">{t('tasks.loadingEvents')}</span>
                </div>
              ) : events.length === 0 ? (
                <div className="py-8 text-center text-xs text-office-muted font-mono">
                  {t('tasks.noEvents')}
                </div>
              ) : (
                <div className="relative pl-5 border-l-2 border-office-border/60 flex flex-col gap-3 my-1">
                  {events.map((ev) => (
                    <div key={ev.id} className="relative flex flex-col gap-0.5 text-xs">
                      {/* Timeline dot */}
                      <span className="absolute -left-[27px] top-1 p-1 rounded-full bg-office-elevated border border-office-border flex items-center justify-center">
                        {renderEventIcon(ev.type)}
                      </span>

                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-[11px] text-office-text">
                          {ev.type}
                        </span>
                        <span className="text-[10px] text-office-muted font-mono">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <p className="text-[11px] text-office-muted font-mono break-words bg-office-hover/50 p-1.5 rounded border border-office-border/40">
                        {formatEventSummary(ev)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-office-border mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-office-accent text-office-on-accent font-semibold text-xs shadow-nu-raised min-h-[44px]"
          >
            {t('tasks.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
