// Mounted at /api/projects/:projectId/plans (project-scoped.ts). Roadmap
// scenario plans: snapshots of the feature schedule (dates + horizon) edited
// in isolation, then applied back to the real roadmap in one transaction with
// per-field activity.
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { planCreate, planUpdate, planEntryUpdate } from '@productmap/shared';
import { plans, planEntries, features, activity } from '@productmap/db';
import { db } from '../db';
import { type MembershipEnv } from '../middleware/membership';
import { loadScoped } from '../lib/scope';

async function entriesFor(planId: string) {
  return db.select().from(planEntries).where(eq(planEntries.planId, planId));
}

/** Per-feature field diff for the apply summary; null when nothing differs. */
function diffFields(
  feature: { startDate: string | null; endDate: string | null; horizon: string },
  entry: { startDate: string | null; endDate: string | null; horizon: string },
) {
  const fields: Record<string, { from: string | null; to: string | null }> = {};
  if (entry.startDate !== feature.startDate) {
    fields.startDate = { from: feature.startDate, to: entry.startDate };
  }
  if (entry.endDate !== feature.endDate) {
    fields.endDate = { from: feature.endDate, to: entry.endDate };
  }
  if (entry.horizon !== feature.horizon) {
    fields.horizon = { from: feature.horizon, to: entry.horizon };
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

export const plansRoutes = new Hono<MembershipEnv>()
  .get('/', async (c) => {
    const pid = c.get('currentProjectId');
    const rows = await db.select().from(plans).where(eq(plans.projectId, pid)).orderBy(asc(plans.createdAt));
    return c.json(rows);
  })
  .post(
    '/',
    zValidator('json', planCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const { name, copyFrom } = c.req.valid('json');
      const user = c.get('currentUser');
      const pid = c.get('currentProjectId');

      // Snapshot source: the live feature schedule, or another plan's entries.
      let snapshot: Array<{
        featureId: string;
        startDate: string | null;
        endDate: string | null;
        horizon: 'now' | 'next' | 'later';
      }>;
      if (copyFrom === 'current') {
        snapshot = await db
          .select({
            featureId: features.id,
            startDate: features.startDate,
            endDate: features.endDate,
            horizon: features.horizon,
          })
          .from(features)
          .where(eq(features.projectId, pid));
      } else {
        // copyFrom is a plan id — verify it belongs to this project
        await loadScoped(plans, copyFrom, pid);
        snapshot = (await entriesFor(copyFrom)).map((e) => ({
          featureId: e.featureId,
          startDate: e.startDate,
          endDate: e.endDate,
          horizon: e.horizon,
        }));
      }

      const projectId = pid;
      const plan = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(plans)
          .values({ projectId, name, createdBy: user?.id ?? null })
          .returning();
        if (snapshot.length > 0) {
          await tx.insert(planEntries).values(snapshot.map((e) => ({ ...e, planId: row.id })));
        }
        return row;
      });
      return c.json({ ...plan, entries: await entriesFor(plan.id) }, 201);
    },
  )
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    const row = await loadScoped(plans, id, pid);
    return c.json({ ...row, entries: await entriesFor(id) });
  })
  .patch(
    '/:id',
    zValidator('json', planUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const pid = c.get('currentProjectId');
      await loadScoped(plans, id, pid);
      const updates = c.req.valid('json');
      const [row] = await db
        .update(plans)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(plans.id, id))
        .returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    await loadScoped(plans, id, pid);
    const deleted = await db.delete(plans).where(eq(plans.id, id)).returning({ id: plans.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  })
  // Scenario editing — touches plan_entries only, never features. Upserts so a
  // feature created after the snapshot can still be tray-dropped into the plan.
  .put(
    '/:id/entries/:featureId',
    zValidator('json', planEntryUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const planId = c.req.param('id');
      const featureId = c.req.param('featureId');
      const updates = c.req.valid('json');
      const pid = c.get('currentProjectId');

      // Scope both the plan and the feature to this project
      await loadScoped(plans, planId, pid);
      await loadScoped(features, featureId, pid);

      const [existing] = await db
        .select()
        .from(planEntries)
        .where(and(eq(planEntries.planId, planId), eq(planEntries.featureId, featureId)));
      let entry: typeof planEntries.$inferSelect;
      if (existing) {
        [entry] = await db
          .update(planEntries)
          .set(updates)
          .where(and(eq(planEntries.planId, planId), eq(planEntries.featureId, featureId)))
          .returning();
      } else {
        // New-to-the-plan feature: seed the entry from its current schedule.
        const [feature] = await db.select().from(features).where(eq(features.id, featureId));
        if (!feature) return c.json({ error: 'not_found' }, 404);
        [entry] = await db
          .insert(planEntries)
          .values({
            planId,
            featureId,
            startDate: updates.startDate !== undefined ? updates.startDate : feature.startDate,
            endDate: updates.endDate !== undefined ? updates.endDate : feature.endDate,
            horizon: updates.horizon ?? feature.horizon,
          })
          .returning();
      }
      await db.update(plans).set({ updatedAt: sql`now()` }).where(eq(plans.id, planId));
      return c.json(entry);
    },
  )
  // Promote the scenario to the real roadmap. One transaction: write entries
  // to features, per-field activity + plan_applied on every changed feature,
  // mark this plan applied and archive any other applied plan.
  .post('/:id/apply', async (c) => {
    const id = c.req.param('id');
    const user = c.get('currentUser');
    const pid = c.get('currentProjectId');
    const plan = await loadScoped(plans, id, pid) as typeof plans.$inferSelect;

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ entry: planEntries, feature: features })
        .from(planEntries)
        .innerJoin(features, eq(features.id, planEntries.featureId))
        .where(eq(planEntries.planId, id));

      const changed: Array<{
        featureId: string;
        title: string;
        fields: Record<string, { from: string | null; to: string | null }>;
      }> = [];
      for (const { entry, feature } of rows) {
        const fields = diffFields(feature, entry);
        if (!fields) continue;
        await tx
          .update(features)
          .set({
            startDate: entry.startDate,
            endDate: entry.endDate,
            horizon: entry.horizon,
            updatedBy: user?.id ?? null,
            updatedAt: sql`now()`,
          })
          .where(eq(features.id, feature.id));
        if (user) {
          if (fields.startDate || fields.endDate) {
            await tx.insert(activity).values({
              featureId: feature.id,
              actorId: user.id,
              kind: 'dates_changed',
              payload: {
                from: { startDate: feature.startDate, endDate: feature.endDate },
                to: { startDate: entry.startDate, endDate: entry.endDate },
              },
            });
          }
          if (fields.horizon) {
            await tx.insert(activity).values({
              featureId: feature.id,
              actorId: user.id,
              kind: 'horizon_changed',
              payload: { from: feature.horizon, to: entry.horizon },
            });
          }
          await tx.insert(activity).values({
            featureId: feature.id,
            actorId: user.id,
            kind: 'plan_applied',
            payload: { planId: plan.id, planName: plan.name },
          });
        }
        changed.push({ featureId: feature.id, title: feature.title, fields });
      }

      await tx
        .update(plans)
        .set({ status: 'archived', updatedAt: sql`now()` })
        .where(and(eq(plans.status, 'applied'), ne(plans.id, id)));
      const [applied] = await tx
        .update(plans)
        .set({ status: 'applied', appliedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(plans.id, id))
        .returning();
      return { plan: applied, changed };
    });

    return c.json(result);
  });
