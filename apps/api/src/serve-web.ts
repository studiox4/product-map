import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface WebStaticOptions {
  /** Absolute path to the built web dist/ directory. */
  distDir: string;
  /** Whether serving is active (e.g. SERVE_WEB=1 AND dist present). */
  enabled: boolean;
}

/**
 * Mount production web static serving on an existing Hono app. Call AFTER
 * /api/* and /uploads/* are registered so this never shadows them.
 *
 * Behavior when enabled:
 *  - exact GET /            → prerendered dist/marketing.html
 *  - GET /<existing file>   → static asset from dist/ (serveStatic)
 *  - any other non-API GET  → SPA shell (dist/index.html) [history fallback]
 *
 * When disabled, this registers nothing (dev/test default unaffected).
 */
export function mountWebStatic(app: Hono<any, any, any>, opts: WebStaticOptions): void {
  if (!opts.enabled) return;

  const { distDir } = opts;
  const marketingPath = path.join(distDir, 'marketing.html');
  const shellPath = path.join(distDir, 'index.html');

  // Exact GET / → prerendered marketing.
  app.get('/', (c) => {
    if (existsSync(marketingPath)) {
      return c.html(readFileSync(marketingPath, 'utf8'));
    }
    if (existsSync(shellPath)) {
      return c.html(readFileSync(shellPath, 'utf8'));
    }
    return c.notFound();
  });

  // Static assets from dist/. serveStatic root is relative to process.cwd().
  app.use(
    '/*',
    serveStatic({
      root: path.relative(process.cwd(), distDir) || '.',
    }),
  );

  // History fallback: any remaining GET (non-API, no matching file) → SPA shell.
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.notFound();
    if (existsSync(shellPath)) {
      return c.html(readFileSync(shellPath, 'utf8'));
    }
    return c.notFound();
  });
}
