import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../../db/migrator.js';
import { AgentRepository } from '../../db/repositories/agents.js';
import { AgentSkillRepository } from '../../db/repositories/agent-skills.js';
import { AuditRepository } from '../../db/repositories/audit.js';
import {
  sanitizeProfileSlug,
  resolveAgentProfileName,
  buildAgentSoulMarkdown,
  provisionAgentProfile,
} from './provisioner.js';

describe('Hermes Profile Provisioner (Fase 3)', () => {
  let db: BetterSqlite3.Database;
  let agentRepo: AgentRepository;
  let agentSkillRepo: AgentSkillRepository;
  let auditRepo: AuditRepository;
  let tempProfilesDir: string;

  beforeEach(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    agentRepo = new AgentRepository(db);
    agentSkillRepo = new AgentSkillRepository(db);
    auditRepo = new AuditRepository(db);

    tempProfilesDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-profiles-test-'));
  });

  afterEach(async () => {
    db.close();
    try {
      await fs.promises.rm(tempProfilesDir, { recursive: true, force: true });
    } catch {
      // ignore temp dir cleanup errors
    }
  });

  describe('sanitizeProfileSlug', () => {
    it('converts mixed strings to clean lowercase alphanumeric hyphen slugs', () => {
      expect(sanitizeProfileSlug('Aria')).toBe('aria');
      expect(sanitizeProfileSlug('Bagas (Sales Head)')).toBe('bagas-sales-head');
      expect(sanitizeProfileSlug('---kalam-writer---')).toBe('kalam-writer');
      expect(sanitizeProfileSlug('agent_007')).toBe('agent_007');
    });

    it('returns empty string for pure symbols', () => {
      expect(sanitizeProfileSlug('$$$###@@@')).toBe('');
    });
  });

  describe('resolveAgentProfileName', () => {
    it('uses custom hermes_profile when not default', () => {
      const profile = resolveAgentProfileName({
        id: 'agent_1',
        name: 'Aria',
        hermes_profile: 'social-ninja',
      });
      expect(profile).toBe('social-ninja');
    });

    it('falls back to agent name when hermes_profile is default or empty', () => {
      const profileDefault = resolveAgentProfileName({
        id: 'agent_aria',
        name: 'Aria Social',
        hermes_profile: 'default',
      });
      expect(profileDefault).toBe('aria-social');

      const profileEmpty = resolveAgentProfileName({
        id: 'agent_bagas',
        name: 'Bagas',
        hermes_profile: '',
      });
      expect(profileEmpty).toBe('bagas');
    });

    it('falls back to agent id when name is absent', () => {
      const profile = resolveAgentProfileName({
        id: 'agent_custom_42',
        name: '',
        hermes_profile: '',
      });
      expect(profile).toBe('agent_custom_42');
    });
  });

  describe('buildAgentSoulMarkdown', () => {
    it('generates standard 9-section SOUL.md with identity and active skills', () => {
      const agent = {
        id: 'agent_aria',
        name: 'Aria',
        role: 'Social Media Manager',
        department: 'social',
        avatar: '📱',
        soul_summary: 'Mengelola kanal sosial dan menganalisis engagement.',
        hermes_base_url: '',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: Date.now(),
        created_at: Date.now(),
      };

      const soulMd = buildAgentSoulMarkdown(agent, {
        skills: ['prospecting', 'social_scheduler'],
      });

      expect(soulMd).toContain('# SOUL: Aria');
      expect(soulMd).toContain('## 1. Identity');
      expect(soulMd).toContain('- **Name**: Aria');
      expect(soulMd).toContain('- **Role**: Social Media Manager');
      expect(soulMd).toContain('- **Department**: social');
      expect(soulMd).toContain('## 2. Mission');
      expect(soulMd).toContain('Mengelola kanal sosial dan menganalisis engagement.');
      expect(soulMd).toContain('## 5. Operating Rules');
      expect(soulMd).toContain('prospecting, social_scheduler');
      expect(soulMd).toContain('## 6. Boundaries');
      expect(soulMd).toContain('## 7. Approval Policy');
    });

    it('honors customSoulMd if explicitly provided', () => {
      const agent = {
        id: 'agent_aria',
        name: 'Aria',
        role: 'Social Media Manager',
        department: 'social',
        avatar: '📱',
        soul_summary: '',
        hermes_base_url: '',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: Date.now(),
        created_at: Date.now(),
      };

      const custom = '# Custom SOUL\n\nCustom instructions for agent.';
      const result = buildAgentSoulMarkdown(agent, { customSoulMd: custom });
      expect(result).toBe(custom);
    });
  });

  describe('provisionAgentProfile execution', () => {
    it('provisions agent profile, creates SOUL.md, updates SQLite state to ready, and logs audit', async () => {
      const now = 1700000000000;
      agentRepo.create({
        id: 'agent_bagas',
        name: 'Bagas',
        role: 'Sales Representative',
        department: 'sales',
        avatar: '💼',
        soul_summary: 'Spesialis prospek dan closing penjualan.',
        hermes_base_url: '',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: now,
        created_at: now,
      });

      const initial = agentRepo.getById('agent_bagas')!;
      expect(initial.provision_state).toBe('unprovisioned');

      const result = await provisionAgentProfile(initial, db, {
        profilesDir: tempProfilesDir,
        skipCli: true,
        skills: ['sales_prospecting', 'crm_lead_sync'],
        userId: 123456,
        now,
      });

      expect(result.ok).toBe(true);
      expect(result.profile_name).toBe('bagas');
      expect(result.provision_state).toBe('ready');
      expect(result.provisioned_at).toBe(now);

      // Verify file written to disk
      const soulFilePath = path.join(tempProfilesDir, 'bagas', 'SOUL.md');
      expect(fs.existsSync(soulFilePath)).toBe(true);
      const fileContent = await fs.promises.readFile(soulFilePath, 'utf-8');
      expect(fileContent).toContain('# SOUL: Bagas');
      expect(fileContent).toContain('sales_prospecting, crm_lead_sync');

      // Verify SQLite state
      const updatedAgent = agentRepo.getById('agent_bagas')!;
      expect(updatedAgent.provision_state).toBe('ready');
      expect(updatedAgent.provision_error).toBeNull();
      expect(updatedAgent.provisioned_at).toBe(now);
      expect(updatedAgent.hermes_profile).toBe('bagas');

      // Verify Audit Log
      const logs = auditRepo.getAll(10);
      const provisionLog = logs.find((l) => l.action === 'agent.provision');
      expect(provisionLog).toBeDefined();
      expect(provisionLog?.target).toBe('agent_bagas');
      expect(provisionLog?.telegram_user_id).toBe(123456);
    });

    it('is completely idempotent when run multiple times', async () => {
      const now1 = 1700000000000;
      const now2 = 1700000050000;

      agentRepo.create({
        id: 'agent_kalam',
        name: 'Kalam',
        role: 'Content Writer',
        department: 'marketing',
        avatar: '✍️',
        soul_summary: 'Menulis artikel dan kampanye konten.',
        hermes_base_url: '',
        api_key_env: 'KEY',
        hermes_profile: 'kalam',
        active: 1,
        hired_at: now1,
        created_at: now1,
      });

      const agent = agentRepo.getById('agent_kalam')!;

      // First run
      const result1 = await provisionAgentProfile(agent, db, {
        profilesDir: tempProfilesDir,
        skipCli: true,
        skills: ['blog_writing'],
        now: now1,
      });
      expect(result1.ok).toBe(true);
      expect(result1.provision_state).toBe('ready');

      // Second run with updated skill
      const result2 = await provisionAgentProfile(agent, db, {
        profilesDir: tempProfilesDir,
        skipCli: true,
        skills: ['blog_writing', 'seo_optimization'],
        now: now2,
      });
      expect(result2.ok).toBe(true);
      expect(result2.provision_state).toBe('ready');

      // Check updated SOUL.md on disk
      const soulFilePath = path.join(tempProfilesDir, 'kalam', 'SOUL.md');
      const updatedContent = await fs.promises.readFile(soulFilePath, 'utf-8');
      expect(updatedContent).toContain('seo_optimization');

      const finalAgent = agentRepo.getById('agent_kalam')!;
      expect(finalAgent.provision_state).toBe('ready');
      expect(finalAgent.provisioned_at).toBe(now2);
    });

    it('records failed state and error message when profile creation encounters fatal error', async () => {
      agentRepo.create({
        id: 'agent_broken',
        name: 'Broken',
        role: 'Invalid',
        department: 'support',
        avatar: '⚠️',
        soul_summary: 'Test broken',
        hermes_base_url: '',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: Date.now(),
        created_at: Date.now(),
      });

      const agent = agentRepo.getById('agent_broken')!;

      // Create a file at the profilesDir location so mkdir fails with ENOTDIR
      const blockerFile = path.join(tempProfilesDir, 'blocker');
      await fs.promises.writeFile(blockerFile, 'file blocking directory');

      const result = await provisionAgentProfile(agent, db, {
        profilesDir: blockerFile, // passing a file path instead of directory causes mkdir to fail
        skipCli: true,
      });

      expect(result.ok).toBe(false);
      expect(result.provision_state).toBe('failed');
      expect(result.error).toBeDefined();

      const updatedAgent = agentRepo.getById('agent_broken')!;
      expect(updatedAgent.provision_state).toBe('failed');
      expect(updatedAgent.provision_error).toContain('ENOTDIR');

      // Verify audit log recorded failure
      const logs = auditRepo.getAll(10);
      const failLog = logs.find((l) => l.action === 'agent.provision_failed');
      expect(failLog).toBeDefined();
    });
  });
});
