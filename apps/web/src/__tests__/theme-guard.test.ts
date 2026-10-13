/**
 * Tahap 2 guard — light neumorphic theme (docs/DESIGN_DIRECTION.md §7.1).
 *
 * The whole UI chrome was swept from dark-glass to light neumorphic tokens.
 * This test keeps the sweep honest: a new component must use semantic
 * `office-*` tokens, not the old dark literals that are invisible on the
 * light ground.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..'); // apps/web/src

/** Dark-glass literals that must not appear in app chrome anymore. */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\btext-white\b/, why: 'use text-office-text' },
  { pattern: /\bbg-white\//, why: 'use bg-office-hover' },
  { pattern: /\bborder-white\//, why: 'use border-office-border' },
  { pattern: /\bbg-black\//, why: 'use bg-office-inset' },
  { pattern: /\bbg-slate-9[0-9]0\b/, why: 'use bg-office-elevated' },
  { pattern: /\btext-slate-\d{3}\b/, why: 'use text-office-muted' },
  { pattern: /\bglow-(cyan|violet|warn|danger)\b/, why: 'neon glow is gone; use shadow-nu-raised' },
  { pattern: /\boffice-cyan\b/, why: 'use office-accent' },
  // Contrast additions after the first screenshot review (Tahap 2 polish):
  { pattern: /\btext-office-muted\//, why: 'faded ink drops below 4.5:1; use full text-office-muted' },
  { pattern: /\bhover:bg-violet-600\b/, why: 'raw Tailwind accent; use office token classes' },
  { pattern: /\bbg-office-violet text-office-text\b/, why: 'dark ink on violet fails contrast; use accent CTA or text-office-on-violet' },
  { pattern: /(?:text|bg|border|placeholder)-(?:slate|gray|neutral|zinc)-\d{3}/, why: 'raw palette outside the office token set' },
  // Three.js world colours (class utilities do not cover these):
  { pattern: /#(?:070B14|0B132B|0F172A|1E293B|22D3EE)/i, why: 'dark world / neon cyan is gone; Tahap 3 uses a light world' },
];

/** The 3D world was rewritten for light (Tahap 3), so it is scanned too. */
const SKIP_DIRS = new Set(['__tests__', 'node_modules']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('Tahap 2 — light neumorphic theme guard', () => {
  const files = walk(SRC);

  it('scans a meaningful number of source files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('uses no dark-glass literals in index.html shell', () => {
    const shell = readFileSync(join(SRC, '..', 'index.html'), 'utf-8');
    const violations = FORBIDDEN.filter(({ pattern }) => pattern.test(shell));
    expect(violations.map((v) => v.pattern.source)).toEqual([]);
  });

  it('uses no dark-glass literals in app chrome', () => {
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const { pattern, why } of FORBIDDEN) {
        const hits = content.match(new RegExp(pattern.source, 'g'));
        if (hits) {
          violations.push(
            `${file.replace(SRC, '')}: ${pattern.source} x${hits.length} (${why})`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
