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

export const DEMO_AGENTS: OfficeAgent[] = [
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

export const DEMO_KPIS: Kpi[] = [
  // Finance
  { id: 'kpi-fin-1', department: 'finance', key: 'mrr', label: 'Monthly Recurring Revenue', value: 128500, unit: 'USD', period: '2026-Q3', source: 'manual', source_note: 'Verified from bank statement', created_at: 1728700000000 },
  { id: 'kpi-fin-2', department: 'finance', key: 'server_costs', label: 'Biaya Server VPS', value: 3420, unit: 'USD', period: '2026-Q3', source: 'import', source_note: 'Coolify & cloud metrics', created_at: 1728700000000 },
  { id: 'kpi-fin-3', department: 'finance', key: 'burn_rate', label: 'Burn Rate Proyeksi', value: 18500, unit: 'USD', period: '2026-Q3', source: 'agent', source_note: 'Estimasi agen finance', created_at: 1728700000000 },
  // Sales
  { id: 'kpi-sales-1', department: 'sales', key: 'deals_won', label: 'Deals Won (Q3)', value: 38, unit: 'deals', period: '2026-Q3', source: 'manual', source_note: 'CRM closed won', created_at: 1728700000000 },
  { id: 'kpi-sales-2', department: 'sales', key: 'pipeline_val', label: 'Total Pipeline Value', value: 450000, unit: 'USD', period: '2026-Q3', source: 'import', source_note: 'Stripe & HubSpot sync', created_at: 1728700000000 },
  // Social
  { id: 'kpi-social-1', department: 'social', key: 'engagement', label: 'Engagement Rate', value: 4.85, unit: '%', period: '2026-W41', source: 'import', source_note: 'Telegram Channel analytics', created_at: 1728700000000 },
  { id: 'kpi-social-2', department: 'social', key: 'impressions', label: 'Mingguan Impressions', value: 52400, unit: 'views', period: '2026-W41', source: 'import', source_note: 'X / Telegram views', created_at: 1728700000000 },
  // Command
  { id: 'kpi-cmd-1', department: 'command', key: 'system_uptime', label: 'Office Gateway Uptime', value: 99.98, unit: '%', period: '2026-Q3', source: 'import', source_note: 'Systemd & health monitor', created_at: 1728700000000 },
  { id: 'kpi-cmd-2', department: 'command', key: 'task_completion', label: 'Task Success Rate', value: 96.5, unit: '%', period: '2026-Q3', source: 'manual', source_note: 'Dispatcher ledger audit', created_at: 1728700000000 },
  // Marketing
  { id: 'kpi-mkt-1', department: 'marketing', key: 'cac', label: 'Customer Acquisition Cost', value: 142, unit: 'USD', period: '2026-Q3', source: 'manual', source_note: 'Ad spend ledger', created_at: 1728700000000 },
  { id: 'kpi-mkt-2', department: 'marketing', key: 'conversion_rate', label: 'Landing Conversion Rate', value: 8.6, unit: '%', period: '2026-Q3', source: 'import', source_note: 'Web telemetry', created_at: 1728700000000 },
  // Analytics
  { id: 'kpi-ana-1', department: 'analytics', key: 'query_latency', label: 'P95 Query Latency', value: 38, unit: 'ms', period: '2026-Q3', source: 'import', source_note: 'SQLite performance logs', created_at: 1728700000000 },
  { id: 'kpi-ana-2', department: 'analytics', key: 'data_freshness', label: 'Data Freshness Index', value: 99.9, unit: '%', period: '2026-Q3', source: 'manual', source_note: 'Daily sync check', created_at: 1728700000000 },
  // Support
  { id: 'kpi-sup-1', department: 'support', key: 'csat', label: 'Customer Satisfaction', value: 4.88, unit: '/5.0', period: '2026-Q3', source: 'manual', source_note: 'Owner ticket feedback', created_at: 1728700000000 },
  { id: 'kpi-sup-2', department: 'support', key: 'avg_resolution', label: 'Avg Resolution Time', value: 2.1, unit: 'menit', period: '2026-Q3', source: 'import', source_note: 'Support ticket queue', created_at: 1728700000000 },
  // HR
  { id: 'kpi-hr-1', department: 'hr', key: 'active_headcount', label: 'Jumlah Agen Aktif', value: 8, unit: 'agen', period: '2026-Q3', source: 'manual', source_note: 'Office Registry', created_at: 1728700000000 },
  { id: 'kpi-hr-2', department: 'hr', key: 'agent_morale', label: 'Agent Health Index', value: 94, unit: '%', period: '2026-Q3', source: 'manual', source_note: 'Autonomous health check', created_at: 1728700000000 },
];

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
