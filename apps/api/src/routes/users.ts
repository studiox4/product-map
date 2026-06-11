import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { userCreate, userUpdate, USER_COLORS } from '@productmap/shared';
import { users } from '@productmap/db';
import { db } from '../db';

export const usersRoutes = new Hono()
  .get('/', async (c) => {
    const rows = await db.select().from(users).orderBy(asc(users.createdAt));
    return c.json(rows);
  })
  .post(
    '/',
    zValidator('json', userCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const body = c.req.valid('json');
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const color = USER_COLORS[count % USER_COLORS.length];
      const [row] = await db.insert(users).values({ name: body.name, color }).returning();
      return c.json(row, 201);
    },
  )
  .patch(
    '/:id',
    zValidator('json', userUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const updates = c.req.valid('json');
      const set: Partial<typeof users.$inferInsert> = {};
      if (updates.name !== undefined) set.name = updates.name;
      if (updates.color !== undefined) set.color = updates.color;
      if (Object.keys(set).length === 0) {
        const [existing] = await db.select().from(users).where(eq(users.id, id));
        if (!existing) return c.json({ error: 'not_found' }, 404);
        return c.json(existing);
      }
      const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    },
  );
