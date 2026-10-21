/**
 * Office Backend API Client
 * Enforces Rule S1 (Authorization: tma <initData>) on every request.
 */

import { tma } from './tma';
import type {
  AgentPublic,
  AgentModelPriority,
  Task,
  TaskEventsResponse,
  CronJob,
  Approval,
  Kpi,
  Report,
  HiringDraft,
  AuditLog,
  OfficeDepartment,
  Project,
  ProjectTask,
  SkillSyncStatus,
  SkillSyncResult,
} from '@hermes-office/shared';

const API_BASE = '/api';

/** Tahap 11 (bagian 2) — isi GET/PATCH /api/agents/:id/skills. */
export interface AgentSkillScope {
  agent_id: string;
  is_system: boolean;
  catalog: { name: string; description: string }[];
  skills: string[];
  disabled: string[];
  mode: 'default' | 'restricted';
  available: boolean;
  error: string | null;
}

/** Tahap 12 — balasan unggah gambar chat (termasuk galat gateway bila ada). */
export interface ChatMediaUploadResult {
  id: string;
  agent_id: string;
  kind: string;
  mime: string;
  size: number;
  original_name: string | null;
  created_at: number;
  /** Galat gateway apa adanya — gambar tersimpan, tapi pengiriman ke model gagal. */
  gateway_error?: string;
}

/**
 * Tahap 20 — isi GET /api/agents/:id/models (read-only).
 * `current_model` = model yang aktif tersimpan; `endpoint_source` menandai
 * apakah agen memakai pengaturan server ('server') atau endpoint miliknya ('agent').
 */
export interface AgentModelList {
  models: string[];
  current_model: string | null;
  endpoint_source: 'server' | 'agent';
  base_url_used: string;
  status_code?: number | null;
  latency_ms?: number | null;
}

interface ApiRequestInit extends RequestInit {
  /**
   * Tahap 20 — lempar Error berisi `message` dari badan galat (pesan Indonesia
   * yang sudah dirancang untuk dibaca orang), bukan blob JSON mentah.
   * Dipakai rute /models dan PATCH endpoint; panggilan lain sengaja dibiarkan
   * memakai format `API error ...` yang lama agar tidak mengubah perilaku yang
   * sudah dikunci test lain.
   */
  friendlyError?: boolean;
}

async function request<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const { friendlyError, ...init } = options;
  const initData = tma.getInitData();
  const headers = new Headers(init.headers || {});

  // Attach Telegram initData authorization header (Rule S1)
  if (initData) {
    headers.set('Authorization', `tma ${initData}`);
  }

  // Only set application/json if there is a body
  if (init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (friendlyError) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || `Gagal memproses permintaan (${response.status})`);
    }
    const errorText = await response.text();
    throw new Error(`API error ${response.status} (${path}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getHealth: () => request<{ status: string; uptime: number; timestamp: string }>('/health'),
  getMe: () =>
    request<{ user: { id: number; username?: string; role: string }; role: string; permissions: string[] }>(
      '/me'
    ),
  getAgents: () => request<AgentPublic[]>('/agents'),
  createAgent: (body: unknown) => request<AgentPublic>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  updateAgent: (id: string, body: unknown) =>
    request<AgentPublic>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getTasks: (params?: { source?: string; agent_id?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.source && params.source !== 'all') searchParams.set('source', params.source);
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
    if (params?.status) searchParams.set('status', params.status);
    const query = searchParams.toString();
    return request<Task[]>(`/tasks${query ? `?${query}` : ''}`);
  },
  getTaskEvents: (id: string) => request<TaskEventsResponse>(`/tasks/${id}/events`),
  getCronJobs: () => request<CronJob[]>('/cron'),
  createTask: (body: unknown) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  runTask: (id: string) => request<{ status: string; run_id: string }>(`/tasks/${id}/run`, { method: 'POST' }),
  stopTask: (id: string) => request<{ status: string }>(`/tasks/${id}/stop`, { method: 'POST' }),
  getAgentHealth: (id: string) =>
    request<{ status: string; capabilities?: unknown; model?: string | null }>(`/agents/${id}/health`),
  /**
   * Tahap 7 — auto-detect: probe the gateway with a base URL + API key and get
   * back the models it serves. The key is stored server-side and never returned.
   */
  probeConnection: (id: string, body: { base_url?: string; api_key?: string }) =>
    request<{
      status: string;
      models: string[];
      current_model: string | null;
      key_stored: boolean;
      endpoint_configured: boolean;
      latency_ms?: number | null;
    }>(`/agents/${id}/connection`, { method: 'POST', body: JSON.stringify(body) }),
  getAgentModelPriority: (id: string) =>
    request<AgentModelPriority>(`/agents/${encodeURIComponent(id)}/model-priority`, { friendlyError: true }),
  saveAgentModelPriority: (id: string, models: string[]) =>
    request<AgentModelPriority>(`/agents/${encodeURIComponent(id)}/model-priority`, {
      method: 'PATCH', body: JSON.stringify({ models }), friendlyError: true,
    }),
  setAgentModel: (id: string, model: string) =>
    request<AgentPublic>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ model }) }),
  /**
   * Tahap 20 — daftar model yang dilayani endpoint agen (read-only).
   *
   * `baseUrl` opsional: dipakai panel untuk mengetes endpoint "Custom" yang masih
   * berupa draft sebelum disimpan. Server tidak pernah menulis draft itu ke DB.
   * Daftar sudah terurut A-Z dan bebas duplikat dari sisi server.
   */
  listAgentModels: (id: string, baseUrl?: string) => {
    const query = baseUrl && baseUrl.trim() ? `?base_url=${encodeURIComponent(baseUrl.trim())}` : '';
    return request<AgentModelList>(`/agents/${id}/models${query}`, { friendlyError: true });
  },
  /**
   * Tahap 20 (ST-4) — simpan endpoint kustom milik agen. Nilai kosong berarti
   * "ikuti pengaturan server". Server menormalisasi URL dan menolak loopback (S5).
   */
  saveAgentEndpoint: (id: string, baseUrl: string) =>
    request<AgentPublic>(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ hermes_base_url: baseUrl.trim() }),
      friendlyError: true,
    }),
  /**
   * Tahap 20 (ST-4) — kembalikan agen ke endpoint bawaan server.
   *
   * Field-nya harus dikirim EKSPLISIT: server memperlakukan '' sebagai
   * "ikuti pengaturan server", sedangkan field yang tidak ikut dikirim berarti
   * "jangan ubah apa pun" — itu sebabnya selama ini tombol kembalikan ke bawaan
   * tidak pernah menyentuh apa pun.
   */
  resetAgentEndpoint: (id: string) =>
    request<AgentPublic>(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ hermes_base_url: '' }),
      friendlyError: true,
    }),
  /** Tahap 8 — hapus agen dari roster beserta tugasnya. */
  deleteAgent: (id: string) =>
    request<{ success: boolean; id: string; tasks_removed: number }>(`/agents/${id}`, {
      method: 'DELETE',
    }),
  /** Tahap 8 — riwayat chat tersimpan di sesi gateway, bukan di memori browser.
   * Tahap 9 — ?session=<sid> membaca sesi arsip (opsional). */
  getChatHistory: (id: string, sessionId?: string) =>
    request<{
      session_id: string | null;
      is_archived?: boolean;
      can_continue?: boolean;
      incomplete_message_id?: string | null;
      messages: {
        id?: string;
        role: 'user' | 'assistant';
        content: string;
        status?: 'partial' | 'completed' | 'failed';
        timestamp: number;
      }[];
    }>(`/agents/${id}/chat${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''}`),
  /** Tahap 9 — akhiri sesi sekarang, mulai sesi baru; riwayat lama diarsipkan. */
  resetAgentSession: (id: string) =>
    request<{ session_id: string | null }>(`/agents/${id}/session`, { method: 'POST' }),
  /** Tahap 9 — daftar sesi (arsip) milik agen. */
  getAgentSessions: (id: string) =>
    request<{
      sessions: {
        session_id: string;
        created_at: number;
        archived_at: number | null;
        is_current: boolean;
      }[];
    }>(`/agents/${id}/sessions`),
  /** Tahap 10 — daftar ruang/kantor (chip order, data-driven). */
  getDepartments: () => request<OfficeDepartment[]>('/departments'),
  /** Tahap 10 — buat ruang custom (nama + warna; id dibuat server). */
  createDepartment: (body: { name: string; color: string }) =>
    request<OfficeDepartment>('/departments', { method: 'POST', body: JSON.stringify(body) }),
  /** Tahap 10 — ubah nama/warna/urutan/sembunyi ruang. */
  updateDepartment: (id: string, body: Record<string, unknown>) =>
    request<OfficeDepartment>(`/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  /** Tahap 10 — hapus ruang custom (403 untuk ruang bawaan, 409 bila masih berpenghuni). */
  deleteDepartment: (id: string) =>
    request<{ ok: boolean; id: string }>(`/departments/${id}`, { method: 'DELETE' }),

  /** Tahap 14 — proyek: buat (dekomposisi berjalan di belakang layar). */
  createProject: (body: { title: string; goal?: string }) =>
    request<{ project: Project }>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  /** Tahap 14 — daftar proyek + hitungan subtask (done/total). */
  listProjects: () =>
    request<{ projects: (Project & { subtask_total: number; subtask_done: number })[] }>(
      '/projects'
    ),
  /** Tahap 14 — satu proyek + subtask untuk peta DAG. */
  getProject: (id: string) =>
    request<{ project: Project; tasks: ProjectTask[] }>(`/projects/${id}`),
  /** Tahap 14 — jalankan rantai proyek (409 bila tidak ada subtask siap). */
  runProject: (id: string) =>
    request<{ project: Project; started: number }>(`/projects/${id}/run`, { method: 'POST' }),
  /** Tahap 8 — skill yang benar-benar terpasang di gateway. */
  getSkills: () =>
    request<{
      available: boolean;
      gateway: string;
      skills: { name: string; description: string; enabled?: boolean; source: string }[];
      capabilities: unknown;
      error: string | null;
    }>('/skills'),
  /**
   * Tahap 11 — instal/hapus skill lewat orkestrator: server membuat tugas
   * untuk agent_orchestrator dan menjalankannya; hasilnya di layar Tugas.
   */
  installSkill: (name: string) =>
    request<{ task: Task; status: string; run_id: string | null }>('/skills/install', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  uninstallSkill: (name: string) =>
    request<{ task: Task; status: string; run_id: string | null }>('/skills/uninstall', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  /**
   * Tahap 11 (bagian 2) — cakupan skill satu agen (layer SOUL).
   * `skills` = daftar skill AKTIF untuk agen itu (katalog gateway dikurangi
   * yang dimatikan). `mode: 'default'` = tanpa pembatasan = seluruh katalog.
   */
  getAgentSkills: (agentId: string) =>
    request<AgentSkillScope>(`/agents/${encodeURIComponent(agentId)}/skills`),
  /** Simpan daftar LENGKAP skill aktif untuk satu agen (PATCH). */
  updateAgentSkills: (agentId: string, skills: string[]) =>
    request<AgentSkillScope>(`/agents/${encodeURIComponent(agentId)}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skills }),
    }),
  streamChat: async (
    id: string,
    messages: { role: string; content: string }[],
    onChunk: (delta: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    onRunId?: (runId: string) => void,
    /** Fase 2b — run yang sudah berjalan; dikirim sebagai x-run-id agar klien
     * yang kembali menyambung ke pekerjaan yang sama, bukan mengulang. */
    currentRunId?: string | null,
    /** Fase 2d — id unik pesan klien untuk idempotensi (mencegah double-send) */
    clientMessageId?: string | null,
    /** Fase 2d — pembaruan status antara (mis. agen sedang menjalankan tool) */
    onStatus?: (status: string, message?: string) => void
  ): Promise<void> => {
    try {
      const initData = tma.getInitData();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (initData) {
        headers['Authorization'] = `tma ${initData}`;
      }
      if (currentRunId) {
        // Fase 2b — server memakai ini untuk menyambung ke run yang masih hidup
        // alih-alih membuka giliran baru.
        headers['X-Run-Id'] = currentRunId;
      }
      const cmId =
        clientMessageId ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `cm_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      headers['X-Client-Message-Id'] = cmId;

      const response = await fetch(`${API_BASE}/agents/${id}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, client_message_id: cmId }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported by browser');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.substring(6).trim();
            if (dataStr === '[DONE]') {
              onDone();
              return;
            }
            try {
              const parsed = JSON.parse(dataStr);
              // Tahap 19 — server kirim frame `error` saat stream gagal
              // (timeout TTFB/total, atau gateway menyebut alasannya). Tanpa
              // cabang ini frame itu jatuh ke `choices[0].delta.content` yang
              // kosong: bubble chat tetap kosong dan tidak ada tanda apa pun
              // bahwa giliran gagal.
              if (typeof parsed.error === 'string') {
                throw new Error(parsed.message || parsed.error);
              }
              if (parsed.status && typeof parsed.status === 'string') {
                onStatus?.(parsed.status, parsed.message);
              }
              if (parsed.run_id && typeof parsed.run_id === 'string') {
                // Fase 2b — run_id diberitahu di bingkai pertama; klien
                // menyimpannya untuk sambung-ulang.
                onRunId?.(parsed.run_id);
              }
              const deltaContent = parsed.choices?.[0]?.delta?.content || '';
              if (deltaContent) {
                onChunk(deltaContent);
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && !(parseErr instanceof SyntaxError)) {
                // Galat nyata dari server — jangan dipotong jadi teks.
                throw parseErr;
              }
              // Raw non-json string data
              onChunk(dataStr);
            }
          }
        }
      }

      onDone();
    } catch (err: unknown) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  },
  getApprovals: () => request<Approval[]>('/approvals'),
  resolveApproval: (id: string, decision: 'approve' | 'deny') =>
    request<Approval>(`/approvals/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
  getKpis: (department?: string) =>
    request<Kpi[]>(department ? `/kpis?department=${department}` : '/kpis'),
  createKpi: (body: unknown) =>
    request<Kpi>('/kpis', { method: 'POST', body: JSON.stringify(body) }),
  getReports: (department?: string) =>
    request<Report[]>(department ? `/reports?department=${department}` : '/reports'),
  generateReport: (body: { agent_id: string; template: string; period: string }) =>
    request<Report>('/reports/generate', { method: 'POST', body: JSON.stringify(body) }),
  createHiringDraft: (body: unknown) =>
    request<HiringDraft>('/hiring/draft', { method: 'POST', body: JSON.stringify(body) }),
  markHired: (id: string, agent?: unknown) =>
    request<{ success: boolean; agent?: AgentPublic }>(`/hiring/${id}/mark-hired`, {
      method: 'POST',
      body: JSON.stringify({ agent }),
    }),
  getAudit: () => request<AuditLog[]>('/audit'),
  /**
   * Tahap 12 — unggah gambar chat (multipart). Sengaja BUKAN lewat helper
   * request(): FormData tidak boleh dikasih Content-Type application/json,
   * browser yang harus mengisi boundary multipart-nya sendiri.
   */
  uploadChatImage: async (agentId: string, file: File): Promise<ChatMediaUploadResult> => {
    const initData = tma.getInitData();
    const headers: Record<string, string> = {};
    if (initData) {
      headers['Authorization'] = `tma ${initData}`;
    }
    const form = new FormData();
    form.append('file', file, file.name || 'lampiran.png');

    const response = await fetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/media`, {
      method: 'POST',
      headers,
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Unggah gambar ditolak (${response.status}): ${errorText}`);
    }
    return (await response.json()) as ChatMediaUploadResult;
  },
  /** Tahap 12 — daftar media agen (upload + artefak, tanpa path fisik). */
  getMediaList: (agentId: string) =>
    request<{
      media: {
        id: string;
        agent_id: string;
        kind: 'upload' | 'artifact';
        mime: string;
        size: number;
        original_name: string | null;
        task_id: string | null;
        created_at: number;
      }[];
    }>(`/media?agent_id=${encodeURIComponent(agentId)}`),
  /** Tahap 12 — URL unduh artefak (otentikasi lewat query ?auth=, hook server mendukungnya). */
  artifactDownloadUrl: (id: string) => {
    const initData = tma.getInitData();
    return `${API_BASE}/artifacts/${encodeURIComponent(id)}/download${
      initData ? `?auth=${encodeURIComponent(initData)}` : ''
    }`;
  },
  /** Fase 6 — periksa status sinkronisasi katalog skill repo vs gateway */
  getSkillSyncStatus: () => request<SkillSyncStatus>('/skills/sync/status'),
  /** Fase 6 — auto-install / sinkronisasi skill repo yang belum terpasang */
  syncSkills: (force = false) =>
    request<SkillSyncResult>('/skills/sync', {
      method: 'POST',
      body: JSON.stringify({ force }),
    }),
};
