import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type {
  LocalSkill,
  SkillSyncStatus,
  SkillSyncResult,
} from '@hermes-office/shared';
import { getServerHermesClient } from './index.js';
import { normalizeSkill } from '../skill-catalog.js';
import { AuditRepository } from '../../db/repositories/audit.js';

export interface SkillSyncOptions {
  skillsDir?: string;
  hermesSkillsDir?: string;
  force?: boolean;
  userId?: number;
  db?: Database.Database;
}

/**
 * Temukan direktori katalog skill repositori `skills/`.
 * Menelusuri dari cwd ke parent jika dijalankan dari apps/server.
 */
export function resolveLocalSkillsDir(overrideDir?: string): string {
  if (overrideDir && overrideDir.trim().length > 0) {
    return path.resolve(overrideDir);
  }

  // Cek apakah direktori cwd/skills ada
  const cwdSkills = path.resolve(process.cwd(), 'skills');
  if (fs.existsSync(cwdSkills) && fs.statSync(cwdSkills).isDirectory()) {
    return cwdSkills;
  }

  // Cek apakah direktori parent ../../skills ada (misal dari apps/server)
  const parentSkills = path.resolve(process.cwd(), '..', '..', 'skills');
  if (fs.existsSync(parentSkills) && fs.statSync(parentSkills).isDirectory()) {
    return parentSkills;
  }

  const oneLevelParent = path.resolve(process.cwd(), '..', 'skills');
  if (fs.existsSync(oneLevelParent) && fs.statSync(oneLevelParent).isDirectory()) {
    return oneLevelParent;
  }

  return cwdSkills;
}

/**
 * Tentukan direktori target instalasi skill Hermes (`~/.hermes/skills`).
 */
export function resolveHermesSkillsDir(overrideDir?: string): string {
  if (overrideDir && overrideDir.trim().length > 0) {
    return path.resolve(overrideDir);
  }
  return path.join(os.homedir(), '.hermes', 'skills');
}

/**
 * Parse frontmatter YAML sederhana pada berkas SKILL.md.
 */
export function parseSkillFrontmatter(content: string, fallbackSlug: string): LocalSkill {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let name = fallbackSlug;
  let title = fallbackSlug;
  let description = '';
  let version: string | undefined;
  const triggers: string[] = [];

  if (match) {
    const yamlBody = match[1];
    const lines = yamlBody.split(/\r?\n/);
    let inTriggers = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('triggers:')) {
        inTriggers = true;
        continue;
      }

      if (inTriggers) {
        if (line.startsWith('- ')) {
          triggers.push(line.replace(/^-+\s*/, '').trim());
          continue;
        } else if (/^[a-zA-Z0-9_-]+:/.test(line)) {
          inTriggers = false;
        }
      }

      const keyVal = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (keyVal) {
        const key = keyVal[1].toLowerCase();
        const val = keyVal[2].replace(/^['"]|['"]$/g, '').trim();
        if (key === 'name' && val) name = val;
        else if (key === 'title' && val) title = val;
        else if (key === 'description' && val) description = val;
        else if (key === 'version' && val) version = val;
      }
    }
  }

  return {
    name,
    title,
    description,
    version,
    triggers: triggers.length > 0 ? triggers : undefined,
    path: '',
  };
}

/**
 * Baca seluruh skill yang tersimpan di katalog repositori lokal.
 */
export function readLocalSkillCatalog(skillsDir?: string): LocalSkill[] {
  const targetDir = resolveLocalSkillsDir(skillsDir);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return [];
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const skills: LocalSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(targetDir, entry.name);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    if (fs.existsSync(skillMdPath) && fs.statSync(skillMdPath).isFile()) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const parsed = parseSkillFrontmatter(content, entry.name);
        skills.push({
          ...parsed,
          path: skillMdPath,
        });
      } catch {
        // Abaikan berkas tak terbaca
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Periksa status sinkronisasi antara katalog skill repo dengan skill yang terpasang.
 */
export async function checkSkillSyncStatus(
  options?: Pick<SkillSyncOptions, 'skillsDir' | 'hermesSkillsDir'>
): Promise<SkillSyncStatus> {
  const localSkills = readLocalSkillCatalog(options?.skillsDir);
  const installedNamesSet = new Set<string>();
  let gatewayError: string | null = null;

  // 1. Ambil skill dari gateway jika aktif
  try {
    const gatewaySkills = await getServerHermesClient().listSkills();
    for (const raw of gatewaySkills) {
      const norm = normalizeSkill(raw);
      if (norm.name) {
        installedNamesSet.add(norm.name.toLowerCase());
      }
    }
  } catch (err) {
    gatewayError = (err as Error)?.message || String(err);
  }

  // 2. Ambil skill dari filesystem Hermes (~/.hermes/skills)
  const hermesSkillsDir = resolveHermesSkillsDir(options?.hermesSkillsDir);
  if (fs.existsSync(hermesSkillsDir) && fs.statSync(hermesSkillsDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(hermesSkillsDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          installedNamesSet.add(ent.name.toLowerCase());
        }
      }
    } catch {
      // Abaikan jika direktori tidak bisa dibaca
    }
  }

  const missingSkills = localSkills.filter(
    (s) => !installedNamesSet.has(s.name.toLowerCase())
  );

  const installedNamesList = Array.from(installedNamesSet).sort();

  return {
    in_sync: missingSkills.length === 0,
    total_local: localSkills.length,
    total_installed: installedNamesList.length,
    missing_names: missingSkills.map((s) => s.name),
    installed_names: installedNamesList,
    local_skills: localSkills,
    gateway_error: gatewayError,
  };
}

/**
 * Sinkronisasikan / auto-install seluruh skill repo yang belum terpasang ke target Hermes.
 */
export async function syncSkills(options?: SkillSyncOptions): Promise<SkillSyncResult> {
  const localSkills = readLocalSkillCatalog(options?.skillsDir);
  const targetDir = resolveHermesSkillsDir(options?.hermesSkillsDir);
  const force = !!options?.force;
  const now = Date.now();

  const auditRepo = options?.db ? new AuditRepository(options.db) : null;
  const userId = options?.userId ?? 1;

  // Pastikan target directory induk ada
  fs.mkdirSync(targetDir, { recursive: true });

  // Ambil daftar yang sudah terpasang di filesystem target
  const installedOnDisk = new Set<string>();
  if (fs.existsSync(targetDir)) {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        installedOnDisk.add(ent.name.toLowerCase());
      }
    }
  }

  const synced: string[] = [];
  const alreadyInstalled: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const skill of localSkills) {
    const skillNameLower = skill.name.toLowerCase();
    const destDir = path.join(targetDir, skill.name);

    if (installedOnDisk.has(skillNameLower) && !force) {
      alreadyInstalled.push(skill.name);
      continue;
    }

    try {
      fs.mkdirSync(destDir, { recursive: true });

      // Salin berkas SKILL.md
      const destSkillMd = path.join(destDir, 'SKILL.md');
      fs.copyFileSync(skill.path, destSkillMd);

      // Salin berkas pendukung lain jika ada di folder skill lokal
      const srcDir = path.dirname(skill.path);
      const srcFiles = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const file of srcFiles) {
        if (file.isFile() && file.name !== 'SKILL.md') {
          fs.copyFileSync(path.join(srcDir, file.name), path.join(destDir, file.name));
        }
      }

      synced.push(skill.name);

      if (auditRepo) {
        auditRepo.logAction(
          userId,
          'skill.auto_sync',
          skill.name,
          JSON.stringify({
            skill: skill.name,
            source: skill.path,
            destination: destSkillMd,
            forced: force,
          })
        );
      }
    } catch (err) {
      failed.push({
        name: skill.name,
        error: (err as Error)?.message || String(err),
      });
    }
  }

  return {
    ok: failed.length === 0,
    synced,
    already_installed: alreadyInstalled,
    failed,
    timestamp: now,
  };
}
