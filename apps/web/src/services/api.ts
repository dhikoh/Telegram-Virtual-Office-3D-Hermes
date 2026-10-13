/**
 * Office Backend API Client
 * Enforces Rule S1 (Authorization: tma <initData>) on every request.
 */

import { tma } from './tma';
import type { AgentPublic, Task, Approval, Kpi, Report, HiringDraft, AuditLog } from '@hermes-office/shared';

const API_BASE = '/api';

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
  /** Tahap 8 — riwayat chat tersimpan di sesi gateway, bukan di memori browser. */
  getChatHistory: (id: string) =>
    request<{
      session_id: string | null;
      messages: { role: 'user' | 'assistant'; content: string; timestamp: number }[];
    }>(`/agents/${id}/chat`),
  /** Tahap 8 — skill yang benar-benar terpasang di gateway. */
  getSkills: () =>
    request<{
      available: boolean;
      gateway: string;
      skills: { name: string; description: string; enabled?: boolean; source: string }[];
      capabilities: unknown;
      error: string | null;
    }>('/skills'),
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
              const deltaContent = parsed.choices?.[0]?.delta?.content || '';
              if (deltaContent) {
                onChunk(deltaContent);
              }
            } catch {
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
};
