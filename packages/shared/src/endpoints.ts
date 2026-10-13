/**
 * Office Server Endpoints Directory (Rule C3a & C6)
 * Single Source of Truth for API Routes across Web, Server, and Gap-Check
 */

export interface EndpointDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  phase: number;
  requiresAuth: boolean;
  description: string;
}

export const ENDPOINTS: readonly EndpointDefinition[] = [
  {
    method: 'GET',
    path: '/api/health',
    phase: 2,
    requiresAuth: false,
    description: 'Public health status and gateway availability check',
  },
  {
    method: 'GET',
    path: '/api/me',
    phase: 2,
    requiresAuth: true,
    description: 'Current authenticated Telegram user details and permissions',
  },
  {
    method: 'GET',
    path: '/api/agents',
    phase: 2,
    requiresAuth: true,
    description: 'List all active and configured agents in the registry',
  },
  {
    method: 'POST',
    path: '/api/agents',
    phase: 2,
    requiresAuth: true,
    description: 'Register a new agent in the office directory',
  },
  {
    method: 'PATCH',
    path: '/api/agents/:id',
    phase: 2,
    requiresAuth: true,
    description: 'Update agent profile metadata, role, or active status',
  },
  {
    method: 'POST',
    path: '/api/agents/:id/connection',
    phase: 7,
    requiresAuth: true,
    description: 'Probe a gateway endpoint with a stored key and auto-detect the models it serves',
  },
  {
    method: 'GET',
    path: '/api/agents/:id/health',
    phase: 2,
    requiresAuth: true,
    description: 'Query Hermes gateway capabilities for a specific agent',
  },
  {
    method: 'POST',
    path: '/api/agents/:id/chat',
    phase: 2,
    requiresAuth: true,
    description: 'Stream chat turn directly to agent with SSE output',
  },
  {
    method: 'GET',
    path: '/api/agents/:id/chat',
    phase: 8,
    requiresAuth: true,
    description: "Load the agent's persisted chat history from its gateway session",
  },
  {
    method: 'DELETE',
    path: '/api/agents/:id',
    phase: 8,
    requiresAuth: true,
    description: 'Remove an agent from the roster together with its stored key and tasks',
  },
  {
    method: 'POST',
    path: '/api/agents/:id/session',
    phase: 9,
    requiresAuth: true,
    description: 'Archive the current gateway session and start a fresh one ("Sesi baru")',
  },
  {
    method: 'GET',
    path: '/api/agents/:id/sessions',
    phase: 9,
    requiresAuth: true,
    description: "List the agent's gateway sessions (current + archived) from agent_sessions",
  },
  {
    method: 'GET',
    path: '/api/tasks',
    phase: 2,
    requiresAuth: true,
    description: 'Retrieve office tasks filtered by department, agent, or status',
  },
  {
    method: 'POST',
    path: '/api/tasks',
    phase: 2,
    requiresAuth: true,
    description: 'Create a new task in the backlog or queue',
  },
  {
    method: 'PATCH',
    path: '/api/tasks/:id',
    phase: 2,
    requiresAuth: true,
    description: 'Update task properties, status, priority, or assigned agent',
  },
  {
    method: 'POST',
    path: '/api/tasks/:id/run',
    phase: 2,
    requiresAuth: true,
    description: 'Dispatch task to Hermes agent run and start event stream',
  },
  {
    method: 'POST',
    path: '/api/tasks/:id/stop',
    phase: 2,
    requiresAuth: true,
    description: 'Interrupt and cancel an active task run',
  },
  {
    method: 'GET',
    path: '/api/approvals',
    phase: 2,
    requiresAuth: true,
    description: 'List pending or historical human-in-the-loop approvals',
  },
  {
    method: 'POST',
    path: '/api/approvals/:id/resolve',
    phase: 2,
    requiresAuth: true,
    description: 'Resolve pending approval with decision (approve or deny)',
  },
  {
    method: 'GET',
    path: '/api/stream',
    phase: 2,
    requiresAuth: true,
    description: 'Office real-time SSE stream of agent states and heartbeats',
  },
  {
    method: 'GET',
    path: '/api/kpis',
    phase: 2,
    requiresAuth: true,
    description: 'Fetch departmental KPI metrics and trend data',
  },
  {
    method: 'POST',
    path: '/api/kpis',
    phase: 2,
    requiresAuth: true,
    description: 'Record a manual KPI data entry',
  },
  {
    method: 'GET',
    path: '/api/reports',
    phase: 2,
    requiresAuth: true,
    description: 'List generated performance reports',
  },
  {
    method: 'POST',
    path: '/api/reports/generate',
    phase: 2,
    requiresAuth: true,
    description: 'Trigger anti-hallucination report generation for an agent',
  },
  {
    method: 'POST',
    path: '/api/hiring/draft',
    phase: 2,
    requiresAuth: true,
    description: 'Save new recruitment wizard specification and draft SOUL.md',
  },
  {
    method: 'POST',
    path: '/api/hiring/:id/mark-hired',
    phase: 2,
    requiresAuth: true,
    description: 'Mark recruitment draft as hired and enroll into registry',
  },
  {
    method: 'GET',
    path: '/api/audit',
    phase: 2,
    requiresAuth: true,
    description: 'Retrieve immutable security audit trail logs',
  },
  {
    method: 'GET',
    path: '/api/skills',
    phase: 8,
    requiresAuth: true,
    description: 'List skills installed on the gateway, or report honestly why they cannot be listed',
  },
] as const;
