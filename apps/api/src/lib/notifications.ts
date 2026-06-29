import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  notifications,
  notificationMutes,
  memberships,
  featureCollaborators,
  comments,
  documents,
  users,
  projectFavorites,
} from '@productmap/db/schema';
import type { NotificationKind } from '@productmap/shared';
import { db } from '../db';

type CommentRow = typeof comments.$inferSelect;

/** Doc comments attribute to the document's feature (mirrors comments route). */
async function featureIdFor(comment: Pick<CommentRow, 'featureId' | 'documentId'>): Promise<string | null> {
  if (comment.featureId) return comment.featureId;
  if (!comment.documentId) return null;
  const [doc] = await db
    .select({ featureId: documents.featureId })
    .from(documents)
    .where(eq(documents.id, comment.documentId));
  return doc?.featureId ?? null;
}

/** userIds (from the candidate set) who have muted `kind`. */
async function mutedAmong(userIds: string[], kind: NotificationKind): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: notificationMutes.userId })
    .from(notificationMutes)
    .where(and(inArray(notificationMutes.userId, userIds), eq(notificationMutes.kind, kind)));
  return new Set(rows.map((r) => r.userId));
}

/**
 * Generate notifications for a freshly-committed comment. Precedence per
 * recipient: mention > reply > comment (one row each). Never notifies the
 * author. Best-effort — a failure here must never affect the comment write.
 */
export async function fanOutCommentNotifications(comment: CommentRow, projectId: string): Promise<void> {
  try {
    const featureId = await featureIdFor(comment);

    // mention: re-resolve embedded ids against project membership (never trust the body).
    const { parseMentionIds } = await import('./mentions');
    const candidateMentionIds = parseMentionIds(comment.body).filter((id) => id !== comment.authorId);
    let mentionIds: string[] = [];
    if (candidateMentionIds.length > 0) {
      const members = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.projectId, projectId), inArray(memberships.userId, candidateMentionIds)));
      mentionIds = members.map((m) => m.userId);
    }

    // reply: prior participants in the thread (only when this is a reply).
    let replyIds: string[] = [];
    if (comment.parentId) {
      const rows = await db
        .selectDistinct({ authorId: comments.authorId })
        .from(comments)
        .where(or(eq(comments.id, comment.parentId), eq(comments.parentId, comment.parentId)));
      replyIds = rows.map((r) => r.authorId).filter((id) => id !== comment.authorId);
    }

    // comment: feature collaborators (only applicable when the doc belongs to a feature).
    const commentIds = featureId
      ? (await db
          .select({ userId: featureCollaborators.userId })
          .from(featureCollaborators)
          .where(eq(featureCollaborators.featureId, featureId))
        ).map((r) => r.userId).filter((id) => id !== comment.authorId)
      : [];

    // Apply precedence: a recipient gets exactly one kind.
    const assigned = new Map<string, NotificationKind>();
    for (const id of mentionIds) assigned.set(id, 'mention');
    for (const id of replyIds) if (!assigned.has(id)) assigned.set(id, 'reply');
    for (const id of commentIds) if (!assigned.has(id)) assigned.set(id, 'comment');
    if (assigned.size === 0) return;

    // Drop recipients who muted their assigned kind (group by kind for the mute query).
    const byKind = new Map<NotificationKind, string[]>();
    for (const [id, kind] of assigned) {
      byKind.set(kind, [...(byKind.get(kind) ?? []), id]);
    }
    const rows: (typeof notifications.$inferInsert)[] = [];
    for (const [kind, ids] of byKind) {
      const muted = await mutedAmong(ids, kind);
      for (const id of ids) {
        if (muted.has(id)) continue;
        rows.push({
          userId: id,
          projectId,
          kind,
          actorId: comment.authorId,
          featureId,
          documentId: comment.documentId,
          commentId: comment.id,
          payload: null,
        });
      }
    }
    if (rows.length > 0) await db.insert(notifications).values(rows);
  } catch (err) {
    console.error('[notifications] comment fan-out failed (swallowed):', { commentId: comment.id, projectId, authorId: comment.authorId }, err);
  }
}

/**
 * Notify an invited user — only if their email maps to an existing account
 * (E2a in-app channel only; strangers are reached by email in E2c).
 * Best-effort.
 *
 * Note: users.email is NOT stored pre-lowercased (invites.ts accept handler
 * lowercases both sides at comparison time). We use lower() in SQL to ensure
 * a case-insensitive match rather than relying on the stored value's casing.
 */
export async function fanOutInviteNotification(
  invite: { projectId: string; email: string | null; createdBy: string | null },
): Promise<void> {
  try {
    if (!invite.email) return;
    const emailLower = invite.email.toLowerCase();
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${emailLower}`);
    if (!u) return;
    if (u.id === invite.createdBy) return;
    const muted = await mutedAmong([u.id], 'project_invite');
    if (muted.has(u.id)) return;
    await db.insert(notifications).values({
      userId: u.id,
      projectId: invite.projectId,
      kind: 'project_invite',
      actorId: invite.createdBy ?? null,
      payload: null,
    });
  } catch (err) {
    console.error('[notifications] invite fan-out failed (swallowed):', { projectId: invite.projectId, email: invite.email }, err);
  }
}

/**
 * Notify project owners + editors that a public idea was submitted (held for
 * moderation). actorId is null — the submitter is unauthenticated. Best-effort;
 * a failure here must never fail the public submit.
 */
export async function fanOutIdeaSubmittedNotification(
  params: { projectId: string; ideaId: string; title: string },
): Promise<void> {
  try {
    const recipients = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.projectId, params.projectId), inArray(memberships.role, ['owner', 'editor'])));
    const ids = recipients.map((r) => r.userId);
    if (ids.length === 0) return;
    const muted = await mutedAmong(ids, 'idea_submitted');
    const rows = ids
      .filter((id) => !muted.has(id))
      .map((id) => ({
        userId: id,
        projectId: params.projectId,
        kind: 'idea_submitted' as const,
        actorId: null,
        payload: { ideaId: params.ideaId, title: params.title },
      }));
    if (rows.length > 0) await db.insert(notifications).values(rows);
  } catch (err) {
    console.error('[notifications] idea_submitted fan-out failed (swallowed):', { projectId: params.projectId, ideaId: params.ideaId }, err);
  }
}

/** True if the user already has an UNREAD notification of `kind` for the same target. */
async function unreadExists(
  userId: string,
  kind: NotificationKind,
  match: { featureId?: string; releaseId?: string },
): Promise<boolean> {
  const conds = [
    eq(notifications.userId, userId),
    eq(notifications.kind, kind),
    isNull(notifications.readAt),
  ];
  if (match.featureId) conds.push(eq(notifications.featureId, match.featureId));
  if (match.releaseId) conds.push(sql`${notifications.payload}->>'releaseId' = ${match.releaseId}`);
  const [row] = await db.select({ id: notifications.id }).from(notifications).where(and(...conds)).limit(1);
  return !!row;
}

/** Notify users newly added as collaborators on a feature. Best-effort. */
export async function fanOutAssignedNotification(
  params: { featureId: string; projectId: string; addedUserIds: string[]; actorId: string | null },
): Promise<void> {
  try {
    const candidates = params.addedUserIds.filter((id) => id !== params.actorId);
    if (candidates.length === 0) return;
    const muted = await mutedAmong(candidates, 'assigned');
    const rows: (typeof notifications.$inferInsert)[] = [];
    for (const userId of candidates) {
      if (muted.has(userId)) continue;
      if (await unreadExists(userId, 'assigned', { featureId: params.featureId })) continue;
      rows.push({ userId, projectId: params.projectId, kind: 'assigned', actorId: params.actorId, featureId: params.featureId, payload: null });
    }
    if (rows.length > 0) await db.insert(notifications).values(rows);
  } catch (err) {
    console.error('[notifications] assigned fan-out failed (swallowed):', { featureId: params.featureId }, err);
  }
}

/** Notify project favoriters that a release shipped. Best-effort. */
export async function fanOutReleasePublishedNotification(
  params: { projectId: string; releaseId: string; releaseName: string; actorId: string | null },
): Promise<void> {
  try {
    const favs = await db
      .select({ userId: projectFavorites.userId })
      .from(projectFavorites)
      .where(eq(projectFavorites.projectId, params.projectId));
    const ids = favs.map((f) => f.userId).filter((id) => id !== params.actorId);
    if (ids.length === 0) return;
    const muted = await mutedAmong(ids, 'release_published');
    const rows: (typeof notifications.$inferInsert)[] = [];
    for (const userId of ids) {
      if (muted.has(userId)) continue;
      if (await unreadExists(userId, 'release_published', { releaseId: params.releaseId })) continue;
      rows.push({ userId, projectId: params.projectId, kind: 'release_published', actorId: params.actorId, payload: { releaseId: params.releaseId, name: params.releaseName } });
    }
    if (rows.length > 0) await db.insert(notifications).values(rows);
  } catch (err) {
    console.error('[notifications] release_published fan-out failed (swallowed):', { releaseId: params.releaseId }, err);
  }
}
