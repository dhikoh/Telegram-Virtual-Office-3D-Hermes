/**
 * Global Constants & Enumerations
 * Single Source of Truth for Hermes Virtual Office
 */

export const DEPARTMENTS = [
  'command',
  'social',
  'sales',
  'finance',
  'marketing',
  'analytics',
  'support',
  'hr',
] as const;

/**
 * Tahap 10: department ids are data-driven (table `departments`, seeded from
 * the list above). The id is an open string — write routes resolve it against
 * the departments table, and ROOM_LAYOUTS lookups fall back for unknown ids.
 */
export type Department = string;

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  'backlog',
  'queued',
  'running',
  'needs_approval',
  'done',
  'failed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'denied', 'expired'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const AGENT_NORMALIZED_STATUSES = [
  'idle',
  'thinking',
  'working',
  'waiting_approval',
  'error',
  'offline',
] as const;
export type AgentNormalizedStatus = (typeof AGENT_NORMALIZED_STATUSES)[number];

export const KPI_SOURCES = ['manual', 'import', 'agent'] as const;
export type KpiSource = (typeof KPI_SOURCES)[number];

export const REPORT_TEMPLATES = [
  'daily_sales',
  'weekly_social',
  'monthly_finance',
  'campaign_roi',
] as const;
export type ReportTemplate = (typeof REPORT_TEMPLATES)[number];

export const HIRING_STATUSES = ['draft', 'hired', 'discarded'] as const;
export type HiringStatus = (typeof HIRING_STATUSES)[number];
