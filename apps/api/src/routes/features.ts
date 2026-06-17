// Mounted at /api/projects/:projectId/features (project-scoped.ts).
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { featureCreate, featureUpdate, collaboratorsPut, voteBody } from '@productmap/shared';
import { features, documents, activity, featureCollaborators, users, votes, featureDependencies, objectives, releases } from '@productmap/db';
import { db } from '../db';
import { type MembershipEnv } from '../middleware/membership';
import { recordActivity, addCollaborator } from '../lib/activity';
import { EMPTY_VOTE_SUMMARY, requestUserId, voteSummaries, voteSummaryFor } from '../lib/votes';
import { loadScoped } from '../lib/scope';

const horizonOrder = sql`case ${features.horizon} when 'now' then 0 when 'next' then 1 else 2 end`;

const docMetaColumns = {
  id: documents.id,
  featureId: documents.featureId,
  type: documents.type,
  title: documents.title,
  status: documents.status,
  cover: documents.cover,
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
    if (!row.featureId) continue; // idea/release-owned docs never match featureIds
    const list = byFeature.get(row.featureId) ?? [];
    list.push(row);
    byFeature.set(row.featureId, list);
  }
  return byFeature;
}

/** blocker ids per blocked feature (board "blocked" badge derives from these). */
async function blockerIdsForFeatures(featureIds: string[]) {
  const byBlocked = new Map<string, string[]>();
  if (featureIds.length === 0) return byBlocked;
  const rows = await db
    .select()
    .from(featureDependencies)
    .where(inArray(featureDependencies.blockedId, featureIds));
  for (const row of rows) {
    const list = byBlocked.get(row.blockedId) ?? [];
    list.push(row.blockerId);
    byBlocked.set(row.blockedId, list);
  }
  return byBlocked;
}

export const featuresRoutes = new Hono<MembershipEnv>()
  .get('/', async (c) => {
    const pid = c.get('currentProjectId');
    const rows = await db
      .select()
      .from(features)
      .where(eq(features.projectId, pid))
      .orderBy(horizonOrder, asc(features.sortOrder), asc(features.createdAt));
    const ids = rows.map((f) => f.id);
    const docs = await docsForFeatures(ids);
    const voteMap = await voteSummaries(ids, requestUserId(c));
    const blockers = await blockerIdsForFeatures(ids);
    return c.json(
      rows.map((f) => ({
        ...f,
        ...(voteMap.get(f.id) ?? EMPTY_VOTE_SUMMARY),
        documents: docs.get(f.id) ?? [],
        blockerIds: blockers.get(f.id) ?? [],
      })),
    );
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
      const pid = c.get('currentProjectId');
      const [row] = await db
        .insert(features)
        .values({
          projectId: pid,
          title: body.title,
          horizon: body.horizon,
          createdBy: user?.id ?? null,
          updatedBy: user?.id ?? null,
        })
        .returning();
      await recordActivity(row.id, user?.id, 'feature_created', {
        to: row.title,
        // Full snapshot so the roadmap Time Machine can replay this feature appearing.
        snapshot: {
          title: row.title,
          horizon: row.horizon,
          status: row.status,
          startDate: row.startDate,
          endDate: row.endDate,
        },
      });
      await addCollaborator(row.id, user?.id);
      return c.json(row, 201);
    },
  )
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    const row = await loadScoped(features, id, pid) as typeof features.$inferSelect;
    const docs = await docsForFeatures([row.id]);
    const voteSummary = await voteSummaryFor(row.id, requestUserId(c));
    const blockers = await blockerIdsForFeatures([row.id]);
    return c.json({
      ...row,
      ...voteSummary,
      documents: docs.get(row.id) ?? [],
      blockerIds: blockers.get(row.id) ?? [],
    });
  })
  .put(
    '/:id/vote',
    zValidator('json', voteBody, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const pid = c.get('currentProjectId');
      const { value } = c.req.valid('json');
      const user = c.get('currentUser');
      await loadScoped(features, id, pid);
      if (!user) return c.json({ error: 'unauthorized' }, 401);
      if (value === 0) {
        await db.delete(votes).where(and(eq(votes.userId, user.id), eq(votes.featureId, id)));
      } else {
        await db
          .insert(votes)
          .values({ userId: user.id, featureId: id, value })
          .onConflictDoUpdate({ target: [votes.userId, votes.featureId], set: { value } });
      }
      return c.json(await voteSummaryFor(id, user.id));
    },
  )
  .patch(
    '/:id',
    zValidator('json', featureUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const pid = c.get('currentProjectId');
      const updates = c.req.valid('json');
      const user = c.get('currentUser');
      const prev = await loadScoped(features, id, pid) as typeof features.$inferSelect;
      // Scope body-supplied entity ids to the same project.
      if (updates.objectiveId != null) await loadScoped(objectives, updates.objectiveId, pid);
      if (updates.releaseId != null) await loadScoped(releases, updates.releaseId, pid);
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
      if (updates.size !== undefined && row.size !== prev.size) {
        await recordActivity(id, user?.id, 'size_changed', { from: prev.size, to: row.size });
      }
      await addCollaborator(id, user?.id);
      return c.json(row);
    },
  )
  .get('/:id/activity', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    await loadScoped(features, id, pid);
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
    const pid = c.get('currentProjectId');
    await loadScoped(features, id, pid);
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
      const pid = c.get('currentProjectId');
      const { userIds } = c.req.valid('json');
      await loadScoped(features, id, pid);
      // userIds are global (users have no projectId) — do NOT scope them.
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
    const pid = c.get('currentProjectId');
    await loadScoped(features, id, pid);
    const deleted = await db.delete(features).where(eq(features.id, id)).returning({ id: features.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });
