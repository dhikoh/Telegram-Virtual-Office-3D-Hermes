/**
 * Virtual Office Global State (Zustand)
 * Manages agents, real-time SSE stream from /api/stream,
 * event ticker, approvals, and demo office loader (Rule REQ-074).
 */

import { create } from 'zustand';
import type { Agent, Task, Approval, AgentNormalizedStatus } from '@hermes-office/shared';
import { api } from '../services/api';
import { tma } from '../services/tma';

export interface OfficeAgent extends Agent {
  status: AgentNormalizedStatus;
  currentTool?: string;
  isDemo?: boolean;
}

export interface TickerItem {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'working' | 'approval' | 'error' | 'success';
}

interface OfficeState {
  agents: OfficeAgent[];
  tasks: Task[];
  approvals: Approval[];
  streamStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  ticker: TickerItem[];
  selectedAgentId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchInitialData: () => Promise<void>;
  initStream: () => () => void;
  loadDemoOffice: () => Promise<void>;
  setSelectedAgentId: (id: string | null) => void;
  setAgentStatus: (agentId: string, status: AgentNormalizedStatus, currentTool?: string) => void;
  addTickerMessage: (text: string, type?: TickerItem['type']) => void;
}

const DEMO_AGENTS: OfficeAgent[] = [
  {
    id: 'demo-command',
    name: 'Ares',
    role: 'Command Chief & Orchestrator',
    department: 'command',
    avatar: '⚡',
    soul_summary: 'Mengatur alur kerja tim, mendistribusikan tugas antar agen, dan memantau KPI.',
    hermes_base_url: 'http://127.0.0.1:8642',
    api_key_env: 'HERMES_KEY_COMMAND',
    hermes_profile: 'ares-command',
    active: 1,
    hired_at: 1728700000000,
    created_at: 1728700000000,
    status: 'idle',
    isDemo: true,
  },
  {
    id: 'demo-social',
    name: 'Maya',
    role: 'Social Media Lead',
    department: 'social',
    avatar: '📱',
    soul_summary: 'Mengelola jadwal posting X/Telegram, riset viral hook, dan copywriting interaktif.',
    hermes_base_url: 'http://127.0.0.1:8642',
    api_key_env: 'HERMES_KEY_SOCIAL',
    hermes_profile: 'maya-social',
    active: 1,
    hired_at: 1728700000000,
    created_at: 1728700000000,
    status: 'idle',
    isDemo: true,
  },
  {
    id: 'demo-sales',
    name: 'Jordan',
    role: 'B2B Sales Specialist',
    department: 'sales',
    avatar: '💼',
    soul_summary: 'Kualifikasi lead inbound, follow up prospek, dan menyusun penawaran bisnis.',
    hermes_base_url: 'http://127.0.0.1:8642',
    api_key_env: 'HERMES_KEY_SALES',
    hermes_profile: 'jordan-sales',
    active: 1,
    hired_at: 1728700000000,
    created_at: 1728700000000,
    status: 'idle',
    isDemo: true,
  },
  {
    id: 'demo-finance',
    name: 'Satoshi',
    role: 'Financial Analyst',
    department: 'finance',
    avatar: '🪙',
    soul_summary: 'Audit biaya API/server bulanan, rekonsiliasi arus kas, dan kontrol invoice.',
    hermes_base_url: 'http://127.0.0.1:8642',
    api_key_env: 'HERMES_KEY_FINANCE',
    hermes_profile: 'satoshi-finance',
    active: 1,
    hired_at: 1728700000000,
    created_at: 1728700000000,
    status: 'idle',
    isDemo: true,
  },
  {
    id: 'demo-marketing',
    name: 'Echo',
    role: 'Growth Marketing Lead',
    department: 'marketing',
    avatar: '🎯',
    soul_summary: 'Optimasi SEO, riset tren kompetitor, dan monitoring kampanye iklan.',
    hermes_base_url: 'http://127.0.0.1:8642',
    api_key_env: 'HERMES_KEY_MARKETING',
    hermes_profile: 'echo-marketing',
    active: 1,
    hired_at: 1728700000000,
    created_at: 1728700000000,
    status: 'idle',
    isDemo: true,
  },
  {
    id: 'demo-analytics',
    name: 'Ada',
    role: 'Data Scientist',
    department: 'analytics',
    avatar: '📊',
    soul_summary: 'Menganalisis performa retensi pengguna, pembuatan chart KPI, dan deteksi anomali.',
    hermes_base_url: 'http://127.0.0.1:8642',
    api_key_env: 'HERMES_KEY_ANALYTICS',
    hermes_profile: 'ada-analytics',
    active: 1,
    hired_at: 1728700000000,
    created_at: 1728700000000,
    status: 'idle',
    isDemo: true,
  },
  {
    id: 'demo-support',
    name: 'Neo',
    role: 'Customer Support Lead',
    department: 'support',
    avatar: '🎧',
    soul_summary: 'Menjawab tiket pertanyaan teknis pengguna 24/7 dan eskalasi bug ke tim.',
    hermes_base_url: 'http://127.0.0.1:8642',
    api_key_env: 'HERMES_KEY_SUPPORT',
    hermes_profile: 'neo-support',
    active: 1,
    hired_at: 1728700000000,
    created_at: 1728700000000,
    status: 'idle',
    isDemo: true,
  },
  {
    id: 'demo-hr',
    name: 'Hera',
    role: 'Talent & HR Coordinator',
    department: 'hr',
    avatar: '🤝',
    soul_summary: 'Menyusun SOUL.md profil baru, evaluasi kinerja agen, dan onboarding tim.',
    hermes_base_url: 'http://127.0.0.1:8642',
    api_key_env: 'HERMES_KEY_HR',
    hermes_profile: 'hera-hr',
    active: 1,
    hired_at: 1728700000000,
    created_at: 1728700000000,
    status: 'idle',
    isDemo: true,
  },
];

export const useOfficeStore = create<OfficeState>((set, get) => ({
  agents: [],
  tasks: [],
  approvals: [],
  streamStatus: 'connecting',
  ticker: [
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      text: 'Sistem kantor virtual Hermes siap.',
      type: 'info',
    },
  ],
  selectedAgentId: null,
  isLoading: false,
  error: null,

  fetchInitialData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [agentsData, tasksData, approvalsData] = await Promise.allSettled([
        api.getAgents(),
        api.getTasks(),
        api.getApprovals(),
      ]);

      const loadedAgents: OfficeAgent[] =
        agentsData.status === 'fulfilled'
          ? agentsData.value.map((a) => ({ ...a, status: 'idle' as AgentNormalizedStatus }))
          : [];

      const loadedTasks = tasksData.status === 'fulfilled' ? tasksData.value : [];
      const loadedApprovals = approvalsData.status === 'fulfilled' ? approvalsData.value : [];

      set({
        agents: loadedAgents,
        tasks: loadedTasks,
        approvals: loadedApprovals,
        isLoading: false,
      });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Gagal memuat data kantor',
      });
    }
  },

  initStream: () => {
    const initData = tma.getInitData();
    const streamUrl = `/api/stream?auth=${encodeURIComponent(initData)}`;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(streamUrl);
      set({ streamStatus: 'connecting' });

      eventSource.onopen = () => {
        set({ streamStatus: 'connected' });
        get().addTickerMessage('Terhubung ke saluran live SSE kantor.', 'success');
      };

      eventSource.addEventListener('heartbeat', () => {
        set({ streamStatus: 'connected' });
      });

      eventSource.addEventListener('agent_status', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { agent_id, status, current_tool } = payload;
          get().setAgentStatus(agent_id, status, current_tool);
        } catch {
          // Ignore json parse error
        }
      });

      eventSource.addEventListener('approval_requested', (event) => {
        try {
          const payload = JSON.parse(event.data);
          tma.hapticNotification('warning');
          get().addTickerMessage(
            `Persetujuan diperlukan: ${payload.summary || 'Aksi berisiko memerlukan konfirmasi'}`,
            'approval',
          );
          set((state) => ({
            approvals: [payload, ...state.approvals.filter((a) => a.id !== payload.id)],
          }));
        } catch {
          // Ignore
        }
      });

      eventSource.addEventListener('task_update', (event) => {
        try {
          const payload = JSON.parse(event.data);
          get().addTickerMessage(`Tugas "${payload.title}": ${payload.status}`, 'info');
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === payload.id ? { ...t, ...payload } : t)),
          }));
        } catch {
          // Ignore
        }
      });

      eventSource.onerror = () => {
        set({ streamStatus: 'error' });
      };
    } catch {
      set({ streamStatus: 'disconnected' });
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  },

  loadDemoOffice: async () => {
    set({ isLoading: true });
    // Simulate brief setup delay for smooth UX
    await new Promise((resolve) => setTimeout(resolve, 350));
    set({
      agents: DEMO_AGENTS,
      isLoading: false,
    });
    get().addTickerMessage('8 agen demo berhasil dimuat di seluruh divisi kantor.', 'success');
  },

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  setAgentStatus: (agentId, status, currentTool) => {
    set((state) => {
      const updatedAgents = state.agents.map((agent) => {
        if (agent.id === agentId) {
          return { ...agent, status, currentTool };
        }
        return agent;
      });

      return { agents: updatedAgents };
    });

    const targetAgent = get().agents.find((a) => a.id === agentId);
    if (targetAgent) {
      const toolText = currentTool ? ` (alat: ${currentTool})` : '';
      get().addTickerMessage(`${targetAgent.name} berubah status menjadi: ${status}${toolText}`, 'working');
    }
  },

  addTickerMessage: (text, type = 'info') => {
    const newItem: TickerItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      text,
      type,
    };
    set((state) => ({
      ticker: [newItem, ...state.ticker.slice(0, 19)],
    }));
  },
}));
