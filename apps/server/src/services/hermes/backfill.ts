import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from '../../db/migrator.js';
import { AgentRepository } from '../../db/repositories/agents.js';
import {
  provisionAgentProfile,
  resolveAgentProfileName,
} from './provisioner.js';

export interface BackfillOptions {
  dryRun?: boolean;
  force?: boolean;
  db?: BetterSqlite3.Database;
  dbPath?: string;
  profilesDir?: string;
  skipCli?: boolean;
}

export interface BackfillAgentSummary {
  id: string;
  name: string;
  role: string;
  profile: string;
  status: 'provisioned' | 'failed' | 'skipped' | 'dry-run';
  error?: string;
}

export interface BackfillResult {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  agents: BackfillAgentSummary[];
}

export async function runProvisionBackfill(
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);

  let db = options.db;
  let shouldCloseDb = false;

  if (!db) {
    const resolvedDbPath =
      options.dbPath ||
      process.env.DB_PATH ||
      path.resolve(process.cwd(), 'data', 'office.sqlite');

    const dbDir = path.dirname(resolvedDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new BetterSqlite3(resolvedDbPath);
    shouldCloseDb = true;
  }

  // Pastikan migrasi terbaru (termasuk 011_agent_provisioning) telah terpasang
  runMigrations(db);

  const agentRepo = new AgentRepository(db);
  const allAgents = agentRepo.getAll();

  const result: BackfillResult = {
    total: allAgents.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    dryRun,
    agents: [],
  };

  try {
    for (const agent of allAgents) {
      const profileSlug = resolveAgentProfileName(agent);
      const needsProvision =
        force ||
        !agent.provision_state ||
        agent.provision_state === 'unprovisioned' ||
        agent.provision_state === 'failed';

      if (!needsProvision) {
        result.skipped++;
        result.agents.push({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          profile: profileSlug,
          status: 'skipped',
        });
        continue;
      }

      result.processed++;

      if (dryRun) {
        result.agents.push({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          profile: profileSlug,
          status: 'dry-run',
        });
        continue;
      }

      const provResult = await provisionAgentProfile(agent, db, {
        profilesDir: options.profilesDir,
        skipCli: options.skipCli,
      });

      if (provResult.ok) {
        result.succeeded++;
        result.agents.push({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          profile: profileSlug,
          status: 'provisioned',
        });
      } else {
        result.failed++;
        result.agents.push({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          profile: profileSlug,
          status: 'failed',
          error: provResult.error || 'Unknown error',
        });
      }
    }

    return result;
  } finally {
    if (shouldCloseDb && db) {
      db.close();
    }
  }
}
