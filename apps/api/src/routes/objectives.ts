// Mounted at /api/objectives (app.ts).
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq } from 'drizzle-orm';
import { objectiveCreate, objectiveUpdate } from '@productmap/shared';
import { objectives } from '@productmap/db';
import { db } from '../db';
import { currentUser, type CurrentUserEnv } from '../middleware/current-user';

export const objectivesRoutes = new Hono<CurrentUserEnv>()
  .use('*', currentUser)
  .get('/', async (c) => {
    const rows = await db.select().from(objectives).orderBy(asc(objectives.createdAt));
    return c.json(rows);
  })
  .post(
    '/',
    zValidator('json', objectiveCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const body = c.req.valid('json');
      const [row] = await db.insert(objectives).values(body).returning();
      return c.json(row, 201);
    },
  )
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const [row] = await db.select().from(objectives).where(eq(objectives.id, id));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  })
  .patch(
    '/:id',
    zValidator('json', objectiveUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const updates = c.req.valid('json');
      const [row] = await db.update(objectives).set(updates).where(eq(objectives.id, id)).returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await db.delete(objectives).where(eq(objectives.id, id)).returning({ id: objectives.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });
