// Mounted at /api/projects/:projectId/objectives (project-scoped.ts).
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, count, eq } from 'drizzle-orm';
import { objectiveCreate, objectiveUpdate } from '@productmap/shared';
import { objectives, users, features } from '@productmap/db';
import { db } from '../db';
import { type MembershipEnv } from '../middleware/membership';
import { loadScoped } from '../lib/scope';

export const objectivesRoutes = new Hono<MembershipEnv>()
  // GET / → Objective[] with joined owner {name,color} + featureCount.
  .get('/', async (c) => {
    const pid = c.get('currentProjectId');
    const rows = await db
      .select({
        id: objectives.id,
        title: objectives.title,
        descriptionMd: objectives.descriptionMd,
        metric: objectives.metric,
        target: objectives.target,
        current: objectives.current,
        status: objectives.status,
        ownerId: objectives.ownerId,
        quarter: objectives.quarter,
        createdAt: objectives.createdAt,
        ownerName: users.name,
        ownerColor: users.color,
        featureCount: count(features.id),
      })
      .from(objectives)
      .leftJoin(users, eq(objectives.ownerId, users.id))
      .leftJoin(features, eq(features.objectiveId, objectives.id))
      .where(eq(objectives.projectId, pid))
      .groupBy(objectives.id, users.id)
      // id tiebreaker: bulk-seeded rows share one created_at and the GROUP BY
      // plan otherwise returns them in nondeterministic order.
      .orderBy(asc(objectives.createdAt), asc(objectives.id));
    return c.json(
      rows.map(({ ownerName, ownerColor, ...o }) => ({
        ...o,
        owner: ownerName !== null ? { name: ownerName, color: ownerColor } : null,
      })),
    );
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
      const projectId = c.get('currentProjectId');
      const [row] = await db.insert(objectives).values({ ...body, projectId }).returning();
      return c.json(row, 201);
    },
  )
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    const row = await loadScoped(objectives, id, pid);
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
      const pid = c.get('currentProjectId');
      await loadScoped(objectives, id, pid);
      const updates = c.req.valid('json');
      const [row] = await db.update(objectives).set(updates).where(eq(objectives.id, id)).returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    await loadScoped(objectives, id, pid);
    const deleted = await db.delete(objectives).where(eq(objectives.id, id)).returning({ id: objectives.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });
