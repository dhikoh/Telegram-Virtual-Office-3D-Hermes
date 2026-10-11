/**
 * Office Screen (Home) — Rule REQ-070, REQ-071, REQ-072, REQ-073, REQ-074
 * Top HUD + 2D Floor Plan SVG + Floating Ask Office + Status State Matrix (Rule C5).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react';
import { HeaderHUD } from '../components/layout/HeaderHUD';
import { Map } from '../components/office/Map';
import { EmptyOffice } from '../components/office/Empty';
import { AskOffice } from '../components/office/AskOffice';
import { useOfficeStore, type OfficeAgent } from '../stores/office';
import { tma } from '../services/tma';
import type { AgentNormalizedStatus } from '@hermes-office/shared';

interface OfficeScreenProps {
  onOpenRecruitment?: () => void;
  onOpenInbox?: () => void;
}

export const OfficeScreen: React.FC<OfficeScreenProps> = ({ onOpenRecruitment, onOpenInbox: _onOpenInbox }) => {
  const { t } = useTranslation();
  const {
    agents,
    isLoading,
    error,
    fetchInitialData,
    selectedAgentId,
    setSelectedAgentId,
    setAgentStatus,
  } = useOfficeStore();

  const [showSimPanel, setShowSimPanel] = useState(false);
  const [orchestratorModalOpen, setOrchestratorModalOpen] = useState(false);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const handleSelectAgent = (agent: OfficeAgent) => {
    setSelectedAgentId(agent.id);
  };

  const handleOpenAskOffice = () => {
    setOrchestratorModalOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen pb-24 relative select-none">
      {/* Top HUD */}
      <HeaderHUD />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center px-3 pt-3 max-w-md mx-auto w-full">
        {/* State Matrix: Error banner */}
        {error && (
          <div className="w-full mb-3 p-3 rounded-xl bg-office-danger/15 border border-office-danger/40 flex items-center justify-between">
            <span className="text-xs text-office-danger font-medium">{error}</span>
            <button
              onClick={() => fetchInitialData()}
              type="button"
              className="p-1 text-office-danger hover:bg-office-danger/20 rounded transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* State Matrix: Loading indicator */}
        {isLoading && agents.length === 0 && (
          <div className="w-full py-16 flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-office-cyan border-t-transparent animate-spin mb-3" />
            <span className="text-xs text-office-muted font-mono">
              {t('office.loadingDemo')}
            </span>
          </div>
        )}

        {/* State Matrix: Empty State */}
        {!isLoading && agents.length === 0 && <EmptyOffice />}

        {/* State Matrix: Interactive Office Map */}
        {agents.length > 0 && (
          <div className="w-full flex flex-col items-center">
            <div className="w-full flex items-center justify-between px-1 mb-2">
              <span className="text-[11px] font-mono text-office-muted tracking-wider uppercase">
                2D Floor Plan • 8 Divisions
              </span>

              {/* Dev Simulation Bar Toggle */}
              <button
                onClick={() => setShowSimPanel(!showSimPanel)}
                type="button"
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-office-cyan border border-white/10"
              >
                {showSimPanel ? 'Hide Controls' : 'Simulate Status'}
              </button>
            </div>

            {/* Simulation Controller Drawer */}
            {showSimPanel && (
              <div className="w-full mb-3 p-2.5 rounded-xl bg-slate-900/90 border border-office-cyan/30 flex flex-col gap-2 text-xs">
                <span className="text-[11px] font-semibold text-office-cyan">
                  Status Simulator (Phase 3 Acceptance Testing)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    ['idle', 'thinking', 'working', 'waiting_approval', 'error', 'offline'] as AgentNormalizedStatus[]
                  ).map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        const targetId = selectedAgentId || agents[0]?.id;
                        if (targetId) {
                          const tool = st === 'working' ? 'browser_tool' : undefined;
                          setAgentStatus(targetId, st, tool);
                          tma.hapticImpact('light');
                        }
                      }}
                      type="button"
                      className="px-2 py-1 rounded bg-black/60 border border-white/10 text-[10px] font-mono text-office-text hover:border-office-cyan active:scale-95"
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <span className="text-[9px] text-office-muted font-mono">
                  Target: {selectedAgent ? selectedAgent.name : agents[0]?.name || 'Pilih agen'}
                </span>
              </div>
            )}

            {/* 2D SVG Map */}
            <Map
              onSelectAgent={handleSelectAgent}
              onOpenRecruitment={onOpenRecruitment}
            />
          </div>
        )}

        {/* Floating Ask Office Button */}
        {agents.length > 0 && <AskOffice onClick={handleOpenAskOffice} />}

        {/* Quick Agent Detail Preview Modal (Phase 3 Web Shell preview; full sheet in Phase 4) */}
        {selectedAgent && (
          <div className="fixed inset-x-0 bottom-16 z-40 max-w-md mx-auto p-3 animate-in fade-in slide-in-from-bottom-4">
            <div className="glass-panel-glow rounded-2xl p-4 bg-slate-950/95 border border-office-cyan/40 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center text-xl border border-office-cyan/40 shadow-glow-cyan">
                    {selectedAgent.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-office-text leading-tight">
                        {selectedAgent.name}
                      </h3>
                      {selectedAgent.isDemo && (
                        <span className="text-[8px] font-mono font-bold bg-office-cyan/20 text-office-cyan px-1 rounded">
                          DEMO
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-office-cyan font-medium">
                      {selectedAgent.role} ({selectedAgent.department})
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAgentId(null)}
                  type="button"
                  className="p-1 rounded-full text-office-muted hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status and Summary */}
              <div className="py-2.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-office-muted">Status Saat Ini:</span>
                  <span className="font-mono font-semibold text-office-cyan uppercase text-[11px] px-2 py-0.5 rounded bg-office-cyan/10 border border-office-cyan/30">
                    {selectedAgent.status}
                    {selectedAgent.currentTool ? ` (${selectedAgent.currentTool})` : ''}
                  </span>
                </div>
                <p className="text-[11px] text-office-text/80 leading-relaxed bg-black/40 p-2 rounded-lg border border-white/5">
                  {selectedAgent.soul_summary}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Orchestrator Chat Modal (Ask Office) */}
        {orchestratorModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
            <div className="glass-panel-glow w-full max-w-sm rounded-2xl p-5 bg-slate-950 border border-office-cyan/40 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-office-cyan/20 flex items-center justify-center text-office-cyan">
                    ⚡
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {t('office.orchestratorTitle')}
                    </h3>
                    <span className="text-[10px] text-office-cyan">
                      Pusat Komando Hermes
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setOrchestratorModalOpen(false)}
                  type="button"
                  className="p-1 text-office-muted hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="py-4">
                <p className="text-xs text-office-muted leading-relaxed mb-3">
                  {t('office.orchestratorDesc')}
                </p>
                <div className="p-3 rounded-xl bg-black/50 border border-white/10 font-mono text-xs text-office-cyan">
                  &gt; Siap menerima instruksi CEO.
                </div>
              </div>

              <button
                onClick={() => setOrchestratorModalOpen(false)}
                type="button"
                className="w-full py-2.5 rounded-xl bg-office-cyan text-office-bg font-semibold text-xs min-h-[44px]"
              >
                Tutup Dialog
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
