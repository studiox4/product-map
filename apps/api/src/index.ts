import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { app } from './app';

// Repo root is two levels up from apps/api.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const uploadsDir = path.join(repoRoot, 'uploads');
mkdirSync(uploadsDir, { recursive: true });

// Serve uploaded files. serveStatic root is relative to process.cwd().
app.use(
  '/uploads/*',
  serveStatic({ root: path.relative(process.cwd(), repoRoot) || '.' })
);

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
