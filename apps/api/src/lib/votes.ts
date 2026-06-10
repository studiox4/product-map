import type { Context } from 'hono';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { users, votes } from '@productmap/db';
import type { VoteSummary } from '@productmap/shared';
import { db } from '../db';

export const EMPTY_VOTE_SUMMARY: VoteSummary = { score: 0, boosts: 0, cools: 0, myVote: 0 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the requesting user id for read paths (`currentUser` middleware
 * deliberately skips GETs). Mirrors its semantics: x-user-id header when it
 * names an existing user, otherwise the first seeded user — a stale header id
 * (e.g. localStorage surviving a db reset) must read the same identity that
 * writes fall back to, or `myVote` would never match the recorded vote.
 */
export async function requestUserId(c: Context): Promise<string | null> {
  const headerId = c.req.header('x-user-id');
  if (headerId && UUID_RE.test(headerId)) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, headerId));
    if (row) return row.id;
  }
  const [first] = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1);
  return first?.id ?? null;
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
