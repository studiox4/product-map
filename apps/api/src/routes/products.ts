import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { productUpdate } from '@productmap/shared';
import { products } from '@productmap/db';
import { db } from '../db';

export const productsRoutes = new Hono().patch(
  '/:id',
  zValidator('json', productUpdate, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'validation', issues: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const id = c.req.param('id');
    const updates = c.req.valid('json');
    const [row] = await db.update(products).set(updates).where(eq(products.id, id)).returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    const { createdAt: _createdAt, ...product } = row;
    return c.json(product);
  },
);
