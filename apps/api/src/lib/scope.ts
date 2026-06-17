import { and, eq } from 'drizzle-orm';
import { db } from '../db';

/** Thrown when a resource is missing OR belongs to another project. Carries 404 — never leak existence. */
export class ScopeError extends Error {
  readonly status = 404 as const;
  constructor(message = 'not_found') {
    super(message);
    this.name = 'ScopeError';
  }
}

/**
 * Load a row by id AND assert it belongs to `projectId`; throw ScopeError(404) otherwise.
 * Use for EVERY path id and EVERY body-supplied entity id before persisting, so a member
 * of project A can never read or reference project B's rows. `table` must have `id` and
 * `projectId` columns.
 */
export async function loadScoped(table: any, id: string, projectId: string): Promise<any> {
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.projectId, projectId)))
    .limit(1);
  if (!row) throw new ScopeError();
  return row;
}
