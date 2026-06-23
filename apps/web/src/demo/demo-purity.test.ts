import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * G5 — drift guard. The demo reuses the REAL Hono `app` graph in the browser, so
 * any module that graph imports must stay free of node-only packages at the TOP
 * LEVEL (dynamic `import()` inside a handler the demo never calls is fine). If a
 * future change adds e.g. `import fs from 'node:fs'` to a route, the demo build
 * breaks silently — this test fails first instead.
 */
const API_SRC = resolve(__dirname, '../../../../apps/api/src');

// Packages/builtins that cannot load in a browser.
const BANNED = [
  'node:',
  'pg',
  '@node-rs/argon2',
  '@aws-sdk/',
  '@ai-sdk/',
  'archiver',
  'nodemailer',
  '@hono/node-server',
];

// The app graph: app.ts + everything it can reach. We scan all non-test source
// under apps/api/src EXCEPT the node entry points, which legitimately use node
// APIs and are never imported by the browser demo.
const NODE_ENTRY_ONLY = new Set(['index.ts', 'serve-web.ts']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    // Skip test-support dirs: never imported by the browser demo graph.
    if (statSync(p).isDirectory()) { if (name !== 'test') out.push(...walk(p)); }
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** A top-level static import line (not inside an `import(` expression). */
function topLevelImportSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const re = /^\s*import\b[^\n]*?from\s*['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) specs.push(m[1]!);
  // bare `import 'x'` side-effect imports
  const re2 = /^\s*import\s*['"]([^'"]+)['"]/gm;
  while ((m = re2.exec(src))) specs.push(m[1]!);
  return specs;
}

describe('demo graph purity (G5)', () => {
  it('no app-graph module top-level-imports a node-only package', () => {
    const offenders: string[] = [];
    for (const file of walk(API_SRC)) {
      const base = file.slice(API_SRC.length + 1);
      if (NODE_ENTRY_ONLY.has(base)) continue;
      const specs = topLevelImportSpecifiers(readFileSync(file, 'utf8'));
      for (const s of specs) {
        if (BANNED.some((b) => (b.endsWith(':') || b.endsWith('/') ? s.startsWith(b) : s === b))) {
          offenders.push(`${base}: import '${s}'`);
        }
      }
    }
    expect(offenders, `node-only top-level imports on the demo app graph:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no app-graph module reads process.env without a typeof guard', () => {
    // `process` is undefined in the browser. A bare `process.env` read throws.
    // config.ts owns the guarded `env()` helper; every other app-graph file that
    // touches process.env must also carry a `typeof process` guard.
    const offenders: string[] = [];
    for (const file of walk(API_SRC)) {
      const base = file.slice(API_SRC.length + 1);
      if (NODE_ENTRY_ONLY.has(base) || base === 'config.ts') continue;
      const src = readFileSync(file, 'utf8');
      if (src.includes('process.env') && !src.includes('typeof process')) {
        offenders.push(base);
      }
    }
    expect(offenders, `unguarded process.env on the demo app graph:\n${offenders.join('\n')}`).toEqual([]);
  });
});
