import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { notificationPrefUpdate, NOTIFICATION_KINDS } from '@productmap/shared';
import type { NotificationItem, NotificationPrefs } from '@productmap/shared';
import { notifications, notificationMutes, users, projects } from '@productmap/db/schema';
import { db } from '../db';
import type { AuthEnv } from '../middleware/auth';

const PAGE = 30;

export const notificationsRoutes = new Hono<AuthEnv>()
  .get('/', async (c) => {
    const uid = c.get('currentUser').id;
    const cursor = c.req.query('cursor');
    const where = cursor
      ? and(eq(notifications.userId, uid), lt(notifications.createdAt, new Date(cursor)))
      : eq(notifications.userId, uid);
    const rows = await db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        projectId: notifications.projectId,
        projectSlug: projects.slug,
        actorId: notifications.actorId,
        actorName: users.name,
        actorColor: users.color,
        featureId: notifications.featureId,
        documentId: notifications.documentId,
        commentId: notifications.commentId,
        payload: notifications.payload,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .innerJoin(projects, eq(projects.id, notifications.projectId))
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(PAGE + 1);

    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    const items: NotificationItem[] = page.map((r) => ({
      id: r.id,
      kind: r.kind as NotificationItem['kind'],
      projectId: r.projectId,
      projectSlug: r.projectSlug ?? '',
      actorId: r.actorId,
      actorName: r.actorName,
      actorColor: r.actorColor,
      featureId: r.featureId,
      documentId: r.documentId,
      commentId: r.commentId,
      payload: r.payload as Record<string, unknown> | null,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
    const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;
    return c.json({ items, nextCursor });
  })
  .get('/unread-count', async (c) => {
    const uid = c.get('currentUser').id;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, uid), isNull(notifications.readAt)));
    return c.json({ count: row?.count ?? 0 });
  })
  .post('/read-all', async (c) => {
    const uid = c.get('currentUser').id;
    await db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.userId, uid), isNull(notifications.readAt)));
    return c.body(null, 204);
  })
  .post('/:id/read', async (c) => {
    const uid = c.get('currentUser').id;
    const id = c.req.param('id');
    const updated = await db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.id, id), eq(notifications.userId, uid)))
      .returning({ id: notifications.id });
    if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  })
  .get('/prefs', async (c) => {
    const uid = c.get('currentUser').id;
    const muted = await db
      .select({ kind: notificationMutes.kind })
      .from(notificationMutes)
      .where(eq(notificationMutes.userId, uid));
    const mutedSet = new Set(muted.map((m) => m.kind));
    const prefs = Object.fromEntries(
      NOTIFICATION_KINDS.map((k) => [k, !mutedSet.has(k)]),
    ) as unknown as NotificationPrefs;
    return c.json(prefs);
  })
  .put(
    '/prefs',
    zValidator('json', notificationPrefUpdate, (r, c) => {
      if (!r.success) return c.json({ error: 'validation', issues: r.error.issues }, 400);
    }),
    async (c) => {
      const uid = c.get('currentUser').id;
      const { kind, enabled } = c.req.valid('json');
      if (enabled) {
        await db.delete(notificationMutes).where(and(eq(notificationMutes.userId, uid), eq(notificationMutes.kind, kind)));
      } else {
        await db.insert(notificationMutes).values({ userId: uid, kind }).onConflictDoNothing();
      }
      return c.body(null, 204);
    },
  );
