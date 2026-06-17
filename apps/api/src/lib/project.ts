/** Resolve the single project in the workspace (Phase-2a transitional helper).
 *  Returns the first project's id, or throws if no project exists yet.
 *  Route handlers that create project-scoped rows call this until the API
 *  grows multi-project support and accepts projectId in the request body.
 *
 *  REMOVE in Phase 2b: routes become /api/projects/:projectId/... and derive the
 *  project from the URL via a membership-check middleware (introduced in Phase 2b) —
 *  no default-project resolution.
 */
import { asc } from 'drizzle-orm';
import { projects } from '@productmap/db';
import { db } from '../db';

export async function getDefaultProjectId(): Promise<string> {
  const [row] = await db.select({ id: projects.id }).from(projects).orderBy(asc(projects.createdAt)).limit(1);
  if (!row) throw new Error('No project found — seed or migrate first');
  return row.id;
}
