import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  IDEA_STATUSES,
  ideaCreate,
  ideaUpdate,
  ideaVoteBody,
  ideaPromote,
  type VoteSummary,
} from '@productmap/shared';
import { activity, documents, features, ideas, ideaVotes, products, templates } from '@productmap/db';
import { db } from '../db';
import { currentUser, type CurrentUserEnv } from '../middleware/current-user';
import { recordActivity, addCollaborator } from '../lib/activity';
import { EMPTY_VOTE_SUMMARY, requestUserId } from '../lib/votes';
import { createAiModel, generateDocStream } from '../lib/ai';
import { markdownToTiptap } from '../lib/markdown';

/** Aggregate idea-vote summaries (mirrors lib/votes voteSummaries for features). */
async function ideaVoteSummaries(
  ideaIds: string[],
  userId: string | null,
): Promise<Map<string, VoteSummary>> {
  const map = new Map<string, VoteSummary>();
  if (ideaIds.length === 0) return map;
  const rows = await db
    .select({
      ideaId: ideaVotes.ideaId,
      score: sql<number>`coalesce(sum(${ideaVotes.value}), 0)::int`,
      boosts: sql<number>`count(*) filter (where ${ideaVotes.value} = 1)::int`,
      cools: sql<number>`count(*) filter (where ${ideaVotes.value} = -1)::int`,
    })
    .from(ideaVotes)
    .where(inArray(ideaVotes.ideaId, ideaIds))
    .groupBy(ideaVotes.ideaId);
  for (const r of rows) {
    map.set(r.ideaId, { score: r.score, boosts: r.boosts, cools: r.cools, myVote: 0 });
  }
  if (userId) {
    const mine = await db
      .select({ ideaId: ideaVotes.ideaId, value: ideaVotes.value })
      .from(ideaVotes)
      .where(and(eq(ideaVotes.userId, userId), inArray(ideaVotes.ideaId, ideaIds)));
    for (const r of mine) {
      const summary = map.get(r.ideaId);
      if (summary) summary.myVote = r.value as 1 | -1;
    }
  }
  return map;
}

async function ideaVoteSummaryFor(ideaId: string, userId: string | null): Promise<VoteSummary> {
  return (await ideaVoteSummaries([ideaId], userId)).get(ideaId) ?? { ...EMPTY_VOTE_SUMMARY };
}

/**
 * Generate + persist a feature_brief doc for a freshly promoted idea. Silent
 * no-op when AI is disabled; generation failures only log (the promote already
 * committed and must not fail because the brief could not be drafted).
 */
async function draftAiBrief(
  feature: typeof features.$inferSelect,
  ideaBodyMd: string,
  actorId: string | undefined,
): Promise<void> {
  const model = createAiModel();
  if (!model) return;
  try {
    const [template] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.type, 'feature_brief'),
          eq(templates.isDefault, true),
          isNull(templates.archivedAt),
        ),
      );
    let contentMd = '';
    for await (const text of generateDocStream({
      brief: ideaBodyMd || feature.title,
      feature: { title: feature.title, horizon: feature.horizon, status: feature.status },
      template: { promptHints: template?.promptHints ?? '', bodyMd: template?.bodyMd ?? '' },
      model,
    })) {
      contentMd += text;
    }
    const [doc] = await db
      .insert(documents)
      .values({
        featureId: feature.id,
        type: 'feature_brief',
        title: `${feature.title} — Feature brief`,
        contentJson: markdownToTiptap(contentMd),
        contentMd,
        createdBy: actorId ?? null,
        updatedBy: actorId ?? null,
      })
      .returning();
    await recordActivity(feature.id, actorId, 'doc_created', { to: doc.title });
  } catch (err) {
    console.error('idea promote: ai brief generation failed', err);
  }
}

export const ideasRoutes = new Hono<CurrentUserEnv>()
  .use('*', currentUser)
  // GET /api/ideas?status= — newest first, with vote summaries
  .get('/', async (c) => {
    const status = c.req.query('status');
    if (status && !(IDEA_STATUSES as readonly string[]).includes(status)) {
      return c.json({ error: 'validation' }, 400);
    }
    const rows = await db
      .select()
      .from(ideas)
      .where(status ? eq(ideas.status, status as (typeof IDEA_STATUSES)[number]) : undefined)
      .orderBy(desc(ideas.createdAt));
    const voteMap = await ideaVoteSummaries(
      rows.map((i) => i.id),
      await requestUserId(c),
    );
    return c.json(rows.map((i) => ({ ...i, ...(voteMap.get(i.id) ?? EMPTY_VOTE_SUMMARY) })));
  })
  .post(
    '/',
    zValidator('json', ideaCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');
      const [row] = await db
        .insert(ideas)
        .values({
          title: body.title,
          bodyMd: body.bodyMd ?? '',
          source: body.source ?? '',
          createdBy: user?.id ?? null,
        })
        .returning();
      return c.json(row, 201);
    },
  )
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const [row] = await db.select().from(ideas).where(eq(ideas.id, id));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ ...row, ...(await ideaVoteSummaryFor(id, await requestUserId(c))) });
  })
  .patch(
    '/:id',
    zValidator('json', ideaUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const updates = c.req.valid('json');
      const [row] = await db
        .update(ideas)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(ideas.id, id))
        .returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    },
  )
  // PUT /api/ideas/:id/vote — same contract as feature votes (0 clears)
  .put(
    '/:id/vote',
    zValidator('json', ideaVoteBody, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const { value } = c.req.valid('json');
      const user = c.get('currentUser');
      const [idea] = await db.select({ id: ideas.id }).from(ideas).where(eq(ideas.id, id));
      if (!idea) return c.json({ error: 'not_found' }, 404);
      if (!user) return c.json({ error: 'unauthorized' }, 401);
      if (value === 0) {
        await db.delete(ideaVotes).where(and(eq(ideaVotes.userId, user.id), eq(ideaVotes.ideaId, id)));
      } else {
        await db
          .insert(ideaVotes)
          .values({ userId: user.id, ideaId: id, value })
          .onConflictDoUpdate({ target: [ideaVotes.userId, ideaVotes.ideaId], set: { value } });
      }
      return c.json(await ideaVoteSummaryFor(id, user.id));
    },
  )
  // POST /api/ideas/:id/promote — idea → feature (optionally with an AI brief)
  .post(
    '/:id/promote',
    zValidator('json', ideaPromote, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const { horizon, withAiBrief } = c.req.valid('json');
      const user = c.get('currentUser');
      const [idea] = await db.select().from(ideas).where(eq(ideas.id, id));
      if (!idea) return c.json({ error: 'not_found' }, 404);
      if (idea.status === 'promoted') return c.json({ error: 'already_promoted' }, 400);
      const [product] = await db.select({ id: products.id }).from(products).limit(1);
      if (!product) return c.json({ error: 'not_found' }, 404);

      const feature = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(features)
          .values({
            productId: product.id,
            title: idea.title,
            horizon,
            descriptionMd: idea.bodyMd,
            createdBy: user?.id ?? null,
            updatedBy: user?.id ?? null,
          })
          .returning();
        await tx
          .update(ideas)
          .set({ status: 'promoted', promotedFeatureId: row.id, updatedAt: sql`now()` })
          .where(eq(ideas.id, id));
        if (user) {
          await tx.insert(activity).values({
            featureId: row.id,
            actorId: user.id,
            kind: 'idea_promoted',
            payload: { ideaId: idea.id, to: row.title, horizon: row.horizon },
          });
        }
        return row;
      });
      await addCollaborator(feature.id, user?.id);

      // Outside the transaction: a failed/disabled brief must not undo the promote.
      if (withAiBrief) await draftAiBrief(feature, idea.bodyMd, user?.id);

      return c.json(feature, 201);
    },
  )
  .delete('/:id', async (c) => {
    const deleted = await db
      .delete(ideas)
      .where(eq(ideas.id, c.req.param('id')))
      .returning({ id: ideas.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });
