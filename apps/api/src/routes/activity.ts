import { Hono } from 'hono';
import { and, asc, eq, gte } from 'drizzle-orm';
import { activity, features, users } from '@productmap/db/schema';
import { db } from '../db';
import type { MembershipEnv } from '../middleware/membership';

// GET /api/projects/:projectId/activity?since=ISO → WorkspaceActivityItem[] —
// project-scoped ascending (replay order), actor + feature joined, capped at 1000.
export const activityRoutes = new Hono<MembershipEnv>().get('/', async (c) => {
  const pid = c.get('currentProjectId');
  const since = c.req.query('since');
  let sinceDate: Date | undefined;
  if (since !== undefined) {
    sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return c.json({ error: 'validation', message: 'since must be an ISO date' }, 400);
    }
  }
  const rows = await db
    .select({
      id: activity.id,
      featureId: activity.featureId,
      featureTitle: features.title,
      actorId: activity.actorId,
      actorName: users.name,
      actorColor: users.color,
      kind: activity.kind,
      payload: activity.payload,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .innerJoin(users, eq(activity.actorId, users.id))
    .innerJoin(features, eq(activity.featureId, features.id))
    .where(and(eq(features.projectId, pid), sinceDate ? gte(activity.createdAt, sinceDate) : undefined))
    .orderBy(asc(activity.createdAt), asc(activity.id))
    .limit(1000);
  return c.json(rows);
});
