import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { featureCreate, featureUpdate, collaboratorsPut } from '@productmap/shared';
import { features, documents, products, activity, featureCollaborators, users } from '@productmap/db';
import { db } from '../db';
import { currentUser, type CurrentUserEnv } from '../middleware/current-user';
import { recordActivity, addCollaborator } from '../lib/activity';

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

export const featuresRoutes = new Hono<CurrentUserEnv>()
  .use('*', currentUser)
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
      const user = c.get('currentUser');
      const [product] = await db.select({ id: products.id }).from(products).limit(1);
      if (!product) return c.json({ error: 'not_found' }, 404);
      const [row] = await db
        .insert(features)
        .values({
          productId: product.id,
          title: body.title,
          horizon: body.horizon,
          createdBy: user?.id ?? null,
          updatedBy: user?.id ?? null,
        })
        .returning();
      await recordActivity(row.id, user?.id, 'feature_created', { to: row.title });
      await addCollaborator(row.id, user?.id);
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
      const user = c.get('currentUser');
      const [prev] = await db.select().from(features).where(eq(features.id, id));
      if (!prev) return c.json({ error: 'not_found' }, 404);
      const [row] = await db
        .update(features)
        .set({ ...updates, updatedBy: user?.id ?? null, updatedAt: sql`now()` })
        .where(eq(features.id, id))
        .returning();

      if (updates.horizon !== undefined && row.horizon !== prev.horizon) {
        await recordActivity(id, user?.id, 'horizon_changed', { from: prev.horizon, to: row.horizon });
      }
      if (updates.status !== undefined && row.status !== prev.status) {
        await recordActivity(id, user?.id, 'status_changed', { from: prev.status, to: row.status });
      }
      if (
        (updates.startDate !== undefined || updates.endDate !== undefined) &&
        (row.startDate !== prev.startDate || row.endDate !== prev.endDate)
      ) {
        await recordActivity(id, user?.id, 'dates_changed', {
          from: { startDate: prev.startDate, endDate: prev.endDate },
          to: { startDate: row.startDate, endDate: row.endDate },
        });
      }
      if (updates.descriptionMd !== undefined && row.descriptionMd !== prev.descriptionMd) {
        await recordActivity(id, user?.id, 'description_edited');
      }
      await addCollaborator(id, user?.id);
      return c.json(row);
    },
  )
  .get('/:id/activity', async (c) => {
    const id = c.req.param('id');
    const [feature] = await db.select({ id: features.id }).from(features).where(eq(features.id, id));
    if (!feature) return c.json({ error: 'not_found' }, 404);
    const rows = await db
      .select({
        id: activity.id,
        featureId: activity.featureId,
        actorId: activity.actorId,
        actorName: users.name,
        actorColor: users.color,
        kind: activity.kind,
        payload: activity.payload,
        createdAt: activity.createdAt,
      })
      .from(activity)
      .innerJoin(users, eq(activity.actorId, users.id))
      .where(eq(activity.featureId, id))
      .orderBy(desc(activity.createdAt))
      .limit(50);
    return c.json(rows);
  })
  .get('/:id/collaborators', async (c) => {
    const id = c.req.param('id');
    const [feature] = await db.select({ id: features.id }).from(features).where(eq(features.id, id));
    if (!feature) return c.json({ error: 'not_found' }, 404);
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        color: users.color,
        createdAt: users.createdAt,
      })
      .from(featureCollaborators)
      .innerJoin(users, eq(featureCollaborators.userId, users.id))
      .where(eq(featureCollaborators.featureId, id))
      .orderBy(asc(users.createdAt));
    return c.json(rows);
  })
  .put(
    '/:id/collaborators',
    zValidator('json', collaboratorsPut, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const { userIds } = c.req.valid('json');
      const [feature] = await db.select({ id: features.id }).from(features).where(eq(features.id, id));
      if (!feature) return c.json({ error: 'not_found' }, 404);
      await db.delete(featureCollaborators).where(eq(featureCollaborators.featureId, id));
      if (userIds.length > 0) {
        await db
          .insert(featureCollaborators)
          .values(userIds.map((userId) => ({ featureId: id, userId })))
          .onConflictDoNothing();
      }
      return c.body(null, 204);
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await db.delete(features).where(eq(features.id, id)).returning({ id: features.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });
