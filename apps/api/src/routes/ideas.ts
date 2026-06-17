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
import { activity, documents, features, ideas, ideaVotes, templates, users } from '@productmap/db';
import { db } from '../db';
import { getDefaultProjectId } from '../lib/project';
import { type CurrentUserEnv } from '../middleware/current-user';
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

type PitchDocMeta = { id: string; title: string; status: string };

/** idea id → its idea_pitch doc meta (kept joined to the idea even after promotion). */
async function pitchDocMetas(ideaIds: string[]): Promise<Map<string, PitchDocMeta>> {
  const map = new Map<string, PitchDocMeta>();
  if (ideaIds.length === 0) return map;
  const rows = await db
    .select({ id: documents.id, ideaId: documents.ideaId, title: documents.title, status: documents.status })
    .from(documents)
    .where(and(eq(documents.type, 'idea_pitch'), inArray(documents.ideaId, ideaIds)));
  for (const r of rows) {
    if (r.ideaId) map.set(r.ideaId, { id: r.id, title: r.title, status: r.status });
  }
  return map;
}

/** Flat creator columns from a users left-join → Idea.creator shape (null when deleted). */
function toCreator(row: { creatorId: string | null; creatorName: string | null; creatorColor: string | null }) {
  return row.creatorId && row.creatorName && row.creatorColor
    ? { id: row.creatorId, name: row.creatorName, color: row.creatorColor }
    : null;
}

const CREATOR_COLUMNS = {
  idea: ideas,
  creatorId: users.id,
  creatorName: users.name,
  creatorColor: users.color,
};

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
        projectId: feature.projectId,
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
  // GET /api/ideas?status= — newest first, with vote summaries
  .get('/', async (c) => {
    const status = c.req.query('status');
    if (status && !(IDEA_STATUSES as readonly string[]).includes(status)) {
      return c.json({ error: 'validation' }, 400);
    }
    const rows = await db
      .select(CREATOR_COLUMNS)
      .from(ideas)
      .leftJoin(users, eq(ideas.createdBy, users.id))
      .where(status ? eq(ideas.status, status as (typeof IDEA_STATUSES)[number]) : undefined)
      .orderBy(desc(ideas.createdAt));
    const ids = rows.map((r) => r.idea.id);
    const voteMap = await ideaVoteSummaries(ids, requestUserId(c));
    const pitchMap = await pitchDocMetas(ids);
    return c.json(
      rows.map((r) => ({
        ...r.idea,
        creator: toCreator(r),
        pitchDoc: pitchMap.get(r.idea.id) ?? null,
        ...(voteMap.get(r.idea.id) ?? EMPTY_VOTE_SUMMARY),
      })),
    );
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
      const projectId = await getDefaultProjectId();
      const [row] = await db
        .insert(ideas)
        .values({
          projectId,
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
    const [row] = await db
      .select(CREATOR_COLUMNS)
      .from(ideas)
      .leftJoin(users, eq(ideas.createdBy, users.id))
      .where(eq(ideas.id, id));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({
      ...row.idea,
      creator: toCreator(row),
      pitchDoc: (await pitchDocMetas([id])).get(id) ?? null,
      ...(await ideaVoteSummaryFor(id, requestUserId(c))),
    });
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
      const [prev] = await db.select().from(ideas).where(eq(ideas.id, id));
      if (!prev) return c.json({ error: 'not_found' }, 404);
      const [row] = await db
        .update(ideas)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(ideas.id, id))
        .returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      // Activity is feature-scoped (feature_id NOT NULL), so idea edits land on
      // the promoted feature's feed; pre-promotion edits have no feed to write to.
      const fields = (Object.keys(updates) as (keyof typeof updates)[]).filter(
        (k) => updates[k] !== undefined && updates[k] !== prev[k],
      );
      if (row.promotedFeatureId && fields.length > 0) {
        const user = c.get('currentUser');
        await recordActivity(row.promotedFeatureId, user?.id, 'idea_edited', {
          ideaId: row.id,
          to: row.title,
          fields,
        });
      }
      return c.json(row);
    },
  )
  // POST /api/ideas/:id/pitch — create the idea's pitch doc from the default
  // idea_pitch template ({{title}} = idea title). 409 when one already exists.
  .post('/:id/pitch', async (c) => {
    const id = c.req.param('id');
    const [idea] = await db.select().from(ideas).where(eq(ideas.id, id));
    if (!idea) return c.json({ error: 'not_found' }, 404);
    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.ideaId, id), eq(documents.type, 'idea_pitch')));
    if (existing) return c.json({ error: 'pitch_exists', documentId: existing.id }, 409);

    const [template] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.type, 'idea_pitch'),
          eq(templates.isDefault, true),
          isNull(templates.archivedAt),
        ),
      );
    let contentJson: unknown = { type: 'doc', content: [] };
    let contentMd = '';
    if (template) {
      contentMd = template.bodyMd.replaceAll('{{title}}', idea.title);
      // Replace inside JSON text nodes; escape the title for JSON string context.
      const escapedTitle = JSON.stringify(idea.title).slice(1, -1);
      contentJson = JSON.parse(
        JSON.stringify(template.bodyJson).replaceAll('{{title}}', escapedTitle),
      );
    }
    const user = c.get('currentUser');
    const [doc] = await db
      .insert(documents)
      .values({
        projectId: idea.projectId,
        featureId: idea.promotedFeatureId ?? null,
        ideaId: idea.id,
        type: 'idea_pitch',
        title: `${idea.title} — Idea pitch`,
        contentJson,
        contentMd,
        createdBy: user?.id ?? null,
        updatedBy: user?.id ?? null,
      })
      .returning();
    return c.json(doc, 201);
  })
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

      const feature = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(features)
          .values({
            projectId: idea.projectId,
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
        // Transfer the pitch doc to the new feature; idea_id stays for provenance.
        await tx
          .update(documents)
          .set({ featureId: row.id, updatedAt: new Date() })
          .where(and(eq(documents.ideaId, id), eq(documents.type, 'idea_pitch')));
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
