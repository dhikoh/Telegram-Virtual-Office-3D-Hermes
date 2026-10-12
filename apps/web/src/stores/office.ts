/**
 * Virtual Office Global State (Zustand)
 * Manages agents, real-time SSE stream from /api/stream,
 * event ticker, approvals, and demo office loader (Rule REQ-074).
 */

import { create } from 'zustand';
import type { Agent, Task, Approval, Kpi, Report, AgentNormalizedStatus } from '@hermes-office/shared';
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
  kpis: Kpi[];
  reports: Report[];
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
  createKpi: (kpi: Omit<Kpi, 'created_at'>) => Promise<Kpi>;
}

export { DEMO_AGENTS, DEMO_KPIS } from './demo-data.js';
import { DEMO_AGENTS, DEMO_KPIS } from './demo-data.js';

export const useOfficeStore = create<OfficeState>((set, get) => ({
  agents: [],
  tasks: [],
  approvals: [],
  kpis: DEMO_KPIS,
  reports: [],
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
      const [agentsData, tasksData, approvalsData, kpisData, reportsData] = await Promise.allSettled([
        api.getAgents(),
        api.getTasks(),
        api.getApprovals(),
        api.getKpis(),
        api.getReports(),
      ]);

      const loadedAgents: OfficeAgent[] =
        agentsData.status === 'fulfilled'
          ? agentsData.value.map((a) => ({ ...a, status: 'idle' as AgentNormalizedStatus }))
          : [];

      const loadedTasks = tasksData.status === 'fulfilled' ? tasksData.value : [];
      const loadedApprovals = approvalsData.status === 'fulfilled' ? approvalsData.value : [];
      const loadedKpis = kpisData.status === 'fulfilled' ? (kpisData.value as Kpi[]) : [];
      const loadedReports = reportsData.status === 'fulfilled' ? (reportsData.value as Report[]) : [];

      set({
        agents: loadedAgents,
        tasks: loadedTasks,
        approvals: loadedApprovals,
        kpis: loadedKpis.length > 0 ? loadedKpis : (get().kpis.length > 0 ? get().kpis : DEMO_KPIS),
        reports: loadedReports,
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
      kpis: DEMO_KPIS,
      isLoading: false,
    });
    get().addTickerMessage('8 agen demo berhasil dimuat di seluruh divisi kantor.', 'success');
  },

  createKpi: async (kpiData) => {
    const newKpi = await api.createKpi(kpiData);
    set((state) => ({
      kpis: [newKpi, ...state.kpis],
    }));
    return newKpi;
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
