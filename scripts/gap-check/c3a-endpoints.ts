import BetterSqlite3 from 'better-sqlite3';
import { buildServer } from '../../apps/server/src/server.js';
import { runMigrations } from '../../apps/server/src/db/migrator.js';
import { ENDPOINTS, type EndpointDefinition } from '../../packages/shared/src/endpoints.js';
import type { GapCheckContext, CheckResult } from './types.js';

export interface C3aOptions {
  customRoutes?: { method: string; path: string }[];
  customEndpoints?: readonly EndpointDefinition[];
}

export async function run(
  ctx: GapCheckContext,
  options?: C3aOptions
): Promise<CheckResult> {
  const currentPhase = ctx.currentPhase;
  if (currentPhase < 2) {
    return {
      category: 'Endpoints (C3a)',
      passed: true,
      message: `Phase ${currentPhase}: No server endpoints due yet (all due in Phase 2+)`,
    };
  }

  const endpointDefs = options?.customEndpoints ?? ENDPOINTS;
  const registeredRoutes: { method: string; path: string }[] = [];

  if (options?.customRoutes) {
    registeredRoutes.push(...options.customRoutes);
  } else {
    const db = new BetterSqlite3(':memory:');
    runMigrations(db);
    const app = buildServer({ db });

    app.addHook('onRoute', (routeOptions) => {
      const methods = Array.isArray(routeOptions.method)
        ? routeOptions.method
        : [routeOptions.method];
      for (const m of methods) {
        if (m !== 'HEAD' && routeOptions.url.startsWith('/api')) {
          registeredRoutes.push({ method: m, path: routeOptions.url });
        }
      }
    });

    await app.ready();
    await app.close();
    db.close();
  }

  const issues: string[] = [];

  // 1. Check endpoints due by current phase that are NOT registered
  const dueEndpoints = endpointDefs.filter((e) => e.phase <= currentPhase);
  for (const due of dueEndpoints) {
    const found = registeredRoutes.some(
      (r) => r.method === due.method && r.path === due.path
    );
    if (!found) {
      issues.push(`Missing registered handler: ${due.method} ${due.path} (due in Phase ${due.phase})`);
    }
  }

  // 2. Check registered /api routes that are NOT in endpoints.ts
  for (const reg of registeredRoutes) {
    const found = endpointDefs.some(
      (e) => e.method === reg.method && e.path === reg.path
    );
    if (!found) {
      issues.push(`Unlisted registered route in server: ${reg.method} ${reg.path} (not in endpoints.ts)`);
    }
  }

  return {
    category: 'Endpoints (C3a)',
    passed: issues.length === 0,
    message:
      issues.length === 0
        ? `All ${dueEndpoints.length} endpoints due by Phase ${currentPhase} are registered and match endpoints.ts`
        : `${issues.length} endpoint discrepancies detected`,
    details: issues,
  };
}
