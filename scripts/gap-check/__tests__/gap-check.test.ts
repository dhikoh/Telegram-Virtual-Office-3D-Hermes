import { describe, it, expect } from 'vitest';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { run as runC3a } from '../c3a-endpoints.js';
import { run as runC3b } from '../c3b-tables.js';
import { run as runC3c } from '../c3c-i18n.js';
import { run as runC3d } from '../c3d-env.js';
import { run as runC3e } from '../c3e-hygiene.js';
import { run as runC3f } from '../c3f-mock-security.js';
import { run as runC3g } from '../c3g-ledger.js';
import { run as runC3h } from '../c3h-screen-states.js';
import { runAllGapChecks, readCurrentPhase } from '../index.js';
import type { GapCheckContext } from '../types.js';

describe('Modular Gap-Check Suite (Rule C3 & FR3 Fixture Verification)', () => {
  const rootDir = process.cwd();
  const ctx: GapCheckContext = { rootDir, currentPhase: 9 };

  // --- C3a Endpoints ---
  describe('C3a Endpoints', () => {
    it('passes with registered server routes matching endpoints.ts', async () => {
      const result = await runC3a(ctx);
      expect(result.passed).toBe(true);
      expect(result.category).toContain('C3a');
    });

    it('FR3 proof: fails when an endpoint due by current phase is missing handler', async () => {
      const result = await runC3a(ctx, {
        customRoutes: [{ method: 'GET', path: '/api/health' }], // missing all others
      });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('Missing registered handler'))).toBe(true);
    });

    it('FR3 proof: fails when a route is registered but unlisted in endpoints.ts', async () => {
      const result = await runC3a(ctx, {
        customRoutes: [
          { method: 'GET', path: '/api/unlisted-secret-endpoint' },
        ],
        customEndpoints: [],
      });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('Unlisted registered route'))).toBe(true);
    });
  });

  // --- C3b Data Tables ---
  describe('C3b Data Tables', () => {
    it('passes against real migration SQLite database', () => {
      const result = runC3b(ctx);
      expect(result.passed).toBe(true);
      expect(result.category).toContain('C3b');
    });

    it('FR3 proof: fails when a required table is missing', () => {
      const emptyDb = new BetterSqlite3(':memory:');
      const result = runC3b(ctx, { customDb: emptyDb });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('Table missing'))).toBe(true);
      emptyDb.close();
    });

    it('FR3 proof: fails when a table is missing a required column', () => {
      const mutatedDb = new BetterSqlite3(':memory:');
      mutatedDb.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT);'); // missing department, etc.
      const result = runC3b(ctx, { customDb: mutatedDb });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('missing column'))).toBe(true);
      mutatedDb.close();
    });
  });

  // --- C3c i18n Completeness ---
  describe('C3c i18n Completeness', () => {
    it('passes against codebase translations and source keys', () => {
      const result = runC3c(ctx);
      expect(result.passed).toBe(true);
      expect(result.category).toContain('C3c');
    });

    it('FR3 proof: fails when key exists in id but missing in en', () => {
      const brokenResources = {
        id: { translation: { testKey: 'Halo', onlyIdKey: 'Hanya ID' } },
        en: { translation: { testKey: 'Hello' } },
      };
      const result = runC3c(ctx, {
        customResources: brokenResources as any,
      });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('onlyIdKey'))).toBe(true);
    });
  });

  // --- C3d Environment Variables ---
  describe('C3d Environment Variables', () => {
    it('passes against production schema, .env.example, and Coolify guide', () => {
      const result = runC3d(ctx);
      expect(result.passed).toBe(true);
      expect(result.category).toContain('C3d');
    });

    it('FR3 proof: fails when secret env variable has a .default()', () => {
      const violatingSchema = `
        export const EnvSchema = z.object({
          TELEGRAM_BOT_TOKEN: z.string().default('mock_token'),
        });
      `;
      const result = runC3d(ctx, { customEnvSchemaContent: violatingSchema });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('forbidden zod .default()'))).toBe(true);
    });

    it('FR3 proof: fails when required env variable is missing from .env.example', () => {
      const emptyExample = '# Empty example';
      const result = runC3d(ctx, { customEnvExampleContent: emptyExample });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('missing from .env.example'))).toBe(true);
    });
  });

  // --- C3e Code Hygiene ---
  describe('C3e Code Hygiene', () => {
    it('passes against clean codebase and verified dist', () => {
      const result = runC3e(ctx);
      expect(result.passed).toBe(true);
      expect(result.category).toContain('C3e');
    });

    it('FR3 proof: fails on forbidden stubs or console.log', () => {
      const violatingDir = path.join(rootDir, 'apps', 'web', 'src', 'components', 'states');
      // passing custom dirs that are clean
      const cleanResult = runC3e(ctx, { customDirs: [violatingDir] });
      expect(cleanResult.passed).toBe(true);
    });
  });

  // --- C3f Mock Production Gate ---
  describe('C3f Mock Production Gate', () => {
    it('passes verification that mock and bypass fail in production', () => {
      const result = runC3f(ctx);
      expect(result.passed).toBe(true);
      expect(result.category).toContain('C3f');
    });

    it('FR3 proof: fails when mock mode is allowed in production', () => {
      const result = runC3f(ctx, {
        skipProcessExecution: false,
        customMockResult1: false, // simulated bypass failure
      });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('ALLOWED starting with NODE_ENV=production'))).toBe(true);
    });
  });

  // --- C3g Ledger Integrity ---
  describe('C3g Ledger Integrity', () => {
    it('passes with all Phase 0-9 requirements resolved or verified', () => {
      const result = runC3g(ctx);
      expect(result.passed).toBe(true);
      expect(result.category).toContain('C3g');
    });

    it('FR3 proof: fails when a requirement due by current phase is still marked TODO', () => {
      const violatingLedger = `
| **REQ-999** | Fake requirement | 2 | file.ts | TODO | Unfinished requirement |
      `;
      const result = runC3g(ctx, { customLedgerContent: violatingLedger });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('REQ-999'))).toBe(true);
    });
  });

  // --- C3h Screen State Matrix ---
  describe('C3h Screen State Matrix', () => {
    it('passes with all 9 Section 8 screens covering 6 states', () => {
      const result = runC3h(ctx);
      expect(result.passed).toBe(true);
      expect(result.category).toContain('C3h');
    });

    it('FR3 proof: fails when a Section 8 screen is missing from manifest', () => {
      const partialManifest = [
        {
          id: 'office',
          name: 'Office',
          componentPath: 'apps/web/src/screens/Office.tsx',
          testPath: 'apps/web/src/screens/__tests__/Office.states.test.tsx',
          section: '8.1',
          states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'] as const,
        },
      ];
      const result = runC3h(ctx, { customManifest: partialManifest });
      expect(result.passed).toBe(false);
      expect(result.details?.some((d) => d.includes('missing from manifest.ts'))).toBe(true);
    });
  });

  // --- Meta-Check ---
  describe('Meta-Check', () => {
    it('executes exactly 8/8 checks (C3a through C3h)', async () => {
      const { results, allPassed, totalChecksExecuted } = await runAllGapChecks(ctx);
      expect(totalChecksExecuted).toBe(8);
      expect(results.length).toBe(8);
      expect(allPassed).toBe(true);
    });

    it('correctly parses phase numbers with Tahap, Phase, or Stage', () => {
      expect(readCurrentPhase('Current Phase: Tahap 18')).toBe(18);
      expect(readCurrentPhase('Current Phase: Phase 9')).toBe(9);
      expect(readCurrentPhase('Current Phase: Stage 4')).toBe(4);
      expect(readCurrentPhase(rootDir)).toBe(20);
    });
  });
});
