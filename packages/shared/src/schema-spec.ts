/**
 * Canonical Data Model Specification (Section 6 & Rule C3b)
 * Single Source of Truth for SQLite database schema across migrations, server, and gap-check.
 */

export interface TableSpec {
  name: string;
  columns: readonly string[];
  requiredPhase: number;
}

export const SCHEMA_SPEC: readonly TableSpec[] = [
  {
    name: 'agents',
    columns: [
      'id',
      'name',
      'role',
      'department',
      'avatar',
      'soul_summary',
      'hermes_base_url',
      'api_key_env',
      'hermes_profile',
      'active',
      'hired_at',
      'created_at',
      'provision_state',
      'provision_error',
      'provisioned_at',
    ],
    requiredPhase: 2,
  },
  {
    name: 'tasks',
    columns: [
      'id',
      'title',
      'description',
      'agent_id',
      'priority',
      'status',
      'run_id',
      'result_md',
      'due_at',
      'created_by',
      'created_at',
      'updated_at',
    ],
    requiredPhase: 2,
  },
  {
    name: 'run_events',
    columns: ['id', 'run_id', 'agent_id', 'type', 'payload_json', 'ts'],
    requiredPhase: 2,
  },
  {
    name: 'approvals',
    columns: [
      'id',
      'run_id',
      'agent_id',
      'summary',
      'payload_json',
      'status',
      'decided_by',
      'decided_at',
      'created_at',
    ],
    requiredPhase: 2,
  },
  {
    name: 'reports',
    columns: [
      'id',
      'agent_id',
      'department',
      'template',
      'period',
      'body_md',
      'metrics_json',
      'created_at',
    ],
    requiredPhase: 2,
  },
  {
    name: 'kpis',
    columns: [
      'id',
      'department',
      'key',
      'label',
      'value',
      'unit',
      'period',
      'source',
      'source_note',
      'created_at',
    ],
    requiredPhase: 2,
  },
  {
    name: 'hiring_drafts',
    columns: [
      'id',
      'form_json',
      'soul_md',
      'commands_md',
      'status',
      'created_at',
    ],
    requiredPhase: 2,
  },
  {
    name: 'audit_log',
    columns: ['id', 'telegram_user_id', 'action', 'target', 'detail_json', 'ts'],
    requiredPhase: 2,
  },
  {
    name: 'settings',
    columns: ['key', 'value'],
    requiredPhase: 2,
  },
  // Tahap 14 — proyek & subtask berantai (migrasi 007).
  {
    name: 'projects',
    columns: [
      'id',
      'title',
      'goal',
      'status',
      'created_by',
      'created_at',
      'completed_at',
      'summary',
      'decompose_error',
    ],
    requiredPhase: 14,
  },
  // Fase 2e — persistensi obrolan & status run (migrasi 010).
  {
    name: 'agent_runs',
    columns: [
      'id',
      'agent_id',
      'session_id',
      'client_message_id',
      'status',
      'error_reason',
      'model',
      'started_at',
      'finished_at',
    ],
    requiredPhase: 2,
  },
  {
    name: 'agent_messages',
    columns: [
      'id',
      'agent_id',
      'run_id',
      'client_message_id',
      'role',
      'content',
      'status',
      'created_at',
      'updated_at',
    ],
    requiredPhase: 2,
  },
] as const;
