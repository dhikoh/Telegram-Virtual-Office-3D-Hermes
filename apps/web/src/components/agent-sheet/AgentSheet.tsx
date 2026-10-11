/**
 * Agent Sheet Bottom Sheet Component (Rule REQ-075 & Section 8)
 * 4 Tabs: Chat (streaming), Activity (live tool progress + history), Tasks, Profile.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MessageSquare,
  Activity,
  CheckSquare,
  User,
  Send,
  Square,
  CheckCircle,
  AlertCircle,
  Wrench,
  HeartPulse,
} from 'lucide-react';
import type { OfficeAgent } from '../../stores/office';
import { useOfficeStore } from '../../stores/office';
import { api } from '../../services/api';
import { tma } from '../../services/tma';
import { MarkdownView } from '../common/MarkdownView';

interface AgentSheetProps {
  agent: OfficeAgent;
  onClose: () => void;
  onOpenTaskCreate?: (agentId: string) => void;
}

type SheetTab = 'chat' | 'activity' | 'tasks' | 'profile';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const AgentSheet: React.FC<AgentSheetProps> = ({ agent, onClose, onOpenTaskCreate }) => {
  const { tasks, ticker, setAgentStatus } = useOfficeStore();
  const [activeTab, setActiveTab] = useState<SheetTab>('chat');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Halo, saya **${agent.name}** (${agent.role}). Siap membantu operasional divisi **${agent.department}**. Ada yang bisa saya bantu?`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Profile Health State
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'healthy' | 'error'>('idle');
  const [healthMessage, setHealthMessage] = useState<string | null>(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Tasks assigned to this agent
  const agentTasks = tasks.filter((task) => task.agent_id === agent.id);
  const runningTask = agentTasks.find((task) => task.status === 'running');

  // Send message with SSE streaming
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    tma.hapticImpact('light');
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantMsgId = `reply-${Date.now()}`;
    const newMessages = [...messages, userMsg];
    setMessages([
      ...newMessages,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setInputMessage('');
    setIsStreaming(true);

    // Format chat history for API
    const historyPayload = newMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await api.streamChat(
      agent.id,
      historyPayload,
      (delta) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + delta } : m))
        );
      },
      () => {
        setIsStreaming(false);
        tma.hapticNotification('success');
      },
      (err) => {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: m.content || `⚠️ Galat komunikasi agen: ${err.message}` }
              : m
          )
        );
      }
    );
  };

  // Check agent health
  const handleCheckHealth = async () => {
    setHealthStatus('checking');
    try {
      const res = await api.getAgentHealth(agent.id);
      setHealthStatus(res.status === 'healthy' ? 'healthy' : 'error');
      setHealthMessage(res.status === 'healthy' ? 'Gateway aktif & siap melayani tugas' : 'Gateway merespons dengan kendala');
      tma.hapticNotification('success');
    } catch (err: unknown) {
      setHealthStatus('error');
      setHealthMessage(err instanceof Error ? err.message : 'Gateway tidak terjangkau');
      tma.hapticNotification('error');
    }
  };

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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center select-none animate-in fade-in">
      <div className="glass-panel-glow w-full max-w-md h-[86vh] max-h-[720px] rounded-t-3xl bg-slate-950/95 border-t border-office-cyan/40 shadow-2xl flex flex-col overflow-hidden">
        {/* Header Drawer */}
        <div className="p-4 pb-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-slate-900 border border-office-cyan/40 shadow-glow-cyan flex items-center justify-center text-2xl relative">
              {agent.avatar || '🤖'}
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-950 ${
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
                <h2 className="text-base font-bold text-white leading-tight">{agent.name}</h2>
                {agent.isDemo && (
                  <span className="text-[8px] font-mono font-bold bg-office-cyan/20 text-office-cyan px-1.5 py-0.5 rounded leading-none">
                    DEMO
                  </span>
                )}
              </div>
              <span className="text-[11px] text-office-cyan font-medium">
                {agent.role} • <span className="capitalize">{agent.department}</span>
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-office-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Tabs Navigation */}
        <div className="flex border-b border-white/10 px-2 bg-slate-900/60">
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
                    ? 'border-office-cyan text-office-cyan bg-office-cyan/5'
                    : 'border-transparent text-office-muted hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Chat */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col max-w-[85%] ${
                    m.role === 'user' ? 'self-end items-end' : 'self-start items-start'
                  }`}
                >
                  <div
                    className={`rounded-2xl p-3 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-office-cyan text-office-bg font-medium rounded-br-none shadow-glow-cyan'
                        : 'glass-panel bg-white/5 text-office-text border border-white/10 rounded-bl-none'
                    }`}
                  >
                    <MarkdownView content={m.content} />
                  </div>
                  <span className="text-[9px] font-mono text-office-muted/70 mt-1 px-1">
                    {m.timestamp}
                  </span>
                </div>
              ))}
              {isStreaming && (
                <div className="self-start flex items-center gap-1 text-[11px] text-office-cyan font-mono animate-pulse pl-2">
                  <span>{agent.name} sedang mengetik...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
            <div className="px-3 py-1 flex gap-1.5 overflow-x-auto no-scrollbar">
              {['Status tugas saat ini?', 'Analisis performa minggu ini', 'Cek anomali divisi'].map((pill) => (
                <button
                  key={pill}
                  onClick={() => handleSendMessage(pill)}
                  disabled={isStreaming}
                  type="button"
                  className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-office-muted hover:text-white whitespace-nowrap shrink-0 transition-colors"
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <div className="p-2.5 border-t border-white/10 bg-slate-900/80 flex items-center gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                placeholder={`Instruksi untuk ${agent.name}...`}
                disabled={isStreaming}
                className="flex-1 bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-office-muted/50 focus:outline-none focus:border-office-cyan min-h-[44px]"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isStreaming}
                type="button"
                className="w-11 h-11 rounded-xl bg-office-cyan text-office-bg font-bold flex items-center justify-center hover:bg-cyan-300 disabled:opacity-40 transition-all shadow-glow-cyan shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Activity */}
        {activeTab === 'activity' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {/* Live tool status banner */}
            <div className="glass-panel rounded-xl p-3 border border-white/10 bg-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    agent.status === 'working'
                      ? 'bg-office-violet/20 text-office-violet shadow-glow-violet'
                      : 'bg-white/5 text-office-muted'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-office-muted uppercase font-mono">Alat Aktif</span>
                  <div className="text-xs font-semibold text-white">
                    {agent.currentTool ? `${agent.currentTool}` : 'Tidak ada alat berjalan'}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/5 text-office-cyan">
                {agent.status}
              </span>
            </div>

            {/* Live Activity Ticker List */}
            <span className="text-xs font-semibold text-office-muted mt-1">Aktivitas Terkini Kantor</span>
            <div className="flex flex-col gap-2">
              {ticker.slice(0, 10).map((t) => (
                <div key={t.id} className="glass-panel rounded-lg p-2.5 border border-white/5 flex items-start gap-2 text-xs">
                  <span className="text-[10px] font-mono text-office-cyan shrink-0 mt-0.5">{t.time}</span>
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
                <span className="text-xs font-semibold text-white">Daftar Tugas Agen</span>
                {onOpenTaskCreate && (
                  <button
                    onClick={() => {
                      tma.hapticImpact('light');
                      onOpenTaskCreate(agent.id);
                    }}
                    type="button"
                    className="text-[11px] font-medium text-office-cyan hover:underline"
                  >
                    + Buat Tugas Baru
                  </button>
                )}
              </div>

              {agentTasks.length === 0 ? (
                <div className="glass-panel rounded-xl p-6 text-center border border-white/5 my-8">
                  <p className="text-xs text-office-muted">Belum ada tugas yang ditugaskan ke {agent.name}.</p>
                </div>
              ) : (
                agentTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`glass-panel rounded-xl p-3 border transition-all ${
                      task.status === 'running'
                        ? 'border-office-violet/50 bg-office-violet/10'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="text-xs font-semibold text-white leading-tight">{task.title}</h4>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 text-office-cyan shrink-0">
                        {task.status}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-[11px] text-office-muted mb-2 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-office-muted">
                      <span>Prioritas: {task.priority}</span>
                      {task.status === 'running' && (
                        <button
                          onClick={() => handleStopTask(task.id)}
                          type="button"
                          className="flex items-center gap-1 text-office-danger hover:underline"
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
                  className="px-3 py-1.5 rounded-lg bg-office-danger text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Square className="w-3 h-3" /> Stop Task
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Profile */}
        {activeTab === 'profile' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {/* Identity & Soul */}
            <div className="glass-panel rounded-xl p-3.5 border border-white/10 flex flex-col gap-2">
              <span className="text-xs font-semibold text-office-cyan">Ringkasan Karakter (SOUL)</span>
              <p className="text-xs text-office-text/90 leading-relaxed bg-black/40 p-2.5 rounded-lg border border-white/5">
                {agent.soul_summary || 'Tidak ada deskripsi jiwa (SOUL) tersimpan.'}
              </p>
            </div>

            {/* Profile Configurations */}
            <div className="glass-panel rounded-xl p-3.5 border border-white/10 flex flex-col gap-2 text-xs">
              <span className="text-xs font-semibold text-white">Spesifikasi Profile</span>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-office-muted">Hermes Profile:</span>
                <span className="font-mono text-office-text">{agent.hermes_profile}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-office-muted">Base URL:</span>
                <span className="font-mono text-office-text truncate max-w-[200px]">{agent.hermes_base_url}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-office-muted">Kunci API Env:</span>
                <span className="font-mono text-office-text">{agent.api_key_env}</span>
              </div>
            </div>

            {/* Health Checker Card */}
            <div className="glass-panel rounded-xl p-3.5 border border-white/10 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <HeartPulse className="w-4 h-4 text-office-cyan" />
                  <span>Kesehatan Gateway Agen</span>
                </div>
                <button
                  onClick={handleCheckHealth}
                  disabled={healthStatus === 'checking'}
                  type="button"
                  className="px-2.5 py-1 rounded bg-office-cyan/10 hover:bg-office-cyan/20 border border-office-cyan/30 text-[10px] font-semibold text-office-cyan transition-colors min-h-[32px]"
                >
                  {healthStatus === 'checking' ? 'Memeriksa...' : 'Uji Koneksi'}
                </button>
              </div>
              {healthMessage && (
                <div
                  className={`p-2 rounded-lg text-xs font-mono flex items-center gap-2 ${
                    healthStatus === 'healthy'
                      ? 'bg-office-success/10 text-office-success border border-office-success/30'
                      : 'bg-office-danger/10 text-office-danger border border-office-danger/30'
                  }`}
                >
                  {healthStatus === 'healthy' ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                  <span>{healthMessage}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
