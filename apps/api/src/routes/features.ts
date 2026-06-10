import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { featureCreate, featureUpdate } from '@productmap/shared';
import { features, documents, products } from '@productmap/db';
import { db } from '../db';

const horizonOrder = sql`case ${features.horizon} when 'now' then 0 when 'next' then 1 else 2 end`;

const docMetaColumns = {
  id: documents.id,
  featureId: documents.featureId,
  type: documents.type,
  title: documents.title,
  status: documents.status,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

async function docsForFeatures(featureIds: string[]) {
  if (featureIds.length === 0) return new Map<string, unknown[]>();
  const rows = await db
    .select(docMetaColumns)
    .from(documents)
    .where(inArray(documents.featureId, featureIds))
    .orderBy(asc(documents.createdAt));
  const byFeature = new Map<string, unknown[]>();
  for (const row of rows) {
    const list = byFeature.get(row.featureId) ?? [];
    list.push(row);
    byFeature.set(row.featureId, list);
  }
  return byFeature;
}

export const featuresRoutes = new Hono()
  .get('/', async (c) => {
    const rows = await db
      .select()
      .from(features)
      .orderBy(horizonOrder, asc(features.sortOrder), asc(features.createdAt));
    const docs = await docsForFeatures(rows.map((f) => f.id));
    return c.json(rows.map((f) => ({ ...f, documents: docs.get(f.id) ?? [] })));
  })
  .post(
    '/',
    zValidator('json', featureCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const body = c.req.valid('json');
      const [product] = await db.select({ id: products.id }).from(products).limit(1);
      if (!product) return c.json({ error: 'not_found' }, 404);
      const [row] = await db
        .insert(features)
        .values({ productId: product.id, title: body.title, horizon: body.horizon })
        .returning();
      return c.json(row, 201);
    },
  )
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const [row] = await db.select().from(features).where(eq(features.id, id));
    if (!row) return c.json({ error: 'not_found' }, 404);
    const docs = await docsForFeatures([row.id]);
    return c.json({ ...row, documents: docs.get(row.id) ?? [] });
  })
  .patch(
    '/:id',
    zValidator('json', featureUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const updates = c.req.valid('json');
      const [row] = await db
        .update(features)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(features.id, id))
        .returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await db.delete(features).where(eq(features.id, id)).returning({ id: features.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });
