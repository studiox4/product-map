import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { commentCreate, commentUpdate, resolveBody } from '@productmap/shared';
import { comments, documents, features, users } from '@productmap/db/schema';
import { db } from '../db';
import { type MembershipEnv } from '../middleware/membership';
import { loadUser } from '../middleware/auth';
import { recordActivity, addCollaborator } from '../lib/activity';
import { loadScoped, loadScopedComment } from '../lib/scope';

const commentColumns = {
  id: comments.id,
  authorId: comments.authorId,
  authorName: users.name,
  authorColor: users.color,
  featureId: comments.featureId,
  documentId: comments.documentId,
  parentId: comments.parentId,
  body: comments.body,
  resolvedAt: comments.resolvedAt,
  resolvedBy: comments.resolvedBy,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
};

type CommentRow = typeof comments.$inferSelect;

/** Doc comments attribute activity to the document's feature. */
async function activityFeatureIdFor(comment: Pick<CommentRow, 'featureId' | 'documentId'>): Promise<string | null> {
  if (comment.featureId) return comment.featureId;
  if (!comment.documentId) return null;
  const [doc] = await db
    .select({ featureId: documents.featureId })
    .from(documents)
    .where(eq(documents.id, comment.documentId));
  return doc?.featureId ?? null;
}

async function withAuthor(row: CommentRow) {
  const [author] = await db
    .select({ name: users.name, color: users.color })
    .from(users)
    .where(eq(users.id, row.authorId));
  return { ...row, authorName: author?.name ?? '', authorColor: author?.color ?? '' };
}

export const commentsRoutes = new Hono<MembershipEnv>()
  .get('/', async (c) => {
    const featureId = c.req.query('featureId');
    const documentId = c.req.query('documentId');
    if (!!featureId === !!documentId) {
      return c.json({ error: 'validation', message: 'exactly one of featureId or documentId is required' }, 400);
    }
    const pid = c.get('currentProjectId');
    if (featureId) await loadScoped(features, featureId, pid);
    else await loadScoped(documents, documentId!, pid);
    const rows = await db
      .select(commentColumns)
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(featureId ? eq(comments.featureId, featureId) : eq(comments.documentId, documentId!))
      .orderBy(asc(comments.createdAt));

    type Row = (typeof rows)[number];
    const threads = rows
      .filter((r) => r.parentId === null)
      .map((r) => ({ ...r, replies: [] as Row[] }));
    const byId = new Map(threads.map((t) => [t.id, t]));
    for (const r of rows) {
      if (r.parentId) byId.get(r.parentId)?.replies.push(r);
    }
    // Unresolved first, then resolved; newest roots first within each group.
    threads.sort(
      (a, b) =>
        Number(a.resolvedAt !== null) - Number(b.resolvedAt !== null) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return c.json(threads);
  })
  .post(
    '/',
    zValidator('json', commentCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');
      if (!user) return c.json({ error: 'unauthorized' }, 401);
      const pid = c.get('currentProjectId');

      let featureId = body.featureId ?? null;
      let documentId = body.documentId ?? null;

      if (body.parentId) {
        const parent = await loadScopedComment(body.parentId, pid);
        if (parent.parentId) {
          return c.json({ error: 'validation', message: 'replies are one level deep' }, 400);
        }
        // Replies inherit the thread's target.
        featureId = parent.featureId;
        documentId = parent.documentId;
      } else if (documentId) {
        await loadScoped(documents, documentId, pid);
      } else if (featureId) {
        await loadScoped(features, featureId, pid);
      }

      const fullUser = await loadUser(user.id);
      const [row] = await db
        .insert(comments)
        .values({
          authorId: user.id,
          featureId,
          documentId,
          parentId: body.parentId ?? null,
          body: body.body,
        })
        .returning();

      const activityFeatureId = await activityFeatureIdFor(row);
      if (activityFeatureId) {
        await recordActivity(activityFeatureId, pid, user.id, 'comment_added', {
          commentId: row.id,
          documentId: row.documentId,
        });
        await addCollaborator(activityFeatureId, user.id);
      }
      return c.json({ ...row, authorName: fullUser?.name ?? '', authorColor: fullUser?.color ?? '' }, 201);
    },
  )
  .patch(
    '/:id/resolve',
    zValidator('json', resolveBody, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const { resolved } = c.req.valid('json');
      const user = c.get('currentUser');
      const pid = c.get('currentProjectId');
      const existing = await loadScopedComment(id, pid);
      if (existing.parentId) {
        return c.json({ error: 'validation', message: 'resolve acts on the thread root' }, 400);
      }
      const [row] = await db
        .update(comments)
        .set(
          resolved
            ? { resolvedAt: sql`now()`, resolvedBy: user?.id ?? null }
            : { resolvedAt: null, resolvedBy: null },
        )
        .where(eq(comments.id, id))
        .returning();

      const activityFeatureId = await activityFeatureIdFor(row);
      if (activityFeatureId) {
        await recordActivity(activityFeatureId, pid, user?.id, 'comment_resolved', {
          commentId: row.id,
          resolved,
        });
      }
      return c.json(await withAuthor(row));
    },
  )
  .patch(
    '/:id',
    zValidator('json', commentUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const updates = c.req.valid('json');
      const user = c.get('currentUser');
      const pid = c.get('currentProjectId');
      const existing = await loadScopedComment(id, pid);
      if (existing.authorId !== user?.id) return c.json({ error: 'forbidden' }, 403);
      if (updates.body === undefined) return c.json(await withAuthor(existing));
      const fullUser = await loadUser(user.id);
      const [row] = await db
        .update(comments)
        .set({ body: updates.body, updatedAt: sql`now()` })
        .where(eq(comments.id, id))
        .returning();
      return c.json({ ...row, authorName: fullUser?.name ?? '', authorColor: fullUser?.color ?? '' });
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const user = c.get('currentUser');
    const pid = c.get('currentProjectId');
    const existing = await loadScopedComment(id, pid);
    if (existing.authorId !== user?.id) return c.json({ error: 'forbidden' }, 403);
    await db.delete(comments).where(eq(comments.id, id));
    return c.body(null, 204);
  });
