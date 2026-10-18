/**
 * Office Backend API Client
 * Enforces Rule S1 (Authorization: tma <initData>) on every request.
 */

import { tma } from './tma';
import type {
  AgentPublic,
  Task,
  Approval,
  Kpi,
  Report,
  HiringDraft,
  AuditLog,
  OfficeDepartment,
  Project,
  ProjectTask,
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const initData = tma.getInitData();
  const headers = new Headers(options.headers || {});

  // Attach Telegram initData authorization header (Rule S1)
  if (initData) {
    headers.set('Authorization', `tma ${initData}`);
  }

  // Only set application/json if there is a body
  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
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
  getTasks: () => request<Task[]>('/tasks'),
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
  setAgentModel: (id: string, model: string) =>
    request<AgentPublic>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ model }) }),
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
      messages: { role: 'user' | 'assistant'; content: string; timestamp: number }[];
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
    onError: (err: Error) => void
  ): Promise<void> => {
    try {
      const initData = tma.getInitData();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (initData) {
        headers['Authorization'] = `tma ${initData}`;
      }

      const response = await fetch(`${API_BASE}/agents/${id}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages }),
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
};
