import type { Context } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { votes } from '@productmap/db';
import type { VoteSummary } from '@productmap/shared';
import { db } from '../db';

export const EMPTY_VOTE_SUMMARY: VoteSummary = { score: 0, boosts: 0, cools: 0, myVote: 0 };

/**
 * Resolve the requesting user id for read paths. Identity comes from the
 * authenticated cookie user (`currentUser`), which the global requireAuth gate
 * sets on every gated request — including GETs. `myVote` is therefore computed
 * for the same user whose vote the write path records.
 */
export function requestUserId(c: Context): string | null {
  const user = c.get('currentUser') as { id: string } | undefined;
  return user?.id ?? null;
}

/** Aggregate vote summaries for a set of features; myVote is per `userId`. */
export async function voteSummaries(
  featureIds: string[],
  userId: string | null,
): Promise<Map<string, VoteSummary>> {
  const map = new Map<string, VoteSummary>();
  if (featureIds.length === 0) return map;
  const rows = await db
    .select({
      featureId: votes.featureId,
      score: sql<number>`coalesce(sum(${votes.value}), 0)::int`,
      boosts: sql<number>`count(*) filter (where ${votes.value} = 1)::int`,
      cools: sql<number>`count(*) filter (where ${votes.value} = -1)::int`,
    })
    .from(votes)
    .where(inArray(votes.featureId, featureIds))
    .groupBy(votes.featureId);
  for (const r of rows) {
    map.set(r.featureId, { score: r.score, boosts: r.boosts, cools: r.cools, myVote: 0 });
  }
  if (userId) {
    const mine = await db
      .select({ featureId: votes.featureId, value: votes.value })
      .from(votes)
      .where(and(eq(votes.userId, userId), inArray(votes.featureId, featureIds)));
    for (const r of mine) {
      const summary = map.get(r.featureId);
      if (summary) summary.myVote = r.value as 1 | -1;
    }
  }
  return map;
}

export async function voteSummaryFor(featureId: string, userId: string | null): Promise<VoteSummary> {
  return (await voteSummaries([featureId], userId)).get(featureId) ?? { ...EMPTY_VOTE_SUMMARY };
}
