/**
 * Office Screen (Home) — Rule REQ-070, REQ-071, REQ-072, REQ-073, REQ-074
 * Top HUD + 2D Floor Plan SVG + Floating Ask Office + Status State Matrix (Rule C5).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { HeaderHUD } from '../components/layout/HeaderHUD';
import { Map } from '../components/office/Map';
import { EmptyOffice } from '../components/office/Empty';
import { AskOffice } from '../components/office/AskOffice';
import { AgentSheet } from '../components/agent-sheet/AgentSheet';
import { useOfficeStore, type OfficeAgent } from '../stores/office';
import { useViewModeStore } from '../stores/view-mode';
import { tma } from '../services/tma';
import type { AgentNormalizedStatus } from '@hermes-office/shared';

const Office3D = React.lazy(() => import('../components/office/office-3d/Office3D'));

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

  const { viewMode, webGLError, setWebGLError } = useViewModeStore();

  const [showSimPanel, setShowSimPanel] = useState(false);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const handleSelectAgent = (agent: OfficeAgent) => {
    setSelectedAgentId(agent.id);
  };

  const handleOpenAskOffice = () => {
    const commandAgent = agents.find((a) => a.department === 'command') || agents[0];
    if (commandAgent) {
      setSelectedAgentId(commandAgent.id);
    }
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

        {/* WebGL Context Loss / Incompatibility Fallback Banner (Rule 9.3 & REQ-117) */}
        {webGLError && (
          <div className="w-full mb-3 p-3 rounded-xl bg-office-warn/15 border border-office-warn/40 flex items-center justify-between">
            <span className="text-xs text-office-warn font-medium">{webGLError}</span>
            <button
              onClick={() => setWebGLError(null)}
              type="button"
              className="text-[11px] text-office-warn font-mono hover:underline px-2 py-0.5 rounded bg-office-warn/10"
            >
              Tutup
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
                {viewMode === '3D' ? '3D Isometric Floor Plan' : '2D Floor Plan • 8 Divisions'}
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

            {/* View Mode Switching: 3D Isometric View (Lazy loaded) or 2D SVG Map */}
            {viewMode === '3D' ? (
              <React.Suspense
                fallback={
                  <div className="w-full max-w-[390px] aspect-[380/420] flex flex-col items-center justify-center rounded-xl border border-office-border bg-office-bg">
                    <div className="w-8 h-8 rounded-full border-2 border-office-cyan border-t-transparent animate-spin mb-2" />
                    <span className="text-xs text-office-muted font-mono">Memuat Tampilan 3D...</span>
                  </div>
                }
              >
                <Office3D
                  isPaused={!!selectedAgent}
                  onSelectAgent={handleSelectAgent}
                  onOpenRecruitment={onOpenRecruitment}
                />
              </React.Suspense>
            ) : (
              <Map
                onSelectAgent={handleSelectAgent}
                onOpenRecruitment={onOpenRecruitment}
              />
            )}
          </div>
        )}

        {/* Floating Ask Office Button */}
        {agents.length > 0 && <AskOffice onClick={handleOpenAskOffice} />}

        {/* Full Agent Sheet Bottom Sheet (Rule REQ-075) */}
        {selectedAgent && (
          <AgentSheet
            agent={selectedAgent}
            onClose={() => setSelectedAgentId(null)}
          />
        )}
      </main>
    </div>
  );
};
