import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, X, Search, Check } from 'lucide-react';
import { useOfficeStore } from '../../stores/office';
import { tma } from '../../services/tma';

interface AgentMessengerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAgentId?: string | null;
}

export const AgentMessengerModal: React.FC<AgentMessengerModalProps> = ({
  isOpen,
  onClose,
  currentAgentId,
}) => {
  const { t } = useTranslation();
  const { agents, speech, setSelectedAgentId } = useOfficeStore();
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredAgents = agents.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      a.department.toLowerCase().includes(q)
    );
  });

  const handleSelectAgent = (agentId: string) => {
    tma.hapticImpact('light');
    setSelectedAgentId(agentId);
    onClose();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
        return 'bg-office-violet animate-pulse';
      case 'waiting_approval':
        return 'bg-office-warn';
      case 'error':
        return 'bg-office-danger';
      case 'offline':
        return 'bg-office-muted';
      default:
        return 'bg-office-success';
    }
  };

  const formatMessageTime = (ts?: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-[100] isolate bg-office-inset/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in">
      <div className="glass-panel-glow w-full max-w-md h-[80vh] max-h-[640px] rounded-t-3xl sm:rounded-3xl bg-office-elevated border border-office-accent/40 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 pb-3 border-b border-office-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-office-text leading-tight">
                {t('messenger.title')}
              </h2>
              <span className="text-[10px] text-office-muted font-mono">
                {agents.length} {t('messenger.allAgents')}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            aria-label="Tutup Messenger"
            className="w-9 h-9 rounded-full bg-office-hover flex items-center justify-center text-office-muted hover:text-office-text transition-colors min-h-[44px] min-w-[44px]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-office-border/60 bg-office-surface/40">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-office-muted absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('messenger.searchPlaceholder')}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-office-inset border border-office-border text-xs text-office-text placeholder:text-office-muted focus:outline-none focus:border-cyan-400 font-medium"
            />
          </div>
        </div>

        {/* Agent Chat List */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
          {filteredAgents.length === 0 ? (
            <div className="py-12 text-center text-xs text-office-muted font-mono">
              {t('messenger.emptySearch')}
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const isCurrent = agent.id === currentAgentId;
              const lastSpeech = speech[agent.id];
              const previewText =
                lastSpeech?.text || agent.soul_summary || agent.role || t('messenger.noSpeech');

              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleSelectAgent(agent.id)}
                  className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all min-h-[56px] border ${
                    isCurrent
                      ? 'bg-cyan-950/30 border-cyan-500/50 shadow-sm'
                      : 'bg-office-hover/60 hover:bg-office-hover border-office-border/40 hover:border-office-border'
                  }`}
                >
                  {/* Avatar + Status Dot */}
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-office-elevated border border-office-border flex items-center justify-center text-2xl shadow-sm">
                      {agent.avatar || '🤖'}
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-office-elevated ${getStatusColor(
                        agent.status
                      )}`}
                    />
                  </div>

                  {/* Agent Details & Message Preview */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-bold text-xs text-office-text truncate">
                        {agent.name}
                      </span>
                      {lastSpeech?.at ? (
                        <span className="text-[10px] text-office-muted font-mono shrink-0">
                          {formatMessageTime(lastSpeech.at)}
                        </span>
                      ) : (
                        <span className="text-[9px] text-office-muted font-mono capitalize shrink-0">
                          {agent.department}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-office-muted truncate font-normal leading-tight">
                      {previewText}
                    </p>
                  </div>

                  {/* Active Indicator */}
                  {isCurrent && (
                    <div className="shrink-0 flex items-center gap-1 text-[10px] font-mono font-semibold text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded-full border border-cyan-500/30">
                      <Check className="w-3 h-3" />
                      <span>{t('messenger.activeAgent')}</span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
