// Dream-tier decision routes. Mounted at /api/projects/:projectId in project-scoped.ts,
// so paths here are /decisions… and /ai/suggest-decision.
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, or } from 'drizzle-orm';
import { generateObject } from 'ai';
import { z } from 'zod';
import { decisionCreate, suggestDecisionBody } from '@productmap/shared';
import { comments, decisions, features, users } from '@productmap/db';
import { db } from '../db';
import { type MembershipEnv } from '../middleware/membership';
import { loadUser } from '../middleware/auth';
import { recordActivity, addCollaborator } from '../lib/activity';
import { createAiModel } from '../lib/ai';
import { loadScoped, loadScopedComment } from '../lib/scope';

const decisionColumns = {
  id: decisions.id,
  featureId: decisions.featureId,
  title: decisions.title,
  decisionMd: decisions.decisionMd,
  alternativesMd: decisions.alternativesMd,
  sourceCommentId: decisions.sourceCommentId,
  decidedBy: decisions.decidedBy,
  decidedByName: users.name,
  decidedByColor: users.color,
  decidedAt: decisions.decidedAt,
  createdAt: decisions.createdAt,
};

const SUGGEST_SYSTEM_PROMPT =
  'You extract product decisions from resolved discussion threads. Given a thread, judge whether it ' +
  'records a concrete decision. Respond with: suggested (false when no clear decision was reached), ' +
  'title (a short imperative decision title), decisionMd (1-3 markdown sentences stating what was ' +
  'decided and why), alternativesMd (markdown bullet list of alternatives considered, empty string if none).';

const decisionSuggestion = z.object({
  suggested: z.boolean(),
  title: z.string(),
  decisionMd: z.string(),
  alternativesMd: z.string(),
});

export const decisionsRoutes = new Hono<MembershipEnv>()
  .get('/decisions', async (c) => {
    const pid = c.get('currentProjectId');
    const featureId = c.req.query('featureId');
    const projectFilter = eq(decisions.projectId, pid);
    const where = featureId ? and(projectFilter, eq(decisions.featureId, featureId)) : projectFilter;
    const rows = await db
      .select(decisionColumns)
      .from(decisions)
      .leftJoin(users, eq(decisions.decidedBy, users.id))
      .where(where)
      .orderBy(desc(decisions.decidedAt));
    return c.json(rows);
  })
  .post(
    '/decisions',
    zValidator('json', decisionCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.get('currentUser');
      if (!user) return c.json({ error: 'unauthorized' }, 401);

      const pid = c.get('currentProjectId');

      if (body.featureId) {
        await loadScoped(features, body.featureId, pid);
      }
      if (body.sourceCommentId) {
        await loadScopedComment(body.sourceCommentId, pid);
      }

      const [row] = await db
        .insert(decisions)
        .values({
          projectId: pid,
          featureId: body.featureId ?? null,
          title: body.title,
          decisionMd: body.decisionMd,
          alternativesMd: body.alternativesMd ?? '',
          sourceCommentId: body.sourceCommentId ?? null,
          decidedBy: user.id,
        })
        .returning();

      const fullUser = await loadUser(user.id);
      if (row.featureId) {
        await recordActivity(row.featureId, user.id, 'decision_logged', {
          decisionId: row.id,
          title: row.title,
        });
        await addCollaborator(row.featureId, user.id);
      }
      return c.json({ ...row, decidedByName: fullUser?.name ?? null, decidedByColor: fullUser?.color ?? null }, 201);
    },
  )
  .delete('/decisions/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    await loadScoped(decisions, id, pid);
    await db.delete(decisions).where(eq(decisions.id, id));
    return c.body(null, 204);
  })
  .post(
    '/ai/suggest-decision',
    zValidator('json', suggestDecisionBody, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const model = createAiModel();
      if (!model) return c.json({ error: 'ai_disabled' }, 503);

      const { commentId } = c.req.valid('json');
      const pid = c.get('currentProjectId');
      const comment = await loadScopedComment(commentId, pid);
      const rootId = comment.parentId ?? comment.id;

      // Full thread (root first, then replies in order) with author names.
      const thread = await db
        .select({ body: comments.body, parentId: comments.parentId, authorName: users.name })
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(or(eq(comments.id, rootId), eq(comments.parentId, rootId)))
        .orderBy(asc(comments.createdAt));
      thread.sort((a, b) => Number(a.parentId !== null) - Number(b.parentId !== null));

      const prompt = [
        'Resolved comment thread (root first):',
        '',
        ...thread.map((m) => `${m.authorName}: ${m.body}`),
        '',
        'Extract the decision recorded in this thread.',
      ].join('\n');

      try {
        const { object } = await generateObject({
          model,
          schema: decisionSuggestion,
          system: SUGGEST_SYSTEM_PROMPT,
          prompt,
        });
        return c.json(object);
      } catch (err) {
        console.error('ai suggest-decision error', err);
        return c.json({ error: 'generation_failed' }, 502);
      }
    },
  );
