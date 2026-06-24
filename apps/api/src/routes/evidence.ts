// Dream-tier evidence routes. Mounted on projectScopedContent at '/', so the
// paths here (/features/:id/evidence and /evidence/:id) resolve under
// /api/projects/:projectId/…
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq } from 'drizzle-orm';
import { evidenceCreate } from '@productmap/shared';
import { evidence, features, users } from '@productmap/db/schema';
import { db } from '../db';
import { loadUser } from '../middleware/auth';
import { type MembershipEnv } from '../middleware/membership';
import { loadScoped } from '../lib/scope';

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

export const evidenceRoutes = new Hono<MembershipEnv>()
  .get('/features/:id/evidence', async (c) => {
    const featureId = c.req.param('id');
    const pid = c.get('currentProjectId');
    await loadScoped(features, featureId, pid);
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
      const pid = c.get('currentProjectId');
      const body = c.req.valid('json');
      const user = c.get('currentUser');
      await loadScoped(features, featureId, pid);

      const fullUser = user ? await loadUser(user.id) : null;
      const [row] = await db
        .insert(evidence)
        .values({
          featureId,
          kind: body.kind,
          title: body.title,
          bodyMd: body.bodyMd ?? '',
          sourceUrl: body.sourceUrl ?? '',
          weight: body.weight ?? 1,
          createdBy: fullUser?.id ?? null,
        })
        .returning();
      return c.json(
        { ...row, createdByName: fullUser?.name ?? null, createdByColor: fullUser?.color ?? null },
        201,
      );
    },
  )
  .delete('/evidence/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    const [existing] = await db
      .select({ id: evidence.id, featureId: evidence.featureId })
      .from(evidence)
      .where(eq(evidence.id, id));
    if (!existing) return c.json({ error: 'not_found' }, 404);
    // 2-hop: prove the evidence's feature belongs to this project
    await loadScoped(features, existing.featureId, pid);
    await db.delete(evidence).where(eq(evidence.id, id));
    return c.body(null, 204);
  });
