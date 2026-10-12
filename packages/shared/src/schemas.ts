import { z } from 'zod';
import {
  DEPARTMENTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  APPROVAL_STATUSES,
  AGENT_NORMALIZED_STATUSES,
  KPI_SOURCES,
  REPORT_TEMPLATES,
  HIRING_STATUSES,
} from './constants.js';

export const DepartmentSchema = z.enum(DEPARTMENTS);
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES);
export const AgentNormalizedStatusSchema = z.enum(AGENT_NORMALIZED_STATUSES);
export const KpiSourceSchema = z.enum(KPI_SOURCES);
export const ReportTemplateSchema = z.enum(REPORT_TEMPLATES);
export const HiringStatusSchema = z.enum(HIRING_STATUSES);

export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  department: DepartmentSchema,
  avatar: z.string().default('🤖'),
  soul_summary: z.string().default(''),
  hermes_base_url: z.string().url(),
  api_key_env: z.string().min(1),
  hermes_profile: z.string().default('default'),
  active: z.number().int().min(0).max(1).default(1),
  hired_at: z.number().int(),
  created_at: z.number().int(),
});

/**
 * Public agent schema for API responses and client code.
 * F-08: hermes_base_url and api_key_env are stripped; endpoint_configured replaces them.
 */
export const AgentPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  department: DepartmentSchema,
  avatar: z.string(),
  soul_summary: z.string(),
  hermes_profile: z.string(),
  active: z.number(),
  hired_at: z.number(),
  created_at: z.number(),
  endpoint_configured: z.boolean(),
  isDemo: z.boolean().optional(),
});

/**
 * Input schema for agent create/patch requests.
 * hermes_base_url and api_key_env accepted only in request bodies.
 */
export const AgentInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  department: DepartmentSchema,
  avatar: z.string().default('🤖'),
  soul_summary: z.string().default(''),
  hermes_base_url: z.string().url().optional(),
  api_key_env: z.string().optional(),
  hermes_profile: z.string().default('default'),
  active: z.number().int().min(0).max(1).default(1),
  hired_at: z.number().int(),
  created_at: z.number().int(),
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(1000),
  description: z.string().default(''),
  agent_id: z.string().min(1),
  priority: TaskPrioritySchema.default('normal'),
  status: TaskStatusSchema.default('backlog'),
  run_id: z.string().nullable().default(null),
  result_md: z.string().nullable().default(null),
  due_at: z.number().int().nullable().default(null),
  created_by: z.number().int(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

export const RunEventSchema = z.object({
  id: z.number().int().optional(),
  run_id: z.string().min(1),
  agent_id: z.string().min(1),
  type: z.string().min(1),
  payload_json: z.string(),
  ts: z.number().int(),
});

export const ApprovalSchema = z.object({
  id: z.string().min(1),
  run_id: z.string().min(1),
  agent_id: z.string().min(1),
  summary: z.string().min(1),
  payload_json: z.string(),
  status: ApprovalStatusSchema.default('pending'),
  decided_by: z.number().int().nullable().default(null),
  decided_at: z.number().int().nullable().default(null),
  created_at: z.number().int(),
});

export const ReportSchema = z.object({
  id: z.string().min(1),
  agent_id: z.string().min(1),
  department: DepartmentSchema,
  template: ReportTemplateSchema,
  period: z.string().min(1),
  body_md: z.string(),
  metrics_json: z.string().default('{}'),
  created_at: z.number().int(),
});

export const KpiSchema = z.object({
  id: z.string().min(1),
  department: DepartmentSchema,
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  unit: z.string().default(''),
  period: z.string().min(1),
  source: KpiSourceSchema.default('manual'),
  source_note: z.string().default(''),
  created_at: z.number().int(),
});

export const HiringDraftSchema = z.object({
  id: z.string().min(1),
  form_json: z.string(),
  soul_md: z.string(),
  commands_md: z.string(),
  status: HiringStatusSchema.default('draft'),
  created_at: z.number().int(),
});

export const AuditLogSchema = z.object({
  id: z.number().int().optional(),
  telegram_user_id: z.number().int(),
  action: z.string().min(1),
  target: z.string().min(1),
  detail_json: z.string().default('{}'),
  ts: z.number().int(),
});

export const SettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

/**
 * Strict Anti-Hallucination Report Parser (Section 8 - Reports)
 */
export const AntiHallucinationReportSchema = z.object({
  summary_md: z.string().min(10),
  insights: z.array(z.string()).min(1),
  risks: z.array(z.string()).min(1),
  actions: z.array(z.string()).min(1),
});

export const ResolveApprovalRequestSchema = z.object({
  decision: z.enum(['approve', 'deny']),
});
