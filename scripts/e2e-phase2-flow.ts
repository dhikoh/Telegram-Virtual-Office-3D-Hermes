import crypto from 'node:crypto';
import BetterSqlite3 from 'better-sqlite3';
import { MockHermesServer } from '../tools/mock-hermes/dist/server.js';
import { buildServer } from '../apps/server/dist/server.js';
import { runMigrations } from '../apps/server/dist/db/migrator.js';

function createTelegramInitData(user: { id: number; first_name: string; username?: string }, botToken: string): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(user),
  });
  const sorted = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.append('hash', hash);
  return params.toString();
}

async function runE2E(): Promise<void> {
  const botToken = 'mock_telegram_bot_token';
  const ownerUser = { id: 123456789, first_name: 'CEO', username: 'owner_virtual' };
  const authHeader = `tma ${createTelegramInitData(ownerUser, botToken)}`;

  // 1. Start Mock Hermes
  const mockHermes = new MockHermesServer(8642);
  await mockHermes.start();
  process.stdout.write('Mock Hermes listening on :8642\n');

  // 2. Start Office Server
  const db = new BetterSqlite3(':memory:');
  runMigrations(db);
  const app = buildServer({ db });
  await app.listen({ port: 3001, host: '127.0.0.1' });
  const serverUrl = 'http://127.0.0.1:3001';
  process.stdout.write('Office Server listening on :3001\n\n');

  try {
    // Step A: Create Agent
    process.stdout.write('=== STEP A: CREATE AGENT ===\n');
    const agentRes = await fetch(`${serverUrl}/api/agents`, {
      method: 'POST',
      headers: { authorization: authHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'agent_commander_01',
        name: 'Athena Prime',
        role: 'Chief of Staff',
        department: 'command',
        avatar: '🏛️',
        soul_summary: 'Central command coordinator',
        hermes_base_url: 'http://127.0.0.1:8642',
        api_key_env: 'HERMES_KEY_DEFAULT',
        hermes_profile: 'command',
        active: 1,
        hired_at: Date.now(),
        created_at: Date.now(),
      }),
    });
    const agent = await agentRes.json();
    process.stdout.write(`Created Agent: ${JSON.stringify(agent, null, 2)}\n\n`);

    // Step B: Create Task
    process.stdout.write('=== STEP B: CREATE TASK ===\n');
    const taskRes = await fetch(`${serverUrl}/api/tasks`, {
      method: 'POST',
      headers: { authorization: authHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Eksekusi pemindahan alokasi anggaran server cloud',
        description: 'Persetujuan diperlukan untuk memindahkan anggaran $5,000.',
        agent_id: 'agent_commander_01',
        priority: 'urgent',
      }),
    });
    const task = await taskRes.json();
    process.stdout.write(`Created Task: ${JSON.stringify(task, null, 2)}\n\n`);

    // Step C: Run Task
    process.stdout.write('=== STEP C: RUN TASK ===\n');
    const runRes = await fetch(`${serverUrl}/api/tasks/${task.id}/run`, {
      method: 'POST',
      headers: { authorization: authHeader },
    });
    const runData = await runRes.json();
    process.stdout.write(`Run Dispatched: ${JSON.stringify(runData, null, 2)}\n\n`);

    // Step D: Wait for Approval Request
    process.stdout.write('=== STEP D: RECEIVE APPROVAL EVENT ===\n');
    await new Promise((r) => setTimeout(r, 800));

    const approvalsRes = await fetch(`${serverUrl}/api/approvals`, {
      headers: { authorization: authHeader },
    });
    const approvals = await approvalsRes.json();
    process.stdout.write(`Approvals in Queue: ${JSON.stringify(approvals, null, 2)}\n\n`);

    const pending = approvals.find((a: any) => a.run_id === runData.run_id);
    if (!pending) throw new Error('Pending approval not found');

    // Step E: Resolve Approval
    process.stdout.write('=== STEP E: RESOLVE APPROVAL ===\n');
    const resolveRes = await fetch(`${serverUrl}/api/approvals/${pending.id}/resolve`, {
      method: 'POST',
      headers: { authorization: authHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    const resolveData = await resolveRes.json();
    process.stdout.write(`Approval Resolved: ${JSON.stringify(resolveData, null, 2)}\n\n`);

    // Step F: Verify Task Completed
    process.stdout.write('=== STEP F: FINAL TASK STATUS ===\n');
    await new Promise((r) => setTimeout(r, 600));

    const allTasksRes = await fetch(`${serverUrl}/api/tasks`, {
      headers: { authorization: authHeader },
    });
    const allTasks = await allTasksRes.json();
    const finalTask = allTasks.find((t: any) => t.id === task.id);
    process.stdout.write(`Final Task State: ${JSON.stringify(finalTask, null, 2)}\n\n`);

    process.stdout.write('🎉 Acceptance E2E scripted flow completed successfully!\n');
  } finally {
    await app.close();
    db.close();
    await mockHermes.stop();
  }
}

runE2E().catch((err) => {
  process.stderr.write(`E2E flow failed: ${err}\n`);
  process.exit(1);
});
