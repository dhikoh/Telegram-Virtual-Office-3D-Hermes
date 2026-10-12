import fs from 'node:fs';
import path from 'node:path';
import { resources } from '../../apps/web/src/i18n/index.js';
import type { GapCheckContext, CheckResult } from './types.js';

export interface C3cOptions {
  customResources?: typeof resources;
  customSrcDir?: string;
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

export function run(ctx: GapCheckContext, options?: C3cOptions): CheckResult {
  const currentPhase = ctx.currentPhase;
  if (currentPhase < 3) {
    return {
      category: 'i18n Completeness (C3c)',
      passed: true,
      message: `Phase ${currentPhase}: UI i18n due in Phase 3 (pending)`,
    };
  }

  const res = options?.customResources ?? resources;
  const webSrcDir = options?.customSrcDir ?? path.join(ctx.rootDir, 'apps', 'web', 'src');

  const idKeys = new Set(flattenKeys(res.id.translation as Record<string, unknown>));
  const enKeys = new Set(flattenKeys(res.en.translation as Record<string, unknown>));

  const issues: string[] = [];
  const warnings: string[] = [];

  // 1. Check id and en key sets are identical
  for (const k of idKeys) {
    if (!enKeys.has(k)) {
      issues.push(`Key "${k}" present in id but missing in en`);
    }
  }
  for (const k of enKeys) {
    if (!idKeys.has(k)) {
      issues.push(`Key "${k}" present in en but missing in id`);
    }
  }

  // 2. Scan code in apps/web/src for t(), i18n.t(), and <Trans i18nKey=...>
  const usedKeys = new Set<string>();

  function scanFile(filePath: string) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
    // Skip test files from i18n key audit
    if (filePath.includes('.test.') || filePath.includes('.spec.')) return;
    if (filePath.endsWith('i18n/index.ts')) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const rel = path.relative(ctx.rootDir, filePath).replace(/\\/g, '/');

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Match literal keys: t('...'), t("..."), i18n.t('...'), i18n.t("...")
      const literalMatches = line.matchAll(/\b(?:i18n\.)?t\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const m of literalMatches) {
        usedKeys.add(m[1]);
        if (!idKeys.has(m[1])) {
          issues.push(`${rel}:${lineNum} - Key "${m[1]}" missing in id translation`);
        }
        if (!enKeys.has(m[1])) {
          issues.push(`${rel}:${lineNum} - Key "${m[1]}" missing in en translation`);
        }
      }

      // Match Trans i18nKey: <Trans i18nKey="..."
      const transMatches = line.matchAll(/<Trans[^>]*i18nKey=['"]([^'"]+)['"]/g);
      for (const m of transMatches) {
        usedKeys.add(m[1]);
        if (!idKeys.has(m[1])) {
          issues.push(`${rel}:${lineNum} - Key "${m[1]}" missing in id translation`);
        }
        if (!enKeys.has(m[1])) {
          issues.push(`${rel}:${lineNum} - Key "${m[1]}" missing in en translation`);
        }
      }

      // Match non-literal t(): t(variable) or t(fn()) without literal quotes
      const nonLiteral = line.match(/\b(?:i18n\.)?t\(\s*([a-zA-Z0-9_$.]+)\s*\)/);
      if (nonLiteral && !/^['"]/.test(nonLiteral[1])) {
        // Must have // i18n-dynamic: <prefix> on this line or previous line
        const prevLine = idx > 0 ? lines[idx - 1] : '';
        const dynMatch =
          line.match(/\/\/\s*i18n-dynamic:\s*([a-zA-Z0-9_.-]+)/) ||
          prevLine.match(/\/\/\s*i18n-dynamic:\s*([a-zA-Z0-9_.-]+)/);
        if (!dynMatch) {
          issues.push(
            `${rel}:${lineNum} - Non-literal t(${nonLiteral[1]}) call without "// i18n-dynamic: <prefix>" annotation`
          );
        } else {
          const prefix = dynMatch[1];
          const matchingKeys = Array.from(idKeys).filter((k) => k.startsWith(prefix));
          if (matchingKeys.length === 0) {
            issues.push(
              `${rel}:${lineNum} - i18n-dynamic prefix "${prefix}" has zero matching keys in translation`
            );
          } else {
            matchingKeys.forEach((k) => usedKeys.add(k));
          }
        }
      }
    });
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

  walk(webSrcDir);

  // 3. Unused keys: warning only
  for (const k of idKeys) {
    if (!usedKeys.has(k)) {
      warnings.push(`Unused translation key: "${k}"`);
    }
  }

  return {
    category: 'i18n Completeness (C3c)',
    passed: issues.length === 0,
    message:
      issues.length === 0
        ? `Clean: ${usedKeys.size} keys verified across id and en translations (${warnings.length} unused keys)`
        : `${issues.length} i18n completeness issues detected`,
    details: issues.length > 0 ? issues : (warnings.length > 0 ? warnings.slice(0, 5) : undefined),
  };
}
