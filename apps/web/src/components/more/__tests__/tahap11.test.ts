/**
 * Tahap 11 acceptance — instal/hapus skill lewat orkestrator:
 *  - SkillsModal punya panel "Instal dari katalog" (input + tombol kirim +
 *    status sukses + error server) dan tombol "Minta Hapus" per skill terpasang
 *    dengan konfirmasi inline;
 *  - api.ts punya installSkill/uninstallSkill ke dua endpoint phase 11;
 *  - endpoints.ts mencatat kedua rute dengan phase 11;
 *  - routes/skills.ts menjaga guardrail slug + audit skill.install_request.
 *
 * Layout/wiring diassert dari sumber; perilaku rute dicakup
 * apps/server/src/tahap11.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const skillsModal = read('../SkillsModal.tsx');
const api = read('../../../services/api.ts');
const endpoints = read('../../../../../../packages/shared/src/endpoints.ts');
const routes = read('../../../../../../apps/server/src/routes/skills.ts');

describe('SkillsModal — instal & hapus skill', () => {
  it('exposes the install panel with input, submit, status and error testids', () => {
    expect(skillsModal).toContain('data-testid="skill-install-input"');
    expect(skillsModal).toContain('data-testid="skill-install-submit"');
    expect(skillsModal).toContain('data-testid="skill-install-status"');
    expect(skillsModal).toContain('data-testid="skill-install-error"');
    expect(skillsModal).toContain('Minta Orkestrator Install');
    expect(skillsModal).toContain('Instal dari katalog');
    expect(skillsModal).toContain('Permintaan dikirim — pantau progres di layar Tugas.');
    expect(skillsModal).toContain('api.installSkill(');
    expect(skillsModal).toContain('addTickerMessage(');
  });

  it('offers Minta Hapus on every installed skill with an inline confirmation', () => {
    expect(skillsModal).toContain('Minta Hapus');
    expect(skillsModal).toContain('api.uninstallSkill(');
    expect(skillsModal).toContain('Ya, hapus');
    expect(skillsModal).toContain('setConfirmUninstall(');
    // Confirmation is cancelled without touching the gateway.
    expect(skillsModal).toContain('setConfirmUninstall(null)');
    // The installed list is refreshed right after an uninstall request.
    expect(skillsModal).toMatch(/await api\.uninstallSkill\(name\);[\s\S]{0,400}await load\(\);/);
  });
});

describe('Tahap 11 API surface', () => {
  it('wires installSkill/uninstallSkill in the client', () => {
    expect(api).toContain('installSkill:');
    expect(api).toContain("'/skills/install'");
    expect(api).toContain('uninstallSkill:');
    expect(api).toContain("'/skills/uninstall'");
    expect(api).toContain("method: 'POST'");
  });

  it('lists both phase 11 endpoints in the shared manifest', () => {
    expect(endpoints).toContain("path: '/api/skills/install'");
    expect(endpoints).toContain("path: '/api/skills/uninstall'");
    expect(endpoints).toMatch(/phase: 11/);
    expect(endpoints).toContain("requiresAuth: true");
  });
});

describe('routes/skills.ts guardrails & audit', () => {
  it('keeps the slug guardrail regex before any lookup', () => {
    expect(routes).toContain('const SKILL_SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;');
    expect(routes).toContain("[a-z0-9][a-z0-9-]{0,40}");
    expect(routes).toContain("if (!SKILL_SLUG.test(name)) return rejectSlug(reply);");
  });

  it('queues the orchestrator task and writes the audit actions', () => {
    expect(routes).toContain("const ORCHESTRATOR_ID = 'agent_orchestrator';");
    expect(routes).toContain("agent_id: ORCHESTRATOR_ID");
    expect(routes).toContain("status: 'queued'");
    expect(routes).toContain("'skill.install_request'");
    expect(routes).toContain("'skill.uninstall_request'");
    expect(routes).toContain('manage_catalog');
    expect(routes).toContain('fastify.dispatcher.runTask(task.id)');
  });
});
