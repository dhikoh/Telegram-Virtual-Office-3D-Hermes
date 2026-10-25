/**
 * CLI Reaper Run Nyangkut (Fix Run Reliability).
 *
 * Menutup run berstatus 'running' yang sudah mati menjadi 'interrupted'
 * dengan finished_at terisi — gejala produksi 25 Okt 2026: 7 run 'running'
 * tanpa finished_at, UI nempel "sedang mengetik..." selamanya.
 *
 * Penggunaan CLI:
 *   npm run runs:reap -- --dry-run     (hanya mencetak, tidak menulis)
 *   npm run runs:reap                  (menutup sungguhan)
 *   npm run runs:reap -- --older-than 60   (ambang khusus, menit)
 */
import fs from 'node:fs';
import path from 'node:path';

// 1. Muat .env jika ada sebelum modul konfigurasi diimpor (pola sama dengan
//    scripts/provision-backfill.ts — CLI harus bisa jalan tanpa set env manual).
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
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// 2. Fallback aman untuk CLI bila variabel belum terdefinisi.
if (!process.env.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = 'cli_reap_token';
if (!process.env.OWNER_TELEGRAM_IDS) process.env.OWNER_TELEGRAM_IDS = '1';
if (!process.env.HERMES_KEY_DEFAULT) process.env.HERMES_KEY_DEFAULT = 'cli_reap_key';

const { reapStaleRuns, STALE_RUN_MS } = await import(
  '../apps/server/dist/services/agent-chat/stale-run-reaper.js'
);

export { reapStaleRuns, STALE_RUN_MS };

interface ReapCliOptions {
  dryRun?: boolean;
  /** Ambang dalam MENIT (default 30). */
  olderThanMinutes?: number;
  dbPath?: string;
}

function parseArgs(args: string[]): ReapCliOptions {
  const options: ReapCliOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') continue;
    if (arg === '--dry-run' || arg === '-d' || arg.includes('dry-run')) {
      options.dryRun = true;
    } else if (arg === '--older-than' || arg.startsWith('--older-than=')) {
      const raw = arg.includes('=') ? arg.split('=')[1] : args[++i];
      const minutes = Number.parseInt(String(raw), 10);
      if (Number.isFinite(minutes) && minutes > 0) {
        options.olderThanMinutes = minutes;
      }
    } else if (arg === '--db-path' || arg.startsWith('--db-path=')) {
      options.dbPath = arg.includes('=') ? arg.split('=')[1] : args[++i];
    }
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('runs-reap.ts') || process.argv[1].endsWith('runs-reap.js'));

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
  const thresholdMs = (opts.olderThanMinutes ?? STALE_RUN_MS / 60000) * 60 * 1000;

  process.stdout.write(
    `\n=== REAPER RUN NYANGKUT ===\nMode: ${
      opts.dryRun ? 'DRY-RUN (Simulasi)' : 'LIVE (Eksekusi Nyata)'
    }\nAmbang: ${Math.round(thresholdMs / 60000)} menit\n\n`
  );

  const BetterSqlite3 = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('../apps/server/dist/db/migrator.js');

  const dbPath =
    opts.dbPath ||
    process.env.DB_PATH ||
    path.resolve(process.cwd(), 'data', 'office.sqlite');

  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`Database tidak ditemukan: ${dbPath}\n`);
    process.exit(1);
  }

  const db = new BetterSqlite3(dbPath);
  try {
    // Migrasi dulu supaya indeks 013 (idx_agent_runs_status_started) terpasang
    // sebelum query reaper berjalan.
    runMigrations(db);

    const result = reapStaleRuns(db, { thresholdMs, dryRun: opts.dryRun });

    if (result.closed.length === 0) {
      process.stdout.write('Tidak ada run nyangkut. Semua run sudah tertutup rapi.\n\n');
    } else {
      process.stdout.write(`Run yang ${opts.dryRun ? 'AKAN' : 'SUDAH'} ditutup: ${result.closed.length}\n`);
      for (const run of result.closed) {
        const age = Math.round((Date.now() - run.started_at) / 60000);
        process.stdout.write(
          `  ${run.id}  agen=${run.agent_id}  umur=${age} menit  model=${run.model ?? '-'}\n`
        );
      }
      process.stdout.write('\n');
    }

    const stillRunning = (
      db.prepare("SELECT COUNT(*) AS c FROM agent_runs WHERE status = 'running'").get() as {
        c: number;
      }
    ).c;
    process.stdout.write(`Sisa run berstatus 'running': ${stillRunning}\n\n`);
  } finally {
    db.close();
  }
}
