/**
 * Virtual Office Global State (Zustand)
 * Manages agents, real-time SSE stream from /api/stream,
 * event ticker, approvals, and demo office loader (Rule REQ-074).
 */

import { create } from 'zustand';
import type {
  AgentPublic,
  Task,
  Approval,
  Kpi,
  Report,
  AgentNormalizedStatus,
  OfficeDepartment,
  SpeechEntry,
} from '@hermes-office/shared';
import { toSpeechEntry } from '@hermes-office/shared';
import { api } from '../services/api';
import { tma } from '../services/tma';

export interface OfficeAgent extends AgentPublic {
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
  /** Tahap 10 — ruang kantor sebagai data (chip order, nama, warna, sembunyi). */
  departments: OfficeDepartment[];
  /**
   * Tahap 17 — the last thing each agent said, keyed by agent id. The office
   * floor shows it as a bubble (both 2D and 3D read this one map, so the two
   * views can never disagree). Entries expire on their own through
   * `speechLine`/`isSpeechFresh` — nothing has to sweep them.
   */
  speech: Record<string, SpeechEntry>;
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
  /** Tahap 8 — edit atribut agen (PATCH server, lalu sinkron ke state). */
  patchAgent: (id: string, body: Record<string, unknown>) => Promise<AgentPublic | null>;
  /** Tahap 8 — hapus agen dari server lalu muat ulang roster & tugas. */
  deleteAgent: (id: string) => Promise<void>;
  /** Tahap 10 — muat ulang daftar ruang (dipanggil setelah kelola ruang). */
  reloadDepartments: () => Promise<void>;
  /**
   * Tahap 17 — catat kalimat terakhir seorang agen untuk bubble di kantor.
   * Dipanggil dari chat sheet saat balasan gateway selesai; teks dinormalkan
   * di sini supaya tidak ada komponen yang menyimpan versi sendiri.
   */
  recordSpeech: (agentId: string, text: string) => void;
}

export { DEMO_AGENTS, DEMO_KPIS } from './demo-data.js';
import { DEMO_AGENTS, DEMO_KPIS } from './demo-data.js';

export const useOfficeStore = create<OfficeState>((set, get) => ({
  agents: [],
  tasks: [],
  approvals: [],
  kpis: [],
  reports: [],
  departments: [],
  speech: {},
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
      const [agentsData, tasksData, approvalsData, kpisData, reportsData, departmentsData] =
        await Promise.allSettled([
          api.getAgents(),
          api.getTasks(),
          api.getApprovals(),
          api.getKpis(),
          api.getReports(),
          api.getDepartments(),
        ]);

      const loadedAgents: OfficeAgent[] =
        agentsData.status === 'fulfilled'
          ? agentsData.value.map((a) => ({ ...a, status: 'idle' as AgentNormalizedStatus }))
          : [];

      const loadedTasks = tasksData.status === 'fulfilled' ? tasksData.value : [];
      const loadedApprovals = approvalsData.status === 'fulfilled' ? approvalsData.value : [];
      const loadedKpis = kpisData.status === 'fulfilled' ? (kpisData.value as Kpi[]) : [];
      const loadedReports = reportsData.status === 'fulfilled' ? (reportsData.value as Report[]) : [];
      // Tahap 10 — ruang data-driven; kosong = fallback statis di komponen.
      const loadedDepartments: OfficeDepartment[] =
        departmentsData.status === 'fulfilled' ? departmentsData.value : [];

      set({
        agents: loadedAgents,
        tasks: loadedTasks,
        approvals: loadedApprovals,
        // Tahap 7: never fall back to demo numbers — an empty office shows
        // "no data yet", not fabricated KPIs (Rule C7 honesty).
        kpis: loadedKpis,
        reports: loadedReports,
        departments: loadedDepartments,
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

      // A reconnect is invisible to addEventListener users, so surface it.
      eventSource.onmessage = () => {
        if (get().streamStatus !== 'connected') set({ streamStatus: 'connected' });
      };

      eventSource.addEventListener('agent_status', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { agent_id, status, current_tool } = payload;
          get().setAgentStatus(agent_id, status, current_tool);
        } catch {
          // Ignore json parse error
        }
      });

      // Tahap 7: server now emits named events, so these listeners actually fire.
      // The approval payload is `{ approval: {...} }` — the old code read
      // `payload.summary`, which never existed.
      eventSource.addEventListener('approval_requested', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const approval = payload.approval;
          if (!approval) return;
          tma.hapticNotification('warning');
          get().addTickerMessage(
            `Persetujuan diperlukan: ${approval.summary || 'Aksi berisiko memerlukan konfirmasi'}`,
            'approval',
          );
          set((state) => ({
            approvals: [approval, ...state.approvals.filter((a) => a.id !== approval.id)],
          }));
        } catch {
          // Ignore
        }
      });

      eventSource.addEventListener('task_update', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const task = payload.task;
          if (!task) return;
          get().addTickerMessage(
            `Tugas "${task.title || task.id}": ${task.status}`,
            task.status === 'failed' ? 'error' : 'info',
          );
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
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
    // Explicitly labelled demo — every agent carries isDemo so the UI can badge it
    set({
      agents: DEMO_AGENTS.map((a) => ({ ...a, isDemo: true })),
      kpis: DEMO_KPIS,
      isLoading: false,
    });
    get().addTickerMessage('Kantor DEMO dimuat — semua agen di sini bersifat simulasi.', 'error');
  },

  createKpi: async (kpiData) => {
    const newKpi = await api.createKpi(kpiData);
    set((state) => ({
      kpis: [newKpi, ...state.kpis],
    }));
    return newKpi;
  },

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  patchAgent: async (id, body) => {
    const updated = await api.updateAgent(id, body);
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, ...updated, status: agent.status } : agent
      ),
    }));
    get().addTickerMessage(`${updated.name} diperbarui oleh pemilik.`, 'success');
    return updated;
  },

  deleteAgent: async (id) => {
    const target = get().agents.find((a) => a.id === id);
    const res = await api.deleteAgent(id);
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      tasks: state.tasks.filter((t) => t.agent_id !== id),
      selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId,
    }));
    get().addTickerMessage(
      `${target?.name || id} dihapus dari roster (${res.tasks_removed} tugas ikut dihapus).`,
      'error'
    );
  },

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

  reloadDepartments: async () => {
    try {
      const departments = await api.getDepartments();
      set({ departments });
    } catch {
      // Daftar lama tetap dipakai; kegagalan muat tidak menghancurkan UI.
    }
  },

  recordSpeech: (agentId, text) => {
    const entry = toSpeechEntry(text, Date.now());
    // Nothing to say (empty or syntax-only reply) leaves the previous line
    // alone rather than blanking the bubble.
    if (!entry) return;
    set((state) => ({ speech: { ...state.speech, [agentId]: entry } }));
  },
}));
