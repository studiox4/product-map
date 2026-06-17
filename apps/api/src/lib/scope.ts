import { and, eq } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { HTTPException } from 'hono/http-exception';
import { comments, documents, features } from '@productmap/db';
import { db } from '../db';

/** Thrown when a resource is missing OR belongs to another project. Carries 404 — never leak existence. */
export class ScopeError extends HTTPException {
  constructor() {
    super(404, {
      res: new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    });
  }
}

/**
 * Assert a comment belongs to `projectId` via its feature OR document parent.
 * Throws ScopeError(404) if the comment is missing or its parent is in another project.
 * Returns the loaded comment row.
 */
export async function loadScopedComment(commentId: string, projectId: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) throw new ScopeError();
  if (comment.featureId) await loadScoped(features, comment.featureId, projectId);
  else if (comment.documentId) await loadScoped(documents, comment.documentId, projectId);
  else throw new ScopeError(); // orphan comment — cannot prove project; deny
  return comment;
}

/**
 * Load a row by id AND assert it belongs to `projectId`; throw ScopeError(404) otherwise.
 * Use for EVERY path id and EVERY body-supplied entity id before persisting, so a member
 * of project A can never read or reference project B's rows. `table` must have `id` and
 * `projectId` columns.
 *
 * NOTE: As of Phase 2a this helper is tested but NOT yet wired into route handlers.
 * Phase 2b wires it in by replacing ad-hoc 404 checks with loadScoped calls.
 */
export async function loadScoped(
  table: { id: PgColumn; projectId: PgColumn },
  id: string,
  projectId: string,
): Promise<Record<string, unknown>> {
  const [row] = await db
    .select()
    .from(table as any)
    .where(and(eq(table.id, id), eq(table.projectId, projectId)))
    .limit(1);
  if (!row) throw new ScopeError();
  return row as Record<string, unknown>;
}
