import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, gte } from 'drizzle-orm';
import { generateDoc } from '@productmap/shared';
import { db } from '../db';
import { activity, features, users } from '@productmap/db';
import { createAiClient, generateDocStream, generateDigestStream } from '../lib/ai';

export const aiRoutes = new Hono()
  .get('/status', (c) => c.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) }))
  .post('/generate-doc', zValidator('json', generateDoc), async (c) => {
    const client = createAiClient();
    if (!client) return c.json({ error: 'ai_disabled' }, 503);

    const { docType, featureId, brief } = c.req.valid('json');
    const [feature] = await db.select().from(features).where(eq(features.id, featureId));
    if (!feature) return c.json({ error: 'not_found' }, 404);

    return streamSSE(c, async (stream) => {
      try {
        for await (const text of generateDocStream({
          docType,
          brief,
          feature: { title: feature.title, horizon: feature.horizon, status: feature.status },
          client,
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
    const client = createAiClient();
    if (!client) return c.json({ error: 'ai_disabled' }, 503);

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
        for await (const text of generateDigestStream({ events, client })) {
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
