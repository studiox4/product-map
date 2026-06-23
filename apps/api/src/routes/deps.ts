// Mounted at /features on projectScopedContent (project-scoped.ts) alongside featuresRoutes;
// this file owns only the /:id/dependencies endpoints.
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray } from 'drizzle-orm';
import { dependenciesPut } from '@productmap/shared';
import { features, featureDependencies } from '@productmap/db/schema';
import { db } from '../db';
import { type MembershipEnv } from '../middleware/membership';
import { loadScoped } from '../lib/scope';
import { recordActivity } from '../lib/activity';

async function featuresByIds(ids: string[], pid: string) {
  if (ids.length === 0) return [];
  return db.select().from(features).where(and(inArray(features.id, ids), eq(features.projectId, pid)));
}

/** Blockers (features blocking :id) and blocked (features :id blocks). */
async function dependencyGraphFor(id: string, pid: string) {
  const edges = await db.select().from(featureDependencies);
  const blockerIds = edges.filter((e) => e.blockedId === id).map((e) => e.blockerId);
  const blockedIds = edges.filter((e) => e.blockerId === id).map((e) => e.blockedId);
  // Resolve feature rows scoped to pid — cross-project ids simply won't match.
  const rows = await featuresByIds([...new Set([...blockerIds, ...blockedIds])], pid);
  const byId = new Map(rows.map((f) => [f.id, f]));
  return {
    blockers: blockerIds.map((bid) => byId.get(bid)).filter(Boolean),
    blocked: blockedIds.map((bid) => byId.get(bid)).filter(Boolean),
  };
}

/**
 * True when setting `blockerIds` as the blockers of `id` would create a cycle.
 * DFS downstream from `id` over the proposed graph (existing edges minus the
 * ones being replaced): if `id` transitively blocks any proposed blocker, the
 * new blocker→id edge closes a loop.
 */
function createsCycle(
  id: string,
  blockerIds: string[],
  edges: { blockerId: string; blockedId: string }[],
): boolean {
  if (blockerIds.includes(id)) return true;
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (e.blockedId === id) continue; // these edges are being replaced
    const list = adjacency.get(e.blockerId) ?? [];
    list.push(e.blockedId);
    adjacency.set(e.blockerId, list);
  }
  const targets = new Set(blockerIds);
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const next of adjacency.get(node) ?? []) {
      if (targets.has(next)) return true;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

export const depsRoutes = new Hono<MembershipEnv>()
  .get('/:id/dependencies', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    await loadScoped(features, id, pid);
    return c.json(await dependencyGraphFor(id, pid));
  })
  .put(
    '/:id/dependencies',
    zValidator('json', dependenciesPut, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const pid = c.get('currentProjectId');
      const blockerIds = [...new Set(c.req.valid('json').blockerIds)];
      const user = c.get('currentUser');
      await loadScoped(features, id, pid);
      if (blockerIds.includes(id)) return c.json({ error: 'cycle' }, 400);

      const blockerRows = blockerIds.length === 0
        ? []
        : await db.select().from(features)
            .where(and(inArray(features.id, blockerIds), eq(features.projectId, pid)));
      if (blockerRows.length !== blockerIds.length) return c.json({ error: 'not_found' }, 404);

      const edges = await db.select().from(featureDependencies);
      if (createsCycle(id, blockerIds, edges)) return c.json({ error: 'cycle' }, 400);

      const prev = new Set(edges.filter((e) => e.blockedId === id).map((e) => e.blockerId));
      const next = new Set(blockerIds);
      await db.delete(featureDependencies).where(eq(featureDependencies.blockedId, id));
      if (blockerIds.length > 0) {
        await db
          .insert(featureDependencies)
          .values(blockerIds.map((blockerId) => ({ blockerId, blockedId: id })));
      }

      const titles = new Map(blockerRows.map((f) => [f.id, f.title]));
      for (const blockerId of blockerIds) {
        if (!prev.has(blockerId)) {
          await recordActivity(id, user?.id, 'dependency_added', {
            blockerId,
            blockerTitle: titles.get(blockerId),
          });
        }
      }
      for (const blockerId of prev) {
        if (!next.has(blockerId)) {
          await recordActivity(id, user?.id, 'dependency_removed', { blockerId });
        }
      }

      return c.json(await dependencyGraphFor(id, pid));
    },
  );
