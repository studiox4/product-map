import { activity, featureCollaborators } from '@productmap/db/schema';
import type { ActivityKind } from '@productmap/shared';
import { db } from '../db';

/**
 * Append one activity entry. No-ops without an actor (empty demo DB).
 * `projectId` is the denormalized scope key the cross-project dashboard feed
 * queries on — it must match the feature's project.
 */
export async function recordActivity(
  featureId: string,
  projectId: string,
  actorId: string | undefined,
  kind: ActivityKind,
  payload: Record<string, unknown> | null = null,
): Promise<void> {
  if (!actorId) return;
  await db.insert(activity).values({ featureId, projectId, actorId, kind, payload });
}

/** Idempotently add the actor as a collaborator on the feature they touched. */
export async function addCollaborator(featureId: string, userId: string | undefined): Promise<void> {
  if (!userId) return;
  await db.insert(featureCollaborators).values({ featureId, userId }).onConflictDoNothing();
}
