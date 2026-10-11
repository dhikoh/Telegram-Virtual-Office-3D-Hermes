/**
 * Top HUD Component (Rule REQ-070 & Section 8)
 * Displays active runs, pending approvals, errors, agents online,
 * stream connection state, and live event ticker.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlayCircle, ShieldAlert, AlertTriangle, Users, Zap } from 'lucide-react';
import { useOfficeStore } from '../../stores/office';
import { usePowerStore } from '../../stores/power';

export const HeaderHUD: React.FC = () => {
  const { t } = useTranslation();
  const { agents, tasks, approvals, streamStatus, ticker } = useOfficeStore();
  const { isLowPower, toggleLowPower } = usePowerStore();

  const activeRunsCount = tasks.filter((task) => task.status === 'running').length;
  const pendingApprovalsCount = approvals.filter((app) => app.status === 'pending').length;
  const errorsCount = agents.filter((ag) => ag.status === 'error').length +
    tasks.filter((task) => task.status === 'failed').length;
  const agentsOnlineCount = agents.filter((ag) => ag.status !== 'offline').length;

  const latestTicker = ticker[0];

  return (
    <header className="w-full flex flex-col bg-office-bg/90 backdrop-blur-md border-b border-office-border sticky top-0 z-30 px-3 pt-2 pb-2 transition-all">
      {/* Top Metrics Row */}
      <div className="flex items-center justify-between gap-2">
        {/* Active Runs */}
        <div className="flex-1 min-w-[70px] glass-panel rounded-lg p-1.5 flex flex-col items-center justify-center border border-white/5">
          <div className="flex items-center gap-1 text-office-cyan text-[11px] font-medium">
            <PlayCircle className="w-3.5 h-3.5" />
            <span className="truncate">{t('hud.activeRuns')}</span>
          </div>
          <span className="font-mono text-base font-bold text-office-text leading-tight mt-0.5">
            {activeRunsCount}
          </span>
        </div>

        {/* Pending Approvals */}
        <div
          className={`flex-1 min-w-[70px] glass-panel rounded-lg p-1.5 flex flex-col items-center justify-center border transition-all ${
            pendingApprovalsCount > 0
              ? 'border-office-warn/60 bg-office-warn/10 shadow-glow-warn'
              : 'border-white/5'
          }`}
        >
          <div className="flex items-center gap-1 text-office-warn text-[11px] font-medium">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="truncate">{t('hud.pendingApprovals')}</span>
          </div>
          <span
            className={`font-mono text-base font-bold leading-tight mt-0.5 ${
              pendingApprovalsCount > 0 ? 'text-office-warn animate-pulse' : 'text-office-text'
            }`}
          >
            {pendingApprovalsCount}
          </span>
        </div>

        {/* Errors */}
        <div
          className={`flex-1 min-w-[70px] glass-panel rounded-lg p-1.5 flex flex-col items-center justify-center border transition-all ${
            errorsCount > 0
              ? 'border-office-danger/60 bg-office-danger/10 shadow-glow-danger'
              : 'border-white/5'
          }`}
        >
          <div className="flex items-center gap-1 text-office-danger text-[11px] font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="truncate">{t('hud.errors')}</span>
          </div>
          <span className="font-mono text-base font-bold text-office-text leading-tight mt-0.5">
            {errorsCount}
          </span>
        </div>

        {/* Agents Online & Status Controls */}
        <div className="flex-1 min-w-[70px] glass-panel rounded-lg p-1.5 flex flex-col items-center justify-center border border-white/5 relative">
          <div className="flex items-center gap-1 text-office-success text-[11px] font-medium">
            <Users className="w-3.5 h-3.5" />
            <span className="truncate">{t('hud.agentsOnline')}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-base font-bold text-office-text leading-tight">
              {agentsOnlineCount}/{agents.length}
            </span>
            {/* SSE Stream status dot */}
            <span
              title={streamStatus === 'connected' ? t('hud.connected') : t('hud.disconnected')}
              className={`w-2 h-2 rounded-full ${
                streamStatus === 'connected'
                  ? 'bg-office-success shadow-[0_0_8px_#34D399]'
                  : streamStatus === 'connecting'
                  ? 'bg-office-warn animate-ping'
                  : 'bg-office-danger'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Live Event Ticker Bar */}
      <div className="mt-1.5 flex items-center justify-between gap-2 bg-black/40 rounded-md px-2.5 py-1 border border-white/5 text-[11px]">
        <div className="flex items-center gap-1.5 overflow-hidden flex-1">
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-office-cyan opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-office-cyan"></span>
          </span>
          <span className="text-office-muted font-mono text-[10px] shrink-0">
            {latestTicker?.time || '--:--'}
          </span>
          <span className="text-office-text/90 truncate">
            {latestTicker?.text || t('hud.tickerWaiting')}
          </span>
        </div>

        {/* Low Power Toggle Button */}
        <button
          onClick={toggleLowPower}
          type="button"
          aria-label={t('power.toggle')}
          title={isLowPower ? t('power.active') : t('power.label')}
          className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors min-h-[28px] ${
            isLowPower
              ? 'bg-office-warn/20 text-office-warn border border-office-warn/40'
              : 'bg-white/5 text-office-muted hover:text-office-text'
          }`}
        >
          <Zap className="w-3 h-3" />
          <span>{isLowPower ? 'ECO' : 'FULL'}</span>
        </button>
      </div>
    </header>
  );
};
