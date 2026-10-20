/**
 * CLI Runner Sinkronisasi & Auto-Install Skill Hermes (Fase 6)
 * Memeriksa dan menyalin katalog skill lokal di repo ke instalasi Hermes host.
 *
 * Penggunaan CLI:
 *   npm run skills:sync -- --dry-run
 *   npm run skills:sync
 *   npm run skills:sync -- --force
 */

import fs from 'node:fs';
import path from 'node:path';

// 1. Muat .env jika ada
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// 2. Set fallback default untuk CLI
if (!process.env.TELEGRAM_BOT_TOKEN) {
  process.env.TELEGRAM_BOT_TOKEN = 'cli_sync_token';
}
if (!process.env.OWNER_TELEGRAM_IDS) {
  process.env.OWNER_TELEGRAM_IDS = '1';
}
if (!process.env.HERMES_KEY_DEFAULT) {
  process.env.HERMES_KEY_DEFAULT = 'cli_sync_key';
}

const {
  checkSkillSyncStatus,
  syncSkills,
  resolveHermesSkillsDir,
  resolveLocalSkillsDir,
} = await import('../apps/server/dist/services/hermes/skill-sync.js');

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`
Hermes Skill Auto-Sync CLI Runner (Fase 6)

Penggunaan:
  npm run skills:sync                 Sinkronisasi skill yang belum terpasang
  npm run skills:sync -- --dry-run     Tampilkan status tanpa menyalin berkas
  npm run skills:sync -- --force       Paksa timpa seluruh berkas skill
  npm run skills:sync -- --help        Tampilkan bantuan ini
\n`);
    process.exit(0);
  }

  const localDir = resolveLocalSkillsDir();
  const targetDir = resolveHermesSkillsDir();

  process.stdout.write(`
======================================================
     HERMES SKILL AUTO-INSTALL & SYNC (FASE 6)
======================================================
Direktori Katalog Repo  : ${localDir}
Direktori Target Hermes : ${targetDir}
Mode                    : ${isDryRun ? 'DRY-RUN (Simulasi)' : isForce ? 'FORCE (Timpa)' : 'NORMAL'}
======================================================
\n`);

  const status = await checkSkillSyncStatus();

  process.stdout.write(`Status Awal:\n`);
  process.stdout.write(`- Total Skill di Repo : ${status.total_local}\n`);
  process.stdout.write(`- Total Terpasang     : ${status.total_installed}\n`);
  process.stdout.write(`- Belum Terpasang     : ${status.missing_names.length > 0 ? status.missing_names.join(', ') : '(Nihil - Sudah Selaras)'}\n`);

  if (status.gateway_error) {
    process.stdout.write(`- Catatan Gateway     : ${status.gateway_error}\n`);
  }

  if (isDryRun) {
    process.stdout.write(`\n[DRY-RUN] Selesai tanpa perubahan berkas.\n`);
    process.exit(0);
  }

  if (status.in_sync && !isForce) {
    process.stdout.write(`\n✅ Seluruh katalog skill repo sudah terpasang di target Hermes.\n`);
    process.exit(0);
  }

  process.stdout.write(`\nMenjalankan sinkronisasi berkas...\n`);
  const result = await syncSkills({ force: isForce });

  if (result.synced.length > 0) {
    process.stdout.write(`✅ Berhasil disinkronkan (${result.synced.length}): ${result.synced.join(', ')}\n`);
  }
  if (result.already_installed.length > 0) {
    process.stdout.write(`ℹ️ Sudah terpasang (${result.already_installed.length}): ${result.already_installed.join(', ')}\n`);
  }
  if (result.failed.length > 0) {
    process.stdout.write(`❌ Gagal disinkronkan (${result.failed.length}):\n`);
    for (const f of result.failed) {
      process.stdout.write(`   - ${f.name}: ${f.error}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`\n🎉 SINKRONISASI SKILL SELESAI DENGAN SUKSES.\n\n`);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err?.message || err}\n`);
  process.exit(1);
});
