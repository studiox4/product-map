import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb } from '@productmap/db';
import { app } from './app';
import { configureDb } from './db';
import { mountWebStatic } from './serve-web';
import { assertConfig } from './config';
assertConfig(); // fail fast if AUTH_SECRET missing in production

// Build the node pg pool here (off the browser-reachable `app` graph) and inject
// it into the driver-agnostic db handle before any request is dispatched.
const connectionString =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap';
const { db: nodeDb } = createDb(connectionString);
configureDb(nodeDb);

// Repo root is two levels up from apps/api.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const uploadsDir = path.join(repoRoot, 'uploads');
mkdirSync(uploadsDir, { recursive: true });

// Serve uploaded files. serveStatic root is relative to process.cwd().
app.use(
  '/uploads/*',
  serveStatic({ root: path.relative(process.cwd(), repoRoot) || '.' })
);

// Production web serving: serve the built SPA + prerendered marketing when a
// build is present and SERVE_WEB is on. Mounted AFTER /api/* and /uploads/* so
// it never shadows them. Dev/test default (no dist / SERVE_WEB unset) = inactive.
const webDistDir = path.join(repoRoot, 'apps', 'web', 'dist');
mountWebStatic(app, {
  distDir: webDistDir,
  enabled: process.env.SERVE_WEB === '1' && existsSync(path.join(webDistDir, 'index.html')),
});

const port = Number(process.env.PORT ?? 3411);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
