import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { generateDoc } from '@productmap/shared';
import { db } from '../db';
import { activity, features, templates, users } from '@productmap/db';
import { createAiModel, generateDocStream, generateDigestStream, isAiEnabled } from '../lib/ai';

const generateDocBody = generateDoc.extend({
  templateId: z.string().uuid().optional(),
});

export const aiRoutes = new Hono()
  .get('/status', (c) => c.json({ enabled: isAiEnabled() }))
  .post('/generate-doc', zValidator('json', generateDocBody), async (c) => {
    const model = createAiModel();
    if (!model) return c.json({ error: 'ai_disabled' }, 503);

    const { docType, featureId, brief, templateId } = c.req.valid('json');
    const [feature] = await db.select().from(features).where(eq(features.id, featureId));
    if (!feature) return c.json({ error: 'not_found' }, 404);

    // Resolve the DB template for prompt hints + skeleton: explicit templateId
    // wins, otherwise the non-archived default for the doc type.
    const [template] = templateId
      ? await db.select().from(templates).where(eq(templates.id, templateId))
      : await db
          .select()
          .from(templates)
          .where(
            and(
              eq(templates.type, docType),
              eq(templates.isDefault, true),
              isNull(templates.archivedAt),
            ),
          );
    if (templateId && !template) return c.json({ error: 'template_not_found' }, 404);

    return streamSSE(c, async (stream) => {
      try {
        for await (const text of generateDocStream({
          brief,
          feature: { title: feature.title, horizon: feature.horizon, status: feature.status },
          template: {
            promptHints: template?.promptHints ?? '',
            bodyMd: template?.bodyMd ?? '',
          },
          model,
        })) {
          await stream.writeSSE({ event: 'chunk', data: JSON.stringify({ text }) });
        }
        await stream.writeSSE({ event: 'done', data: '{}' });
      } catch (err) {
        console.error('ai generate-doc stream error', err);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'generation_failed' }),
        });
      }
    });
  })
  // POST /api/ai/digest → SSE stream summarizing the last 7 days of activity.
  .post('/digest', async (c) => {
    const model = createAiModel();
    if (!model) return c.json({ error: 'ai_disabled' }, 503);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        kind: activity.kind,
        featureTitle: features.title,
        actorName: users.name,
        payload: activity.payload,
        createdAt: activity.createdAt,
      })
      .from(activity)
      .innerJoin(users, eq(activity.actorId, users.id))
      .innerJoin(features, eq(activity.featureId, features.id))
      .where(gte(activity.createdAt, since))
      .orderBy(asc(activity.createdAt))
      .limit(1000);

    const events = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));

    return streamSSE(c, async (stream) => {
      try {
        for await (const text of generateDigestStream({ events, model })) {
          await stream.writeSSE({ event: 'chunk', data: JSON.stringify({ text }) });
        }
        await stream.writeSSE({ event: 'done', data: '{}' });
      } catch (err) {
        console.error('ai digest stream error', err);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'generation_failed' }),
        });
      }
    });
  });
