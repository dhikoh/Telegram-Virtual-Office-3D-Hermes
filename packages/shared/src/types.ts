import { z } from 'zod';
import * as schemas from './schemas.js';
import type { AgentNormalizedStatus } from './constants.js';

export type Agent = z.infer<typeof schemas.AgentSchema>;
export type AgentPublic = z.infer<typeof schemas.AgentPublicSchema>;
export type AgentInput = z.infer<typeof schemas.AgentInputSchema>;
export type Task = z.infer<typeof schemas.TaskSchema>;
export type RunEvent = z.infer<typeof schemas.RunEventSchema>;
export type Approval = z.infer<typeof schemas.ApprovalSchema>;
export type Report = z.infer<typeof schemas.ReportSchema>;
export type Kpi = z.infer<typeof schemas.KpiSchema>;
export type HiringDraft = z.infer<typeof schemas.HiringDraftSchema>;
export type AuditLog = z.infer<typeof schemas.AuditLogSchema>;
export type Setting = z.infer<typeof schemas.SettingSchema>;
export type AntiHallucinationReport = z.infer<typeof schemas.AntiHallucinationReportSchema>;
export type ResolveApprovalRequest = z.infer<typeof schemas.ResolveApprovalRequestSchema>;

export interface OfficeTaskUpdate {
  id: string;
  status: string;
  title?: string;
  agent_id?: string;
  result_md?: string | null;
  updated_at?: number;
  /**
   * Artefak otomatis hasil run — hanya diisi pada status terminal
   * (done/failed), supaya konsumen SSE tahu persis berkas mana yang bisa
   * diunduh lewat `download_url` tanpa menunggu poll berikutnya.
   */
  artifacts?: schemas.TaskArtifact[];
}

export interface OfficeApprovalUpdate {
  id: string;
  run_id: string;
  agent_id: string;
  summary: string;
  status: string;
  created_at: number;
}

export interface NormalizedOfficeEvent {
  type: 'agent_status' | 'task_update' | 'approval_requested' | 'heartbeat';
  agent_id?: string;
  status?: AgentNormalizedStatus;
  current_tool?: string;
  task?: OfficeTaskUpdate;
  approval?: OfficeApprovalUpdate;
  data?: unknown;
  timestamp: number;
}

/** Result of POST /api/agents/:id/connection — auto-detect probe. */
export interface AgentConnectionResult {
  status: 'connected';
  models: string[];
  current_model: string | null;
  key_stored: boolean;
  endpoint_configured: boolean;
  platform?: string;
  message?: string;
}

export interface HermesCapabilities {
  object: string;
  platform: string;
  model: string;
  auth: {
    type: string;
    required: boolean;
  };
  features: {
    chat_completions: boolean;
    responses_api: boolean;
    run_submission: boolean;
    run_status: boolean;
    run_events_sse: boolean;
    run_stop: boolean;
    run_approval: boolean;
    reasoning_streaming?: boolean;
  };
}
