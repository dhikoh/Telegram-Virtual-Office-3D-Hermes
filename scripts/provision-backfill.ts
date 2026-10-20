/**
 * Script Backfill Provisioning Profil Hermes (Fase 3 — REQ-083 & REQ-084)
 * Menyelaraskan seluruh profil agen lama ke format profil Hermes per agen
 * dengan berkas SOUL.md mandiri dan state SQLite yang terisolasi.
 *
 * Penggunaan CLI:
 *   npm run provision:backfill -- --dry-run
 *   npm run provision:backfill
 *   npm run provision:backfill -- --force
 */

import fs from 'node:fs';
import path from 'node:path';

// 1. Muat .env jika ada sebelum modul konfigurasi diimpor
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

// 2. Set fallback default aman untuk CLI script jika variabel belum terdefinisi
if (!process.env.TELEGRAM_BOT_TOKEN) {
  process.env.TELEGRAM_BOT_TOKEN = 'cli_backfill_token';
}
if (!process.env.OWNER_TELEGRAM_IDS) {
  process.env.OWNER_TELEGRAM_IDS = '1';
}
if (!process.env.HERMES_KEY_DEFAULT) {
  process.env.HERMES_KEY_DEFAULT = 'cli_backfill_key';
}

const { runProvisionBackfill } = await import(
  '../apps/server/dist/services/hermes/backfill.js'
);

export type {
  BackfillOptions,
  BackfillResult,
  BackfillAgentSummary,
} from '../apps/server/dist/services/hermes/backfill.js';

export { runProvisionBackfill };

// CLI Execution Wrapper
function parseArgs(args: string[]): {
  dryRun?: boolean;
  force?: boolean;
  skipCli?: boolean;
  profilesDir?: string;
  dbPath?: string;
} {
  const options: {
    dryRun?: boolean;
    force?: boolean;
    skipCli?: boolean;
    profilesDir?: string;
    dbPath?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') continue;
    if (arg === '--dry-run' || arg === '-d' || arg.includes('dry-run')) {
      options.dryRun = true;
    } else if (arg === '--force' || arg === '-f' || arg.includes('force')) {
      options.force = true;
    } else if (arg === '--skip-cli' || arg.includes('skip-cli')) {
      options.skipCli = true;
    } else if (arg === '--profiles-dir' || arg.startsWith('--profiles-dir=')) {
      if (arg.includes('=')) {
        options.profilesDir = arg.split('=')[1];
      } else if (args[i + 1]) {
        options.profilesDir = args[++i];
      }
    } else if (arg === '--db-path' || arg.startsWith('--db-path=')) {
      if (arg.includes('=')) {
        options.dbPath = arg.split('=')[1];
      } else if (args[i + 1]) {
        options.dbPath = args[++i];
      }
    }
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('provision-backfill.ts') ||
    process.argv[1].endsWith('provision-backfill.js'));

if (isDirectRun) {
  const rawArgs = [...process.argv.slice(2)];
  if (process.env.npm_config_argv) {
    try {
      const parsed = JSON.parse(process.env.npm_config_argv);
      if (Array.isArray(parsed.remain)) rawArgs.push(...parsed.remain);
      if (Array.isArray(parsed.original)) rawArgs.push(...parsed.original);
    } catch {}
  }
  const opts = parseArgs(rawArgs);

  process.stdout.write(
    `\n=== HERMES PROFILE PROVISIONING BACKFILL ===\nMode: ${
      opts.dryRun ? 'DRY-RUN (Simulasi)' : 'LIVE (Eksekusi Nyata)'
    }\nForce Re-provision: ${opts.force ? 'Ya' : 'Tidak'}\n\n`
  );

  runProvisionBackfill(opts)
    .then((res: {
      total: number;
      processed: number;
      skipped: number;
      succeeded: number;
      failed: number;
      agents: {
        id: string;
        name: string;
        role: string;
        profile: string;
        status: string;
        error?: string;
      }[];
    }) => {
      process.stdout.write(`Total Agen Terdaftar: ${res.total}\n`);
      process.stdout.write(`Agen Diproses: ${res.processed}\n`);
      process.stdout.write(`Agen Dilewati (Sudah Siap): ${res.skipped}\n\n`);

      for (const a of res.agents) {
        const icon =
          a.status === 'provisioned'
            ? '✅'
            : a.status === 'failed'
            ? '❌'
            : a.status === 'dry-run'
            ? '🔍'
            : '⏭️';
        const errText = a.error ? ` (Error: ${a.error})` : '';
        process.stdout.write(
          `${icon} [${a.status.toUpperCase()}] ${a.name} (${a.role}) -> profile: ${a.profile}${errText}\n`
        );
      }

      process.stdout.write(
        `\nHasil: ${res.succeeded} berhasil, ${res.failed} gagal, ${res.skipped} dilewati.\n\n`
      );

      if (res.failed > 0) {
        process.exit(1);
      }
    })
    .catch((err: Error) => {
      process.stderr.write(`Backfill error fatal: ${err.message}\n`);
      process.exit(1);
    });
}
