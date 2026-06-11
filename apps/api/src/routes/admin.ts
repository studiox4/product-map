import { Hono } from 'hono';
import { seedDemo } from '@productmap/db/seed-data';
import { db } from '../db';
import { markdownToTiptap } from '../lib/markdown';

// POST /api/admin/reset-demo — truncate everything and re-run the demo seed.
// Dev-only convenience; hard-blocked in production.
export const adminRoutes = new Hono().post('/reset-demo', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'forbidden', message: 'reset-demo is disabled in production' }, 403);
  }
  await seedDemo(db, markdownToTiptap);
  return c.json({ ok: true });
});
