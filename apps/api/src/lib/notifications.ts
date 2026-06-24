import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  notifications,
  notificationMutes,
  memberships,
  featureCollaborators,
  comments,
  documents,
  users,
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
    if (!featureId) return;

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

    // comment: feature collaborators.
    const collabRows = await db
      .select({ userId: featureCollaborators.userId })
      .from(featureCollaborators)
      .where(eq(featureCollaborators.featureId, featureId));
    const commentIds = collabRows.map((r) => r.userId).filter((id) => id !== comment.authorId);

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
    console.error('[notifications] comment fan-out failed (swallowed):', err);
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
    console.error('[notifications] invite fan-out failed (swallowed):', err);
  }
}
