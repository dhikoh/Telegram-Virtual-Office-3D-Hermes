import fs from 'node:fs';
import path from 'node:path';
import { EnvSchema, SECRET_KEY_PATTERN } from '../../apps/server/src/env-schema.js';
import type { GapCheckContext, CheckResult } from './types.js';

export interface C3dOptions {
  customEnvSchemaContent?: string;
  customEnvExampleContent?: string;
  customCoolifyContent?: string;
}

export function run(ctx: GapCheckContext, options?: C3dOptions): CheckResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const envSchemaPath = path.join(ctx.rootDir, 'apps', 'server', 'src', 'env-schema.ts');
  const envSchemaContent =
    options?.customEnvSchemaContent ??
    (fs.existsSync(envSchemaPath) ? fs.readFileSync(envSchemaPath, 'utf-8') : '');

  const envExamplePath = path.join(ctx.rootDir, '.env.example');
  const envExampleContent =
    options?.customEnvExampleContent ??
    (fs.existsSync(envExamplePath) ? fs.readFileSync(envExamplePath, 'utf-8') : '');

  const coolifyDocPath = path.join(ctx.rootDir, 'docs', 'DEPLOY_COOLIFY.md');
  const coolifyContent =
    options?.customCoolifyContent ??
    (fs.existsSync(coolifyDocPath) ? fs.readFileSync(coolifyDocPath, 'utf-8') : '');

  // 1. Audit env-schema.ts for forbidden .default() on secrets
  const schemaLines = envSchemaContent.split('\n');
  for (const line of schemaLines) {
    const keyMatch = line.match(/^\s*([A-Z0-9_]+)\s*:/);
    if (keyMatch) {
      const varName = keyMatch[1];
      if (SECRET_KEY_PATTERN.test(varName) && /\.default\(/.test(line)) {
        issues.push(
          `Secret env variable "${varName}" has a forbidden zod .default() in env-schema.ts (Rule R6/F-03)`
        );
      }
    }
  }

  // 2. Collect all schema keys
  const schemaKeys = Object.keys(EnvSchema.shape);

  // 3. Scan apps/server/src for process.env.X
  const scannedKeys = new Set<string>();
  const scanDirs = [
    path.join(ctx.rootDir, 'apps', 'server', 'src'),
  ];

  function scanFile(filePath: string) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) return;
    if (filePath.includes('.test.') || filePath.includes('.spec.')) return;
    const code = fs.readFileSync(filePath, 'utf-8');
    const matches = code.matchAll(/process\.env\.([A-Z0-9_]+)/g);
    for (const m of matches) {
      scannedKeys.add(m[1]);
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

  scanDirs.forEach(walk);

  // Combined required keys
  const allRequiredKeys = new Set([...schemaKeys, ...scannedKeys]);

  // 4. Parse documented keys from .env.example
  const exampleKeys = new Set<string>();
  for (const line of envExampleContent.split('\n')) {
    const m = line.match(/^\s*#?\s*([A-Z0-9_]+)=/);
    if (m) {
      exampleKeys.add(m[1]);
    }
  }

  // 5. Verify every required key is in .env.example and docs/DEPLOY_COOLIFY.md
  for (const key of allRequiredKeys) {
    // Allow patterns like HERMES_KEY_<AGENTID> if HERMES_KEY_* is documented
    const isHermesKeyPattern = /^HERMES_KEY_/.test(key);
    const documentedInExample =
      exampleKeys.has(key) || (isHermesKeyPattern && exampleKeys.has('HERMES_KEY_DEFAULT'));

    if (!documentedInExample) {
      issues.push(`Environment variable "${key}" is read in code but missing from .env.example`);
    }

    const inCoolify = coolifyContent.includes(`\`${key}\``) || (isHermesKeyPattern && coolifyContent.includes('HERMES_KEY_DEFAULT'));
    if (!inCoolify) {
      issues.push(`Environment variable "${key}" is missing from docs/DEPLOY_COOLIFY.md configuration guide`);
    }
  }

  // 6. Check unused example keys (warning only)
  for (const exKey of exampleKeys) {
    if (!allRequiredKeys.has(exKey) && !exKey.startsWith('HERMES_KEY_AGENT_')) {
      warnings.push(`Documented env var "${exKey}" in .env.example is not read by server schema`);
    }
  }

  return {
    category: 'Environment Variables (C3d)',
    passed: issues.length === 0,
    message:
      issues.length === 0
        ? `Clean: ${allRequiredKeys.size} env variables verified across schema, .env.example, and Coolify guide (0 unsafe secret defaults)`
        : `${issues.length} environment variable audit discrepancies detected`,
    details: issues.length > 0 ? issues : (warnings.length > 0 ? warnings : undefined),
  };
}
