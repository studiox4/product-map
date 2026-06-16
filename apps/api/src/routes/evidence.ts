// Dream-tier evidence routes. Mounted at /api in app.ts, so paths here are
// /features/:id/evidence and /evidence/:id.
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq } from 'drizzle-orm';
import { evidenceCreate } from '@productmap/shared';
import { evidence, features, users } from '@productmap/db';
import { db } from '../db';
import { type CurrentUserEnv } from '../middleware/current-user';

const evidenceColumns = {
  id: evidence.id,
  featureId: evidence.featureId,
  kind: evidence.kind,
  title: evidence.title,
  bodyMd: evidence.bodyMd,
  sourceUrl: evidence.sourceUrl,
  weight: evidence.weight,
  createdBy: evidence.createdBy,
  createdByName: users.name,
  createdByColor: users.color,
  createdAt: evidence.createdAt,
};

async function featureExists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: features.id }).from(features).where(eq(features.id, id));
  return Boolean(row);
}

export const evidenceRoutes = new Hono<CurrentUserEnv>()
  .get('/features/:id/evidence', async (c) => {
    const featureId = c.req.param('id');
    if (!(await featureExists(featureId))) return c.json({ error: 'not_found' }, 404);
    const rows = await db
      .select(evidenceColumns)
      .from(evidence)
      .leftJoin(users, eq(evidence.createdBy, users.id))
      .where(eq(evidence.featureId, featureId))
      .orderBy(asc(evidence.createdAt));
    return c.json(rows);
  })
  .post(
    '/features/:id/evidence',
    zValidator('json', evidenceCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const featureId = c.req.param('id');
      const body = c.req.valid('json');
      const user = c.get('currentUser');
      if (!(await featureExists(featureId))) return c.json({ error: 'not_found' }, 404);

      const [row] = await db
        .insert(evidence)
        .values({
          featureId,
          kind: body.kind,
          title: body.title,
          bodyMd: body.bodyMd ?? '',
          sourceUrl: body.sourceUrl ?? '',
          weight: body.weight ?? 1,
          createdBy: user?.id ?? null,
        })
        .returning();
      return c.json(
        { ...row, createdByName: user?.name ?? null, createdByColor: user?.color ?? null },
        201,
      );
    },
  )
  .delete('/evidence/:id', async (c) => {
    const id = c.req.param('id');
    const [existing] = await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, id));
    if (!existing) return c.json({ error: 'not_found' }, 404);
    await db.delete(evidence).where(eq(evidence.id, id));
    return c.body(null, 204);
  });
