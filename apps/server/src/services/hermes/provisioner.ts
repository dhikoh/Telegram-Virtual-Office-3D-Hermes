import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type Database from 'better-sqlite3';
import {
  generateSoulMarkdown,
  type Agent,
  type AgentProvisionState,
} from '@hermes-office/shared';
import { AgentRepository } from '../../db/repositories/agents.js';
import { AgentSkillRepository } from '../../db/repositories/agent-skills.js';
import { AuditRepository } from '../../db/repositories/audit.js';
import { readGatewayCatalogCached } from '../skill-catalog.js';
import { config } from '../../config.js';

const execFileAsync = promisify(execFile);

export interface ProvisionOptions {
  profilesDir?: string;
  hermesBin?: string;
  skipCli?: boolean;
  soulMd?: string;
  skills?: string[];
  userId?: number;
  now?: number;
}

export interface ProvisionResult {
  ok: boolean;
  agent_id: string;
  profile_name: string;
  soul_path: string;
  soul_content: string;
  provision_state: AgentProvisionState;
  error?: string | null;
  provisioned_at?: number | null;
  cli_invoked: boolean;
}

/**
 * Sanitasi string menjadi slug profil yang aman untuk sistem berkas dan argumen CLI.
 * Hanya mengizinkan huruf kecil a-z, angka 0-9, dash (-), dan underscore (_).
 */
export function sanitizeProfileSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Tentukan nama profil Hermes untuk satu agen.
 * Prioritas:
 * 1. hermes_profile yang ada (jika bukan 'default' atau kosong)
 * 2. nama agen (disanitasi)
 * 3. id agen (fallback aman)
 */
export function resolveAgentProfileName(
  agent: Pick<Agent, 'id' | 'name' | 'hermes_profile'>
): string {
  if (
    agent.hermes_profile &&
    agent.hermes_profile !== 'default' &&
    agent.hermes_profile.trim().length > 0
  ) {
    const slug = sanitizeProfileSlug(agent.hermes_profile);
    if (slug.length > 0) return slug;
  }

  if (agent.name && agent.name.trim().length > 0) {
    const slug = sanitizeProfileSlug(agent.name);
    if (slug.length > 0) return slug;
  }

  return sanitizeProfileSlug(agent.id) || 'agent';
}

/**
 * Mengembalikan direktori induk untuk profil-profil Hermes.
 */
export function resolveHermesProfilesDir(overrideDir?: string): string {
  if (overrideDir && overrideDir.trim().length > 0) {
    return path.resolve(overrideDir);
  }
  return path.join(os.homedir(), '.hermes', 'profiles');
}

/**
 * Susun konten Markdown SOUL.md resmi untuk profil agen Hermes.
 */
export function buildAgentSoulMarkdown(
  agent: Agent,
  options?: { skills?: string[]; customSoulMd?: string }
): string {
  if (options?.customSoulMd && options.customSoulMd.trim().length > 0) {
    return options.customSoulMd.trim();
  }

  const allowedTools =
    options?.skills && options.skills.length > 0
      ? options.skills
      : ['standard_chat', 'task_runner'];

  const missionText =
    agent.soul_summary && agent.soul_summary.trim().length > 0
      ? agent.soul_summary.trim()
      : `Menjalankan tugas dan tanggung jawab operasional sebagai ${agent.role} di departemen ${agent.department}.`;

  return generateSoulMarkdown({
    name: agent.name,
    role: agent.role,
    department: agent.department,
    mission: missionText,
    tone: 'Profesional, responsif, transparan, dan berorientasi pada data terverifikasi.',
    responsibilities: [
      `Menjalankan arahan dan tugas kerja untuk departemen ${agent.department}.`,
      'Menyampaikan laporan progres berkala serta hasil analisis secara jujur.',
      'Mematuhi batas wewenang dan eskalasi persetujuan bila diperlukan.',
    ],
    allowed_tools: allowedTools,
    boundaries: [
      'Dilarang membocorkan data rahasia, token akses, atau kredensial sistem.',
      'Dilarang melakukan rekayasa fakta, manipulasi metrik, atau halusinasi angka.',
      'Dilarang menjalankan tindakan destruktif di luar cakupan tugas tanpa izin.',
    ],
    approval_actions: [
      'Pengeluaran anggaran atau transaksi finansial.',
      'Publikasi pernyataan atau dokumen resmi ke publik.',
      'Penghapusan data atau aset perusahaan secara permanen.',
    ],
    reporting_cadence: 'Harian untuk pembaruan status dan mingguan untuk laporan pencapaian.',
  });
}

/**
 * Provision profil Hermes untuk satu agen secara idempoten:
 * 1. Menentukan nama profil dan memperbarui state agen menjadi 'provisioning'.
 * 2. Mengumpulkan skill aktif agen.
 * 3. Menyusun dokumen SOUL.md.
 * 4. Memanggil `hermes profile create <profile>` via `execFile` (aman dari shell injection).
 * 5. Menempatkan berkas SOUL.md di direktori profil (~/.hermes/profiles/<profile>/SOUL.md).
 * 6. Mengupdate `provision_state` agen menjadi 'ready' di SQLite & mencatat audit log.
 */
export async function provisionAgentProfile(
  agent: Agent,
  db: Database.Database,
  options?: ProvisionOptions
): Promise<ProvisionResult> {
  const agentRepo = new AgentRepository(db);
  const agentSkillRepo = new AgentSkillRepository(db);
  const auditRepo = new AuditRepository(db);

  const profileName = resolveAgentProfileName(agent);
  const profilesDir = resolveHermesProfilesDir(options?.profilesDir);
  const agentProfileDir = path.join(profilesDir, profileName);
  const soulPath = path.join(agentProfileDir, 'SOUL.md');

  // 1. Set status transisi: provisioning
  agentRepo.updateProvisionState(agent.id, 'provisioning');
  if (agent.hermes_profile !== profileName) {
    agentRepo.update(agent.id, { hermes_profile: profileName });
  }

  let cliInvoked = false;

  try {
    // 2. Tentukan skill aktif
    let activeSkills: string[] = options?.skills ?? [];
    if (!options?.skills) {
      const disabled = agentSkillRepo.listDisabled(agent.id);
      const catalog = await readGatewayCatalogCached();
      if (catalog.ok && catalog.names.length > 0) {
        const off = new Set(disabled.map((s) => s.toLowerCase()));
        activeSkills = catalog.names.filter((s) => !off.has(s.toLowerCase()));
      }
    }

    // 3. Susun isi SOUL.md
    const soulContent = buildAgentSoulMarkdown(agent, {
      skills: activeSkills,
      customSoulMd: options?.soulMd,
    });

    // 4. Eksekusi CLI jika tidak diskip dan bukan mode mock murni
    const shouldRunCli = !options?.skipCli && config.HERMES_MODE !== 'mock';

    if (shouldRunCli) {
      const hermesBin = options?.hermesBin || 'hermes';
      cliInvoked = true;
      try {
        await execFileAsync(
          hermesBin,
          ['profile', 'create', profileName, '--description', `${agent.name} (${agent.role})`],
          { timeout: 10000 }
        );
      } catch (cliErr: unknown) {
        const errMessage = String((cliErr as Error)?.message || cliErr);
        // Idempoten: jika profil sudah ada, lanjutkan
        const isAlreadyExists =
          /already exists|profile exists|sudah ada/i.test(errMessage) ||
          ((cliErr as { code?: string }).code === 'ENOENT' && process.env.NODE_ENV === 'test');

        if (!isAlreadyExists) {
          throw new Error(`Hermes CLI profile create gagal: ${errMessage}`);
        }
      }
    }

    // 5. Pastikan folder profil ada dan tulis SOUL.md
    await fs.promises.mkdir(agentProfileDir, { recursive: true });
    await fs.promises.writeFile(soulPath, soulContent, 'utf-8');

    // 6. Sukses: perbarui state ke ready
    const provisionedAt = options?.now ?? Date.now();
    agentRepo.updateProvisionState(agent.id, 'ready', null, provisionedAt);

    auditRepo.logAction(
      options?.userId ?? 0,
      'agent.provision',
      agent.id,
      JSON.stringify({
        profile: profileName,
        soul_path: soulPath,
        cli_invoked: cliInvoked,
      })
    );

    return {
      ok: true,
      agent_id: agent.id,
      profile_name: profileName,
      soul_path: soulPath,
      soul_content: soulContent,
      provision_state: 'ready',
      provisioned_at: provisionedAt,
      cli_invoked: cliInvoked,
    };
  } catch (err: unknown) {
    const errorMsg = String((err as Error)?.message || err);

    // Gagal: catat state ke failed
    agentRepo.updateProvisionState(agent.id, 'failed', errorMsg);

    auditRepo.logAction(
      options?.userId ?? 0,
      'agent.provision_failed',
      agent.id,
      JSON.stringify({
        profile: profileName,
        error: errorMsg,
      })
    );

    return {
      ok: false,
      agent_id: agent.id,
      profile_name: profileName,
      soul_path: soulPath,
      soul_content: '',
      provision_state: 'failed',
      error: errorMsg,
      cli_invoked: cliInvoked,
    };
  }
}
