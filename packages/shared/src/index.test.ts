import { describe, it, expect } from 'vitest';
import {
  DEPARTMENTS,
  ENDPOINTS,
  AgentSchema,
  TaskSchema,
  AntiHallucinationReportSchema,
  ResolveApprovalRequestSchema,
} from './index.js';

describe('Shared Package Schema & Contracts', () => {
  it('defines 8 official office departments', () => {
    expect(DEPARTMENTS).toHaveLength(8);
    expect(DEPARTMENTS).toContain('command');
    expect(DEPARTMENTS).toContain('finance');
    expect(DEPARTMENTS).toContain('hr');
  });

  it('tags all 22 core office endpoints', () => {
    expect(ENDPOINTS.length).toBeGreaterThanOrEqual(22);
    const health = ENDPOINTS.find((e) => e.path === '/api/health');
    expect(health).toBeDefined();
    expect(health?.requiresAuth).toBe(false);

    const stream = ENDPOINTS.find((e) => e.path === '/api/stream');
    expect(stream).toBeDefined();
    expect(stream?.requiresAuth).toBe(true);
  });

  it('validates AgentSchema correctly', () => {
    const validAgent = {
      id: 'agent_social_01',
      name: 'Maya Social',
      role: 'Social Media Manager',
      department: 'social',
      avatar: '📱',
      soul_summary: 'Brand voice expert',
      hermes_base_url: 'http://127.0.0.1:8642',
      api_key_env: 'HERMES_KEY_SOCIAL',
      hermes_profile: 'social',
      active: 1,
      hired_at: Date.now(),
      created_at: Date.now(),
    };
    const parsed = AgentSchema.safeParse(validAgent);
    expect(parsed.success).toBe(true);

    // Tahap 10: department ids are data-driven (tabel departments) — the
    // shared schema accepts any non-empty id, and an empty id still fails.
    const customDept = AgentSchema.safeParse({ ...validAgent, department: 'riset' });
    expect(customDept.success).toBe(true);

    const blankDept = AgentSchema.safeParse({ ...validAgent, department: '' });
    expect(blankDept.success).toBe(false);
  });

  it('validates AntiHallucinationReportSchema strictly', () => {
    const validReport = {
      summary_md: 'Ringkasan performa finansial mingguan...',
      insights: ['Pendapatan naik 15%'],
      risks: ['Biaya server meningkat'],
      actions: ['Optimasi cache query'],
    };
    expect(AntiHallucinationReportSchema.safeParse(validReport).success).toBe(true);

    const emptyReport = {
      summary_md: 'Too short',
      insights: [],
      risks: [],
      actions: [],
    };
    expect(AntiHallucinationReportSchema.safeParse(emptyReport).success).toBe(false);
  });

  it('validates ResolveApprovalRequestSchema', () => {
    expect(ResolveApprovalRequestSchema.safeParse({ decision: 'approve' }).success).toBe(true);
    expect(ResolveApprovalRequestSchema.safeParse({ decision: 'deny' }).success).toBe(true);
    expect(ResolveApprovalRequestSchema.safeParse({ decision: 'unknown' }).success).toBe(false);
  });
});
