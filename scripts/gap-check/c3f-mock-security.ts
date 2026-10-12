import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { GapCheckContext, CheckResult } from './types.js';

export interface C3fOptions {
  skipProcessExecution?: boolean;
  customMockResult1?: boolean;
  customMockResult2?: boolean;
}

export function run(ctx: GapCheckContext, options?: C3fOptions): CheckResult {
  const issues: string[] = [];

  // 1. Static check: Production code does not statically import mock-hermes
  const serverSrcDir = path.join(ctx.rootDir, 'apps', 'server', 'src');

  function scanFile(filePath: string) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) return;
    if (filePath.includes('.test.') || filePath.includes('.spec.')) return;
    // client-factory is the ONLY authorized dynamic/guarded factory
    if (filePath.endsWith('client-factory.ts')) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    if (/from\s*['"][^'"]*mock-hermes/i.test(content)) {
      const rel = path.relative(ctx.rootDir, filePath).replace(/\\/g, '/');
      issues.push(`${rel} imports mock-hermes directly outside config-guarded client factory`);
    }
  }

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist') {
        walk(full);
      } else if (e.isFile()) {
        scanFile(full);
      }
    }
  }

  walk(serverSrcDir);

  // 2. Child process execution checks (Rule S3 & C3f)
  if (!options?.skipProcessExecution) {
    // Check A: NODE_ENV=production + HERMES_MODE=mock must exit non-zero
    const testScript = `
      try {
        await import('./apps/server/src/config.ts');
        process.exit(0);
      } catch (err) {
        process.exit(1);
      }
    `;

    const res1 = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', testScript],
      {
        cwd: ctx.rootDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          HERMES_MODE: 'mock',
          TELEGRAM_BOT_TOKEN: 'valid_prod_token',
          OWNER_TELEGRAM_IDS: '123456789',
          HERMES_KEY_DEFAULT: 'valid_prod_key',
        },
        encoding: 'utf-8',
      }
    );

    const check1Passed = options?.customMockResult1 !== undefined ? options.customMockResult1 : res1.status !== 0;
    if (!check1Passed) {
      issues.push('Server config ALLOWED starting with NODE_ENV=production and HERMES_MODE=mock (must refuse to start)');
    }

    // Check B: NODE_ENV=production + DEV_AUTH_BYPASS=1 must exit non-zero
    const res2 = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', testScript],
      {
        cwd: ctx.rootDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          HERMES_MODE: 'real',
          DEV_AUTH_BYPASS: '1',
          TELEGRAM_BOT_TOKEN: 'valid_prod_token',
          OWNER_TELEGRAM_IDS: '123456789',
          HERMES_KEY_DEFAULT: 'valid_prod_key',
        },
        encoding: 'utf-8',
      }
    );

    const check2Passed = options?.customMockResult2 !== undefined ? options.customMockResult2 : res2.status !== 0;
    if (!check2Passed) {
      issues.push('Server config ALLOWED starting with NODE_ENV=production and DEV_AUTH_BYPASS=1 (must refuse to start)');
    }
  }

  return {
    category: 'Mock Production Gate (C3f)',
    passed: issues.length === 0,
    message:
      issues.length === 0
        ? 'Verified: Mock mode and DEV_AUTH_BYPASS throw in production; zero unguarded mock imports'
        : `${issues.length} mock production security guard violations`,
    details: issues,
  };
}
