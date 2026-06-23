import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq } from 'drizzle-orm';
import { userUpdate } from '@productmap/shared';
import { users } from '@productmap/db/schema';
import { db } from '../db';
import { publicUser } from '../lib/auth/serialize';
import { type CurrentUserEnv } from '../middleware/current-user';

export const usersRoutes = new Hono<CurrentUserEnv>()
  .get('/', async (c) => {
    return c.json((await db.select().from(users).orderBy(asc(users.createdAt))).map(publicUser));
  })
  .patch(
    '/:id',
    zValidator('json', userUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const me = c.get('currentUser');
      if (me.id !== c.req.param('id') && me.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
      const id = c.req.param('id');
      const updates = c.req.valid('json');
      const set: Partial<typeof users.$inferInsert> = {};
      if (updates.name !== undefined) set.name = updates.name;
      if (updates.color !== undefined) set.color = updates.color;
      if (Object.keys(set).length === 0) {
        const [existing] = await db.select().from(users).where(eq(users.id, id));
        if (!existing) return c.json({ error: 'not_found' }, 404);
        return c.json(publicUser(existing));
      }
      const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(publicUser(row));
    },
  );
