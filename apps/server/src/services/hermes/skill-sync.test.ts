import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../../db/migrator.js';
import { AuditRepository } from '../../db/repositories/audit.js';
import {
  parseSkillFrontmatter,
  readLocalSkillCatalog,
  resolveHermesSkillsDir,
  checkSkillSyncStatus,
  syncSkills,
} from './skill-sync.js';

describe('Hermes Skill Auto-Install & Sync (Fase 6)', () => {
  let db: BetterSqlite3.Database;
  let tempRepoSkillsDir: string;
  let tempHermesSkillsDir: string;

  beforeEach(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);

    tempRepoSkillsDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'hermes-repo-skills-test-')
    );
    tempHermesSkillsDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'hermes-target-skills-test-')
    );

    // Buat 2 dummy skill di temp repo
    const skill1Dir = path.join(tempRepoSkillsDir, 'test-skill-one');
    await fs.promises.mkdir(skill1Dir, { recursive: true });
    await fs.promises.writeFile(
      path.join(skill1Dir, 'SKILL.md'),
      `---
name: test-skill-one
title: Test Skill One
description: Melakukan pengujian pertama
version: 1.0.0
triggers:
  - uji satu
  - run test 1
---

# Test Skill One Content
`,
      'utf8'
    );

    const skill2Dir = path.join(tempRepoSkillsDir, 'test-skill-two');
    await fs.promises.mkdir(skill2Dir, { recursive: true });
    await fs.promises.writeFile(
      path.join(skill2Dir, 'SKILL.md'),
      `---
name: test-skill-two
title: Test Skill Two
description: Melakukan pengujian kedua
version: 2.1.0
---

# Test Skill Two Content
`,
      'utf8'
    );
  });

  afterEach(async () => {
    db.close();
    try {
      await fs.promises.rm(tempRepoSkillsDir, { recursive: true, force: true });
      await fs.promises.rm(tempHermesSkillsDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('parseSkillFrontmatter', () => {
    it('parses valid frontmatter correctly', () => {
      const raw = `---
name: custom-lead
title: Custom Lead Gen
description: Analisis prospek bisnis
version: 1.2.0
triggers:
  - lead
  - prospek
---
# Body`;
      const parsed = parseSkillFrontmatter(raw, 'fallback-name');
      expect(parsed.name).toBe('custom-lead');
      expect(parsed.title).toBe('Custom Lead Gen');
      expect(parsed.description).toBe('Analisis prospek bisnis');
      expect(parsed.version).toBe('1.2.0');
      expect(parsed.triggers).toEqual(['lead', 'prospek']);
    });

    it('falls back gracefully when frontmatter is missing or invalid', () => {
      const raw = `# Just markdown without frontmatter`;
      const parsed = parseSkillFrontmatter(raw, 'my-skill');
      expect(parsed.name).toBe('my-skill');
      expect(parsed.title).toBe('my-skill');
      expect(parsed.description).toBe('');
      expect(parsed.triggers).toBeUndefined();
    });
  });

  describe('readLocalSkillCatalog', () => {
    it('reads all valid skills in the specified directory', () => {
      const catalog = readLocalSkillCatalog(tempRepoSkillsDir);
      expect(catalog).toHaveLength(2);
      expect(catalog[0].name).toBe('test-skill-one');
      expect(catalog[0].title).toBe('Test Skill One');
      expect(catalog[1].name).toBe('test-skill-two');
      expect(catalog[1].description).toBe('Melakukan pengujian kedua');
    });

    it('reads real repo skills from default skills/ folder', () => {
      const catalog = readLocalSkillCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(4);
      const names = catalog.map((s) => s.name);
      expect(names).toContain('prospecting');
      expect(names).toContain('marketing-plan');
      expect(names).toContain('brand');
      expect(names).toContain('sales-enablement');
    });
  });

  describe('checkSkillSyncStatus', () => {
    it('reports missing skills when target hermes directory is empty', async () => {
      const status = await checkSkillSyncStatus({
        skillsDir: tempRepoSkillsDir,
        hermesSkillsDir: tempHermesSkillsDir,
      });

      expect(status.in_sync).toBe(false);
      expect(status.total_local).toBe(2);
      expect(status.missing_names).toEqual(['test-skill-one', 'test-skill-two']);
    });

    it('reports in_sync true when all local skills exist in target directory', async () => {
      // Pasang kedua skill secara manual di target
      await fs.promises.mkdir(path.join(tempHermesSkillsDir, 'test-skill-one'), { recursive: true });
      await fs.promises.mkdir(path.join(tempHermesSkillsDir, 'test-skill-two'), { recursive: true });

      const status = await checkSkillSyncStatus({
        skillsDir: tempRepoSkillsDir,
        hermesSkillsDir: tempHermesSkillsDir,
      });

      expect(status.in_sync).toBe(true);
      expect(status.missing_names).toEqual([]);
      expect(status.installed_names).toContain('test-skill-one');
      expect(status.installed_names).toContain('test-skill-two');
    });
  });

  describe('syncSkills', () => {
    it('copies missing skill files and writes audit log', async () => {
      const result = await syncSkills({
        skillsDir: tempRepoSkillsDir,
        hermesSkillsDir: tempHermesSkillsDir,
        userId: 1,
        db,
      });

      expect(result.ok).toBe(true);
      expect(result.synced).toEqual(['test-skill-one', 'test-skill-two']);
      expect(result.already_installed).toEqual([]);

      // Verifikasi berkas fisik disalin
      const skill1Dest = path.join(tempHermesSkillsDir, 'test-skill-one', 'SKILL.md');
      expect(fs.existsSync(skill1Dest)).toBe(true);
      const content = await fs.promises.readFile(skill1Dest, 'utf8');
      expect(content).toContain('Test Skill One Content');

      // Verifikasi audit log tercatat
      const auditRepo = new AuditRepository(db);
      const logs = auditRepo.getAll(10);
      const syncLogs = logs.filter((l) => l.action === 'skill.auto_sync');
      expect(syncLogs).toHaveLength(2);
      expect(syncLogs.map((l) => l.target)).toContain('test-skill-one');
      expect(syncLogs.map((l) => l.target)).toContain('test-skill-two');
    });

    it('is idempotent and skips already installed skills on second run', async () => {
      // Run 1
      await syncSkills({
        skillsDir: tempRepoSkillsDir,
        hermesSkillsDir: tempHermesSkillsDir,
        userId: 1,
        db,
      });

      // Run 2
      const result2 = await syncSkills({
        skillsDir: tempRepoSkillsDir,
        hermesSkillsDir: tempHermesSkillsDir,
        userId: 1,
        db,
      });

      expect(result2.ok).toBe(true);
      expect(result2.synced).toEqual([]);
      expect(result2.already_installed).toEqual(['test-skill-one', 'test-skill-two']);
    });

    it('forces overwrite when force is true', async () => {
      // Run 1
      await syncSkills({
        skillsDir: tempRepoSkillsDir,
        hermesSkillsDir: tempHermesSkillsDir,
      });

      // Run 2 with force: true
      const result2 = await syncSkills({
        skillsDir: tempRepoSkillsDir,
        hermesSkillsDir: tempHermesSkillsDir,
        force: true,
      });

      expect(result2.ok).toBe(true);
      expect(result2.synced).toEqual(['test-skill-one', 'test-skill-two']);
    });
  });
});
