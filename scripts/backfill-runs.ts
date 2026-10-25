/**
 * Backfill Run & Task Lama (Fix Run Reliability).
 *
 * Bukti produksi (25 Okt 2026): `agent_runs` 10 baris (7 nyangkut 'running'),
 * `tasks` hanya 1 baris, `agent_messages` 20 baris. Riwayat sesi lama Orion
 * (api_1792114894_2d7e0f0f), Aura (api_1791934674_69e30bf5), dan Bagas
 * (api_1792417581_d0fd29fd) ada di state.db Hermes, bukan di office.sqlite.
 *
 * Yang dikerjakan script ini:
 *  1. Tutup run 'running' yang sudah mati menjadi 'interrupted' (T2).
 *  2. Untuk setiap run yang sudah selesai TAPI belum punya task, buat tepat
 *     satu task dari run_events (judul dari pesan user, isi dari delta
 *     assistant). Idempoten: `getByRunId` + indeks UNIQUE partial
 *     `idx_tasks_run_id_chat_unique` (migrasi 013, hanya source='chat').
 *  3. agent_messages yang hilang untuk sesi lama diisi dari run_events
 *     (pesan user dari event 'run.started' bila ada client_message_id, dan
 *     jawaban assistant dari gabungan delta).
 *
 * Sumber data hanya office.sqlite milik aplikasi ini — state.db Hermes TIDAK
 * dibaca (pemilik VPS yang mengelolanya, dan isinya bukan milik repo ini).
 * Yang bisa diperoleh dari repo diperoleh; yang tidak bisa ditulis sebagai
 * OPEN QUESTION di laporan, bukan ditebak.
 *
 * Penggunaan CLI:
 *   npm run backfill:runs -- --dry-run
 *   npm run backfill:runs -- --apply
 */
import fs from 'node:fs';
import path from 'node:path';

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

if (!process.env.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = 'cli_backfill_token';
if (!process.env.OWNER_TELEGRAM_IDS) process.env.OWNER_TELEGRAM_IDS = '1';
if (!process.env.HERMES_KEY_DEFAULT) process.env.HERMES_KEY_DEFAULT = 'cli_backfill_key';

const BetterSqlite3 = (await import('better-sqlite3')).default;
const { runMigrations } = await import('../apps/server/src/db/migrator.js');
const { reapStaleRuns } = await import(
  '../apps/server/src/services/agent-chat/stale-run-reaper.js'
);
const { stripIdentity } = await import(
  '../apps/server/src/services/hermes/identity-scope.js'
);

export interface BackfillRunSummary {
  runId: string;
  agentId: string;
  action: 'task_created' | 'task_exists' | 'run_closed' | 'message_created' | 'skipped';
  detail?: string;
}

export interface BackfillRunsResult {
  dryRun: boolean;
  runsClosed: number;
  tasksCreated: number;
  messagesCreated: number;
  items: BackfillRunSummary[];
  /** Sesi lama yang dicari tetapi tidak punya run sama sekali di DB aplikasi. */
  sessionsWithoutRuns: string[];
}

export interface BackfillRunsOptions {
  dryRun?: boolean;
  db?: import('better-sqlite3').Database;
  dbPath?: string;
  /** Sesi lama yang menjadi target backfill (id sesi gateway). */
  targetSessions?: string[];
}

/** Sesi lama yang disebut di brief — dipakai bila pemanggil tidak memberi daftar. */
export const LEGACY_SESSIONS = [
  'api_1792114894_2d7e0f0f',
  'api_1791934674_69e30bf5',
  'api_1792417581_d0fd29fd',
];

/**
 * Kumpulkan jawaban assistant dan pesan user untuk satu run dari run_events.
 * Delta disusun berurutan; `run.started` membawa client_message_id bila ada.
 */
function readRunFacts(
  db: import('better-sqlite3').Database,
  runId: string
): { assistantText: string; clientMessageId: string | null; startedAt: number | null } {
  const rows = db
    .prepare('SELECT type, payload_json, ts FROM run_events WHERE run_id = ? ORDER BY id ASC')
    .all(runId) as { type: string; payload_json: string; ts: number }[];

  let assistantText = '';
  let clientMessageId: string | null = null;
  let startedAt: number | null = null;

  for (const row of rows) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.payload_json) as Record<string, unknown>;
    } catch {
      data = {};
    }
    if (row.type === 'message.delta' && typeof data.delta === 'string') {
      assistantText += data.delta;
    }
    if (row.type === 'run.started') {
      if (typeof data.client_message_id === 'string') clientMessageId = data.client_message_id;
      startedAt = row.ts;
    }
  }

  return { assistantText, clientMessageId, startedAt };
}

/** Pesan user untuk satu run: dari agent_messages (paling akurat), kalau tidak ada null. */
function readUserMessage(
  db: import('better-sqlite3').Database,
  runId: string,
  clientMessageId: string | null
): string | null {
  const byRun = db
    .prepare(
      "SELECT content FROM agent_messages WHERE run_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1"
    )
    .get(runId) as { content: string } | undefined;
  if (byRun?.content) return byRun.content;

  if (clientMessageId) {
    const byClient = db
      .prepare(
        "SELECT content FROM agent_messages WHERE client_message_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1"
      )
      .get(clientMessageId) as { content: string } | undefined;
    if (byClient?.content) return byClient.content;
  }
  return null;
}

export function runBackfillRuns(options: BackfillRunsOptions = {}): BackfillRunsResult {
  const dryRun = Boolean(options.dryRun);
  const targetSessions = options.targetSessions ?? LEGACY_SESSIONS;

  let db = options.db;
  let shouldClose = false;
  if (!db) {
    const resolvedDbPath =
      options.dbPath || process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'office.sqlite');
    if (!fs.existsSync(resolvedDbPath)) {
      throw new Error(`Database tidak ditemukan: ${resolvedDbPath}`);
    }
    db = new BetterSqlite3(resolvedDbPath);
    shouldClose = true;
  }

  const items: BackfillRunSummary[] = [];
  let runsClosed = 0;
  let tasksCreated = 0;
  let messagesCreated = 0;

  try {
    runMigrations(db);

    // 1. Tutup run nyangkut lebih dulu — supaya backfill tidak mengisi task
    //    untuk run yang ternyata sudah mati.
    const reaped = reapStaleRuns(db, { dryRun });
    runsClosed = reaped.closed.length;
    for (const run of reaped.closed) {
      items.push({
        runId: run.id,
        agentId: run.agent_id,
        action: 'run_closed',
        detail: `started_at=${run.started_at}`,
      });
    }

    // 2. Setiap run yang sudah terminal (completed/failed/interrupted) dan
    //    belum punya task → buat tepat satu task dari run_events.
    const runs = db
      .prepare(
        `SELECT id, agent_id, session_id, status FROM agent_runs
         WHERE status IN ('completed', 'failed', 'interrupted')
         ORDER BY started_at ASC`
      )
      .all() as { id: string; agent_id: string; session_id: string | null; status: string }[];

    for (const run of runs) {
      const existingTask = db
        .prepare('SELECT id FROM tasks WHERE run_id = ? LIMIT 1')
        .get(run.id) as { id: string } | undefined;
      if (existingTask) {
        items.push({ runId: run.id, agentId: run.agent_id, action: 'task_exists' });
        continue;
      }

      const facts = readRunFacts(db, run.id);
      const userMessage = readUserMessage(db, run.id, facts.clientMessageId);

      // Run yang gagal sebelum ada tool/delta apa pun: tidak ada yang bisa
      // dilaporkan sebagai pekerjaan — dilewati, bukan dikarang.
      if (!assistantTextIsUsable(facts.assistantText) && !userMessage) {
        items.push({
          runId: run.id,
          agentId: run.agent_id,
          action: 'skipped',
          detail: 'tidak ada isi untuk dimaterialkan',
        });
        continue;
      }

      const now = Date.now();
      const title = makeTitle(userMessage ?? facts.assistantText);
      const taskId = `task_backfill_${now}_${Math.random().toString(36).substring(2, 6)}`;
      const status = run.status === 'failed' ? 'failed' : 'done';
      const resultMd =
        facts.assistantText.trim() ||
        (run.status === 'failed' ? 'Run lama gagal sebelum menghasilkan jawaban.' : 'Backfill run lama.');

      if (!dryRun) {
        // INSERT OR IGNORE: jaring pengaman lapis dua. getByRunId sudah
        // diperiksa di atas, dan indeks UNIQUE partial migrasi 013 menolak
        // duplikat untuk source 'chat' — OR IGNORE membuat backfill yang
        // terpicu dua kali tidak melempar, hanya melewati baris yang ada.
        db.prepare(
          `INSERT OR IGNORE INTO tasks (id, title, description, agent_id, priority, status, run_id,
             result_md, due_at, created_by, created_at, updated_at, source, tool_calls_count)
           VALUES (?, ?, '', ?, 'normal', ?, ?, ?, NULL, 1, ?, ?, 'chat', 0)`
        ).run(taskId, title, run.agent_id, status, run.id, resultMd, now, now);

        tasksCreated++;
        items.push({
          runId: run.id,
          agentId: run.agent_id,
          action: 'task_created',
          detail: `status=${status}`,
        });
      } else {
        // Dry-run: hitung yang AKAN dibuat, tapi tidak menulis dan tidak
        // menaikkan penghitung "dibuat".
        items.push({
          runId: run.id,
          agentId: run.agent_id,
          action: 'task_created',
          detail: `status=${status} (dry-run)`,
        });
      }

      // 3. agent_messages assistant yang hilang untuk run ini.
      if (assistantTextIsUsable(facts.assistantText) && !dryRun) {
        const hasAssistant = db
          .prepare(
            "SELECT 1 AS x FROM agent_messages WHERE run_id = ? AND role = 'assistant' LIMIT 1"
          )
          .get(run.id) as { x: number } | undefined;
        if (!hasAssistant) {
          db.prepare(
            `INSERT INTO agent_messages (id, agent_id, run_id, client_message_id, role, content,
               status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?, ?)`
          ).run(
            `msg_backfill_${now}_${Math.random().toString(36).substring(2, 6)}`,
            run.agent_id,
            run.id,
            facts.clientMessageId,
            facts.assistantText,
            status === 'failed' ? 'partial' : 'completed',
            facts.startedAt ?? now,
            now
          );
          messagesCreated++;
          items.push({
            runId: run.id,
            agentId: run.agent_id,
            action: 'message_created',
          });
        }
      }
    }

    // 4. Sesi lama yang tidak punya run sama sekali di DB aplikasi: dicatat
    //    jujur sebagai OPEN QUESTION, bukan ditebak isinya.
    const sessionsWithoutRuns = targetSessions.filter((sid) => {
      const row = db
        .prepare('SELECT 1 AS x FROM agent_runs WHERE session_id = ? LIMIT 1')
        .get(sid) as { x: number } | undefined;
      return !row;
    });

    return { dryRun, runsClosed, tasksCreated, messagesCreated, items, sessionsWithoutRuns };
  } finally {
    if (shouldClose && db) db.close();
  }
}

function assistantTextIsUsable(text: string): boolean {
  return text.trim().length > 0;
}

function makeTitle(text: string): string {
  // Pesan user bisa berprefiks blok identitas (fix identitas) — blok itu milik
  // aplikasi, bukan milik pemilik, jadi tidak boleh jadi judul task.
  const clean = stripIdentity(text.trim().replace(/\s+/g, ' '));
  if (!clean) return 'Tugas Backfill';
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

function parseArgs(args: string[]): { dryRun?: boolean; apply?: boolean; dbPath?: string } {
  const options: { dryRun?: boolean; apply?: boolean; dbPath?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') continue;
    if (arg === '--dry-run' || arg === '-d' || arg.includes('dry-run')) options.dryRun = true;
    else if (arg === '--apply' || arg.includes('apply')) options.apply = true;
    else if (arg === '--db-path' || arg.startsWith('--db-path=')) {
      options.dbPath = arg.includes('=') ? arg.split('=')[1] : args[++i];
    }
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('backfill-runs.ts') || process.argv[1].endsWith('backfill-runs.js'));

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
  // Tanpa --apply berarti dry-run: backfill menyentuh data produksi, jadi
  // eksekusi nyata harus diminta eksplisit.
  const dryRun = !opts.apply;

  process.stdout.write(
    `\n=== BACKFILL RUN & TASK ===\nMode: ${dryRun ? 'DRY-RUN (Simulasi)' : 'APPLY (Eksekusi Nyata)'}\n\n`
  );

  try {
    const result = runBackfillRuns({ dryRun, dbPath: opts.dbPath });

    process.stdout.write(`Run nyangkut ditutup : ${result.runsClosed}\n`);
    process.stdout.write(`Task dibuat         : ${result.tasksCreated}\n`);
    process.stdout.write(`Pesan assistant dibuat: ${result.messagesCreated}\n\n`);

    if (result.items.length > 0) {
      process.stdout.write('Rincian:\n');
      for (const item of result.items) {
        process.stdout.write(
          `  [${item.action}] run=${item.runId} agen=${item.agentId}${
            item.detail ? ` (${item.detail})` : ''
          }\n`
        );
      }
      process.stdout.write('\n');
    }

    if (result.sessionsWithoutRuns.length > 0) {
      process.stdout.write('OPEN QUESTION — sesi lama tanpa run di DB aplikasi:\n');
      for (const sid of result.sessionsWithoutRuns) {
        process.stdout.write(`  ${sid}\n`);
      }
      process.stdout.write(
        '  Riwayatnya hanya ada di state.db Hermes (milik VPS, bukan repo ini).\n' +
          '  Tidak ditebak — perlu keputusan pemilik.\n\n'
      );
    }
  } catch (err) {
    process.stderr.write(`Backfill error fatal: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
