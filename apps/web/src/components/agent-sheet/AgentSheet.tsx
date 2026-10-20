/**
 * Agent Sheet Bottom Sheet Component (Rule REQ-075 & Section 8)
 * 4 Tabs: Chat (streaming), Activity (live tool progress + history), Tasks, Profile.
 */

import React, { useState } from 'react';
import {
  X,
  MessageSquare,
  Activity,
  CheckSquare,
  User,
  Square,
  Wrench,
  Users,
} from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { useOfficeStore } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { AgentSheetChat } from './AgentSheetChat';
import { AgentSheetProfile } from './AgentSheetProfile';

interface AgentSheetProps {
  agent: OfficeAgent;
  onClose: () => void;
  onOpenTaskCreate?: (agentId: string) => void;
  onOpenMessenger?: () => void;
}

type SheetTab = 'chat' | 'activity' | 'tasks' | 'profile';

export const AgentSheet: React.FC<AgentSheetProps> = ({
  agent,
  onClose,
  onOpenTaskCreate,
  onOpenMessenger,
}) => {
  const { tasks, ticker, setAgentStatus } = useOfficeStore();
  const [activeTab, setActiveTab] = useState<SheetTab>('chat');

  // Tasks assigned to this agent
  const agentTasks = tasks.filter((task) => task.agent_id === agent.id);
  const runningTask = agentTasks.find((task) => task.status === 'running');

  // Stop running task
  const handleStopTask = async (taskId: string) => {
    tma.hapticNotification('warning');
    try {
      await api.stopTask(taskId);
      setAgentStatus(agent.id, 'idle');
    } catch {
      // Ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[100] isolate bg-office-inset backdrop-blur-sm flex items-end justify-center select-none animate-in fade-in">
      <div className="glass-panel-glow w-full max-w-md h-[86vh] max-h-[720px] rounded-t-3xl bg-office-elevated border-t border-office-accent/40 shadow-2xl flex flex-col overflow-hidden">
        {/* Header Drawer */}
        <div className="p-4 pb-3 border-b border-office-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-office-elevated border border-office-accent/40 shadow-nu-raised flex items-center justify-center text-2xl relative">
              {agent.avatar || '🤖'}
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-office-border ${
                  agent.status === 'working'
                    ? 'bg-office-violet animate-ping'
                    : agent.status === 'waiting_approval'
                    ? 'bg-office-warn'
                    : agent.status === 'error'
                    ? 'bg-office-danger'
                    : 'bg-office-success'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-office-text leading-tight">{agent.name}</h2>
                {agent.isDemo && (
                  <span className="text-[8px] font-mono font-bold bg-office-accent/20 text-office-accent-ink px-1.5 py-0.5 rounded leading-none">
                    DEMO
                  </span>
                )}
              </div>
              <span className="text-[11px] text-office-accent-ink font-medium">
                {agent.role} • <span className="capitalize">{agent.department}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenMessenger && (
              <button
                onClick={onOpenMessenger}
                type="button"
                aria-label="Ganti Agen"
                title="Ganti Agen"
                className="w-11 h-11 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center transition-colors min-h-[44px] min-w-[44px]"
              >
                <Users className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              type="button"
              aria-label="Tutup Lembar Agen"
              className="w-11 h-11 rounded-full bg-office-hover hover:bg-office-hover flex items-center justify-center text-office-muted hover:text-office-text transition-colors min-h-[44px] min-w-[44px]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4 Tabs Navigation */}
        <div className="flex border-b border-office-border px-2 bg-office-elevated">
          {[
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'activity', label: 'Aktivitas', icon: Activity },
            { id: 'tasks', label: `Tugas (${agentTasks.length})`, icon: CheckSquare },
            { id: 'profile', label: 'Profil', icon: User },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  tma.hapticSelection();
                  setActiveTab(tab.id as SheetTab);
                }}
                type="button"
                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold border-b-2 transition-all min-h-[44px] ${
                  isActive
                    ? 'border-office-accent text-office-accent-ink bg-office-accent/5'
                    : 'border-transparent text-office-muted hover:text-office-text'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Chat */}
        {activeTab === 'chat' && <AgentSheetChat agent={agent} />}

        {/* Tab 2: Activity */}
        {activeTab === 'activity' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <div className="glass-panel rounded-xl p-3 border border-office-border bg-office-elevated flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    agent.status === 'working'
                      ? 'bg-office-violet/20 text-office-violet shadow-nu-raised'
                      : 'bg-office-hover text-office-muted'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-office-muted uppercase font-mono">Alat Aktif</span>
                  <div className="text-xs font-semibold text-office-text">
                    {agent.currentTool ? `${agent.currentTool}` : 'Tidak ada alat berjalan'}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-office-hover text-office-accent-ink">
                {agent.status}
              </span>
            </div>

            <span className="text-xs font-semibold text-office-muted mt-1">Aktivitas Terkini Kantor</span>
            <div className="flex flex-col gap-2">
              {ticker.slice(0, 10).map((t) => (
                <div key={t.id} className="glass-panel rounded-lg p-2.5 border border-office-border flex items-start gap-2 text-xs">
                  <span className="text-[10px] font-mono text-office-accent-ink shrink-0 mt-0.5">{t.time}</span>
                  <span className="text-office-text/90 leading-tight">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Tasks */}
        {activeTab === 'tasks' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-office-text">Daftar Tugas Agen</span>
                {onOpenTaskCreate && (
                  <button
                    onClick={() => {
                      tma.hapticImpact('light');
                      onOpenTaskCreate(agent.id);
                    }}
                    type="button"
                    className="text-[11px] font-medium text-office-accent-ink hover:underline min-h-[44px] flex items-center"
                  >
                    + Buat Tugas Baru
                  </button>
                )}
              </div>

              {agentTasks.length === 0 ? (
                <div className="glass-panel rounded-xl p-6 text-center border border-office-border my-8">
                  <p className="text-xs text-office-muted">Belum ada tugas yang ditugaskan ke {agent.name}.</p>
                </div>
              ) : (
                agentTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`glass-panel rounded-xl p-3 border transition-all ${
                      task.status === 'running'
                        ? 'border-office-violet/50 bg-office-violet/10'
                        : 'border-office-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="text-xs font-semibold text-office-text leading-tight">{task.title}</h4>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-office-hover text-office-accent-ink shrink-0">
                        {task.status}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-[11px] text-office-muted mb-2 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-office-border text-[10px] font-mono text-office-muted">
                      <span>Prioritas: {task.priority}</span>
                      {task.status === 'running' && (
                        <button
                          onClick={() => handleStopTask(task.id)}
                          type="button"
                          className="flex items-center gap-1 text-office-danger hover:underline min-h-[44px]"
                        >
                          <Square className="w-3 h-3" /> Hentikan
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {runningTask && (
              <div className="mt-3 p-3 rounded-xl bg-office-violet/15 border border-office-violet/40 flex items-center justify-between">
                <span className="text-xs text-office-violet font-medium">Tugas sedang berjalan aktif</span>
                <button
                  onClick={() => handleStopTask(runningTask.id)}
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-office-danger text-office-text text-xs font-semibold flex items-center gap-1 min-h-[44px]"
                >
                  <Square className="w-3 h-3" /> Stop Task
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Profile */}
        {activeTab === 'profile' && <AgentSheetProfile agent={agent} />}
      </div>
    </div>
  );
};
