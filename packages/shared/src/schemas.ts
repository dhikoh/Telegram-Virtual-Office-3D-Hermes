import { z } from 'zod';
import {
  DEPARTMENTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  PROJECT_STATUSES,
  APPROVAL_STATUSES,
  AGENT_NORMALIZED_STATUSES,
  KPI_SOURCES,
  REPORT_TEMPLATES,
  HIRING_STATUSES,
} from './constants.js';

// Tahap 10: rooms are data now (table `departments`, routes /api/departments).
// Any non-empty id is accepted here; write routes additionally resolve the id
// against the departments table so unknown rooms are rejected server-side.
export const DepartmentSchema = z.string().min(1);

/**
 * Tahap 10 — an office room row (server-owned). `name` null means "use the
 * i18n label" (office.rooms.<id>); `hidden` chips disappear from the office
 * UI while agents may still live there.
 */
export const OfficeDepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().default(null),
  color: z.string().default('#94A3B8'),
  sort_order: z.number().int(),
  is_system: z.boolean().default(false),
  hidden: z.boolean().default(false),
  created_at: z.number().int(),
});
export type OfficeDepartment = z.infer<typeof OfficeDepartmentSchema>;
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
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
  hermes_base_url: z.string(),
  api_key_env: z.string().min(1),
  hermes_profile: z.string().default('default'),
  // Tahap 7: optional so existing call sites and pre-migration rows still parse
  model: z.string().nullable().optional(),
  // Tahap 8 — the agent's chat session on the Hermes gateway (history lives there).
  session_id: z.string().nullable().optional(),
  // Tahap 9 — system orchestrator flag + custom avatar style (JSON string).
  // Optional (not defaulted) so legacy Agent literals and pre-migration rows
  // still parse; every reader coerces (Boolean(...)) and the repo stores 0.
  is_system: z.number().int().min(0).max(1).optional(),
  avatar_style: z.string().nullable().optional(),
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
  model: z.string().nullable().optional(),
  active: z.number(),
  hired_at: z.number(),
  created_at: z.number(),
  // Tahap 9 — system agents (orchestrator) can never be deleted or disabled.
  is_system: z.boolean().optional(),
  /** Tahap 9 — parsed avatar style: { shirt?: '#RRGGBB', accessory?: ... } */
  avatar_style: z
    .object({
      shirt: z.string().optional(),
      accessory: z.string().optional(),
    })
    .nullable()
    .optional(),
  endpoint_configured: z.boolean(),
  endpoint_source: z.enum(['agent', 'server']).optional(),
  key_source: z.enum(['server', 'env']).optional(),
  /** Rule S4: only whether a key exists may be revealed, never the value. */
  key_stored: z.boolean().optional(),
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
  hermes_base_url: z.string().optional(),
  api_key_env: z.string().optional(),
  hermes_profile: z.string().default('default'),
  model: z.string().nullable().optional(),
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

/**
 * Tahap 14 — proyek pemilik yang dipecah orkestrator menjadi subtask DAG.
 * `decompose_error` null = dekomposisi sukses (atau belum dicoba);
 * berisi teks apa adanya bila balasan orkestrator tidak terbaca / tidak valid.
 */
export const ProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(500),
  goal: z.string().default(''),
  status: ProjectStatusSchema,
  created_by: z.number().int(),
  created_at: z.number().int(),
  completed_at: z.number().int().nullable().default(null),
  summary: z.string().nullable().default(null),
  decompose_error: z.string().nullable().default(null),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Satu subtask yang dikirim orkestrator saat memecah proyek (indeks bukan id). */
export const ProjectSubtaskSchema = z.object({
  title: z.string().min(1).max(1000),
  detail: z.string().default(''),
  agent: z.string().nullable().default(null),
  depends_on: z.array(z.number().int()).default([]),
});
export type ProjectSubtask = z.infer<typeof ProjectSubtaskSchema>;

/** Subtask proyek yang sudah dipetakan ke id tugas nyata (untuk render DAG). */
export const ProjectTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: TaskStatusSchema,
  agent_id: z.string(),
  depends_on: z.array(z.string()).default([]),
  priority: TaskPrioritySchema.optional(),
  result_md: z.string().nullable().optional(),
  updated_at: z.number().int().optional(),
});
export type ProjectTask = z.infer<typeof ProjectTaskSchema>;

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
