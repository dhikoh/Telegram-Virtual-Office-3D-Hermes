/**
 * Office Backend API Client
 * Enforces Rule S1 (Authorization: tma <initData>) on every request.
 */

import { tma } from './tma';
import type { Agent, Task, Approval } from '@hermes-office/shared';

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
  getMe: () => request<{ user: { id: number; username?: string; role: string } }>('/me'),
  getAgents: () => request<Agent[]>('/agents'),
  createAgent: (body: unknown) => request<Agent>('/agents', { method: 'POST', body: JSON.stringify(body) }),
  updateAgent: (id: string, body: unknown) =>
    request<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getTasks: () => request<Task[]>('/tasks'),
  createTask: (body: unknown) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  runTask: (id: string) => request<{ status: string; run_id: string }>(`/tasks/${id}/run`, { method: 'POST' }),
  stopTask: (id: string) => request<{ status: string }>(`/tasks/${id}/stop`, { method: 'POST' }),
  getApprovals: () => request<Approval[]>('/approvals'),
  resolveApproval: (id: string, decision: 'approve' | 'deny') =>
    request<Approval>(`/approvals/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
  getKpis: () => request<unknown[]>('/kpis'),
  getReports: () => request<unknown[]>('/reports'),
  getAudit: () => request<unknown[]>('/audit'),
};
