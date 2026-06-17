import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { projectUpdate } from '@productmap/shared';
import { projects } from '@productmap/db';
import { db } from '../db';

export const projectsRoutes = new Hono().patch(
  '/:id',
  zValidator('json', projectUpdate, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'validation', issues: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const id = c.req.param('id');
    const updates = c.req.valid('json');
    const [row] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    const { createdAt: _createdAt, ...project } = row;
    return c.json(project);
  },
);
