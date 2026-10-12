import { describe, it, expect } from 'vitest';
import {
  generateSoulMarkdown,
  generateHiringPackage,
  RECRUITMENT_TEMPLATES,
  DEFAULT_BOUNDARIES,
  DEFAULT_APPROVAL_ACTIONS,
  type AgentHiringSpec,
} from './soul.js';

describe('Deterministic SOUL.md Generator & Hiring Package (Phase 6, REQ-083, REQ-084, REQ-092)', () => {
  const sampleSpec: AgentHiringSpec = {
    name: 'Nexus',
    role: 'AI Operations Director',
    department: 'command',
    mission: 'Mengorkestrasi seluruh operasi agen dan memantau SLA kantor virtual.',
    tone: 'Tegas, sistematis, dan solutif.',
    responsibilities: [
      'Memantau beban antrean tugas pada seluruh agen',
      'Mendeteksi dan mengeskalasi hambatan operasional',
      'Mengalokasikan tugas dengan prioritas tinggi kepada agen yang relevan',
      'Menyusun ringkasan status sistem harian untuk CEO',
    ],
    allowed_tools: ['queue_inspector', 'dispatcher_proxy', 'system_metrics'],
    boundaries: [
      'Dilarang mematikan agen command tanpa otorisasi manual.',
      'Dilarang mengeksekusi instruksi di luar protokol kantor virtual.',
    ],
    approval_actions: [
      'Menonaktifkan agen secara massal (mass deactivation)',
      'Mengubah konfigurasi alokasi beban secara permanen',
    ],
    reporting_cadence: 'Harian setiap pukul 09:00 dan 18:00 WIB',
  };

  it('generates SOUL.md with all 9 standard sections', () => {
    const soulMd = generateSoulMarkdown(sampleSpec);

    expect(soulMd).toContain('## 1. Identity');
    expect(soulMd).toContain('## 2. Mission');
    expect(soulMd).toContain('## 3. Responsibilities');
    expect(soulMd).toContain('## 4. Tone & Style');
    expect(soulMd).toContain('## 5. Operating Rules');
    expect(soulMd).toContain('## 6. Boundaries');
    expect(soulMd).toContain('## 7. Approval Policy');
    expect(soulMd).toContain('## 8. Output Format');
    expect(soulMd).toContain('## 9. Reporting Cadence');
  });

  it('embeds all custom boundaries and approval rules from the form into SOUL.md (REQ-092)', () => {
    const soulMd = generateSoulMarkdown(sampleSpec);

    for (const boundary of sampleSpec.boundaries) {
      expect(soulMd).toContain(boundary);
    }

    for (const action of sampleSpec.approval_actions) {
      expect(soulMd).toContain(action);
    }

    for (const resp of sampleSpec.responsibilities) {
      expect(soulMd).toContain(resp);
    }

    expect(soulMd).toContain(sampleSpec.name);
    expect(soulMd).toContain(sampleSpec.role);
    expect(soulMd).toContain(sampleSpec.department);
    expect(soulMd).toContain(sampleSpec.mission);
    expect(soulMd).toContain(sampleSpec.reporting_cadence);
  });

  it('provides 8 predefined templates with exactly 4 default responsibilities each (REQ-081)', () => {
    expect(RECRUITMENT_TEMPLATES.length).toBe(8);

    const departments = RECRUITMENT_TEMPLATES.map((t) => t.department);
    expect(departments).toContain('command');
    expect(departments).toContain('social');
    expect(departments).toContain('sales');
    expect(departments).toContain('finance');
    expect(departments).toContain('marketing');
    expect(departments).toContain('analytics');
    expect(departments).toContain('support');

    for (const tpl of RECRUITMENT_TEMPLATES) {
      expect(tpl.responsibilities.length).toBe(4);
      expect(tpl.mission.length).toBeGreaterThan(10);
      expect(tpl.tone.length).toBeGreaterThan(5);
      expect(tpl.allowed_tools.length).toBeGreaterThan(0);
      expect(tpl.boundaries).toEqual(DEFAULT_BOUNDARIES);
      expect(tpl.approval_actions).toEqual(DEFAULT_APPROVAL_ACTIONS);
    }
  });

  it('generates Hiring Package with verified Phase 0 commands and marks unverified commands as TODO(verify) (REQ-084 & REQ-092)', () => {
    const pkg = generateHiringPackage(sampleSpec);

    expect(pkg.slug).toBe('nexus');
    expect(pkg.soul_md).toContain('## 1. Identity');
    expect(pkg.checklist.length).toBe(5);
    expect(pkg.suggested_port).toBeGreaterThanOrEqual(8650);
    expect(pkg.api_key_env).toBe('HERMES_KEY_NEXUS');

    // Verified Phase 0 commands check
    expect(pkg.commands_md).toContain('hermes profile create nexus');
    expect(pkg.commands_md).toContain('~/.hermes/profiles/nexus/SOUL.md');
    expect(pkg.commands_md).toContain('~/.hermes/profiles/nexus/.env');
    expect(pkg.commands_md).toContain('hermes -p nexus gateway &');

    // Any unverified commands must be tagged // TODO(verify)
    expect(pkg.commands_md).toContain('// TODO(verify)');
  });
});
