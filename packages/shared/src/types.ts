import { z } from 'zod';
import * as schemas from './schemas.js';
import type { AgentNormalizedStatus } from './constants.js';

export type Agent = z.infer<typeof schemas.AgentSchema>;
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

export interface NormalizedOfficeEvent {
  type: 'agent_status' | 'task_update' | 'approval_request' | 'heartbeat';
  agent_id?: string;
  status?: AgentNormalizedStatus;
  current_tool?: string;
  data?: unknown;
  timestamp: number;
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
