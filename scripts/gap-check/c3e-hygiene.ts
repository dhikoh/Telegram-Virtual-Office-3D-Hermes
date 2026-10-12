import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { GapCheckContext, CheckResult } from './types.js';

export interface C3eOptions {
  customDirs?: string[];
  customDistDir?: string;
  skipDistCheck?: boolean;
}

export function run(ctx: GapCheckContext, options?: C3eOptions): CheckResult {
  const issues: string[] = [];
  const scanDirs = options?.customDirs ?? [
    path.join(ctx.rootDir, 'packages'),
    path.join(ctx.rootDir, 'apps'),
  ];

  // 1. Code source text hygiene
  function scanFile(filePath: string) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
    // Skip test files from console.log/hygiene check
    const isTest = filePath.includes('.test.') || filePath.includes('.spec.');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const relPath = path.relative(ctx.rootDir, filePath).replace(/\\/g, '/');

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      if (/TODO\b/i.test(line) && !line.includes('TODO(verify)')) {
        issues.push(`${relPath}:${lineNum} - TODO without (verify) tag`);
      }
      if (/FIXME\b/i.test(line)) {
        issues.push(`${relPath}:${lineNum} - FIXME forbidden in codebase`);
      }
      if (/\bnot implemented\b/i.test(line)) {
        issues.push(`${relPath}:${lineNum} - "not implemented" stub detected`);
      }
      if (/\blorem\b/i.test(line)) {
        issues.push(`${relPath}:${lineNum} - "lorem" placeholder text found`);
      }
      if (!isTest && /console\.log\(/i.test(line)) {
        issues.push(`${relPath}:${lineNum} - console.log forbidden in production code (use logger)`);
      }
      if (
        !isTest &&
        /(:\s*any\b|<any>|\bas\s+any\b)/.test(line) &&
        !line.includes('//') &&
        !line.includes('/*') &&
        !line.trim().startsWith('*')
      ) {
        issues.push(`${relPath}:${lineNum} - 'any' type cast without comment justification`);
      }
    });
  }

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist') {
        walk(p);
      } else if (e.isFile()) {
        scanFile(p);
      }
    }
  }

  scanDirs.forEach(walk);

  // 2. Phase 9 Rules (3D static imports, named imports, no remote URLs)
  if (ctx.currentPhase >= 9) {
    const assetsMd = path.join(ctx.rootDir, 'docs', 'ASSETS.md');
    const phoneTestMd = path.join(ctx.rootDir, 'docs', '3D_PHONE_TEST.md');
    if (!fs.existsSync(assetsMd)) issues.push('docs/ASSETS.md catalog file missing');
    if (!fs.existsSync(phoneTestMd)) issues.push('docs/3D_PHONE_TEST.md test script missing');

    const entryFiles = [
      path.join(ctx.rootDir, 'apps', 'web', 'src', 'main.tsx'),
      path.join(ctx.rootDir, 'apps', 'web', 'src', 'App.tsx'),
      path.join(ctx.rootDir, 'apps', 'web', 'src', 'screens', 'Office.tsx'),
    ];

    for (const f of entryFiles) {
      if (fs.existsSync(f)) {
        const lines = fs.readFileSync(f, 'utf-8').split('\n');
        lines.forEach((line, idx) => {
          if (/^\s*import\b.*from\s*['"](three|@react-three\/fiber|@react-three\/drei)['"]/.test(line)) {
            issues.push(`${path.basename(f)}:${idx + 1} - Static 3D import from main bundle`);
          }
        });
      }
    }

    const office3dDir = path.join(ctx.rootDir, 'apps', 'web', 'src', 'components', 'office', 'office-3d');
    if (fs.existsSync(office3dDir)) {
      const files = fs.readdirSync(office3dDir).filter((x) => x.endsWith('.tsx') || x.endsWith('.ts'));
      for (const f of files) {
        const full = path.join(office3dDir, f);
        const code = fs.readFileSync(full, 'utf-8');
        if (/import\s+\*\s+as\s+THREE/i.test(code)) {
          issues.push(`${f} - Wildcard import (import * as THREE) forbidden (Rule 4B)`);
        }
        if (/https?:\/\//i.test(code)) {
          issues.push(`${f} - Remote URL found in 3D source (Rule 9.4 CSP violation)`);
        }
      }
    }
  }

  // 3. Built dist scan (F-08 & A-1)
  const distDir = options?.customDistDir ?? path.join(ctx.rootDir, 'apps', 'web', 'dist');
  if (!options?.skipDistCheck && fs.existsSync(distDir)) {
    const forbiddenPatterns = ['127.0.0.1', '8642', 'host.docker.internal', 'HERMES_KEY', 'api_key_env'];
    const assetsDir = path.join(distDir, 'assets');

    if (fs.existsSync(assetsDir)) {
      const assetFiles = fs.readdirSync(assetsDir);
      for (const file of assetFiles) {
        if (file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.html')) {
          const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
          for (const pattern of forbiddenPatterns) {
            if (content.includes(pattern)) {
              issues.push(`dist/${file} contains forbidden string "${pattern}" (Rule S4/F-08 violation)`);
            }
          }
        }
      }

      // A-1: 3D chunk gzip size check (<= 700 KB)
      const office3dChunk = assetFiles.find((f) => f.startsWith('Office3D-') && f.endsWith('.js'));
      if (office3dChunk) {
        const chunkBuf = fs.readFileSync(path.join(assetsDir, office3dChunk));
        const gzipped = zlib.gzipSync(chunkBuf);
        const gzipKb = gzipped.length / 1024;
        if (gzipKb > 700) {
          issues.push(`3D chunk ${office3dChunk} exceeds 700 KB budget: ${gzipKb.toFixed(2)} KB gzip (REQ-118/A-1)`);
        }
      }
    }
  }

  return {
    category: 'Code Hygiene & Quality (C3e)',
    passed: issues.length === 0,
    message:
      issues.length === 0
        ? 'Clean: No forbidden stubs, unannotated any, client secret leakage, or 3D budget violations'
        : `${issues.length} code hygiene and security violations detected`,
    details: issues,
  };
}
