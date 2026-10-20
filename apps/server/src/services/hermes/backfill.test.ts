import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../../db/migrator.js';
import { AgentRepository } from '../../db/repositories/agents.js';
import { runProvisionBackfill } from './backfill.js';

describe('Provisioning Backfill Service (apps/server/src/services/hermes/backfill.ts)', () => {
  let db: BetterSqlite3.Database;
  let agentRepo: AgentRepository;
  let tempProfilesDir: string;

  beforeEach(async () => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    agentRepo = new AgentRepository(db);

    tempProfilesDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'backfill-test-'));
  });

  afterEach(async () => {
    db.close();
    try {
      await fs.promises.rm(tempProfilesDir, { recursive: true, force: true });
    } catch {
      // ignore temp dir cleanup errors
    }
  });

  it('runs dry-run without writing files or modifying database', async () => {
    const now = Date.now();
    agentRepo.create({
      id: 'agent_backfill_1',
      name: 'Orion Boss',
      role: 'Orchestrator',
      department: 'command',
      avatar: '👑',
      soul_summary: 'Orkestrasi sistem.',
      hermes_base_url: '',
      api_key_env: 'KEY',
      hermes_profile: 'default',
      active: 1,
      hired_at: now,
      created_at: now,
    });

    const result = await runProvisionBackfill({
      db,
      dryRun: true,
      profilesDir: tempProfilesDir,
      skipCli: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.succeeded).toBe(0);

    const agentItem = result.agents.find((a) => a.id === 'agent_backfill_1');
    expect(agentItem).toBeDefined();
    expect(agentItem?.status).toBe('dry-run');
    expect(agentItem?.profile).toBe('orion-boss');

    // DB remains unprovisioned
    const dbAgent = agentRepo.getById('agent_backfill_1');
    expect(dbAgent?.provision_state).toBe('unprovisioned');

    // File not created
    const soulFile = path.join(tempProfilesDir, 'orion-boss', 'SOUL.md');
    expect(fs.existsSync(soulFile)).toBe(false);
  });

  it('executes live backfill, provisions unprovisioned agents, and skips on second run', async () => {
    const now = Date.now();
    agentRepo.create({
      id: 'agent_legacy',
      name: 'Legacy Agent',
      role: 'Legacy Worker',
      department: 'finance',
      avatar: '💰',
      soul_summary: 'Finance reporting.',
      hermes_base_url: '',
      api_key_env: 'KEY',
      hermes_profile: 'default',
      active: 1,
      hired_at: now,
      created_at: now,
    });

    // 1. Live backfill
    const result1 = await runProvisionBackfill({
      db,
      dryRun: false,
      profilesDir: tempProfilesDir,
      skipCli: true,
    });

    const agentItem1 = result1.agents.find((a) => a.id === 'agent_legacy');
    expect(agentItem1?.status).toBe('provisioned');

    // DB state is ready
    const dbAgent1 = agentRepo.getById('agent_legacy');
    expect(dbAgent1?.provision_state).toBe('ready');
    expect(dbAgent1?.hermes_profile).toBe('legacy-agent');

    // File created on disk
    const soulFile = path.join(tempProfilesDir, 'legacy-agent', 'SOUL.md');
    expect(fs.existsSync(soulFile)).toBe(true);

    // 2. Second run without force skips already-provisioned agent
    const result2 = await runProvisionBackfill({
      db,
      dryRun: false,
      profilesDir: tempProfilesDir,
      skipCli: true,
    });

    const agentItem2 = result2.agents.find((a) => a.id === 'agent_legacy');
    expect(agentItem2?.status).toBe('skipped');

    // 3. Third run with force re-provisions
    const result3 = await runProvisionBackfill({
      db,
      dryRun: false,
      force: true,
      profilesDir: tempProfilesDir,
      skipCli: true,
    });

    const agentItem3 = result3.agents.find((a) => a.id === 'agent_legacy');
    expect(agentItem3?.status).toBe('provisioned');
  });
});
