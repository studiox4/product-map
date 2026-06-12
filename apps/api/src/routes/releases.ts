// Mounted at /api/releases (app.ts).
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, count, eq, sql } from 'drizzle-orm';
import { releaseCreate, releaseUpdate } from '@productmap/shared';
import { releases, features, documents } from '@productmap/db';
import { db } from '../db';
import { currentUser, type CurrentUserEnv } from '../middleware/current-user';
import { recordActivity } from '../lib/activity';

async function releaseFeatures(releaseId: string) {
  return db
    .select()
    .from(features)
    .where(eq(features.releaseId, releaseId))
    .orderBy(asc(features.sortOrder), asc(features.createdAt));
}

/** First markdown paragraph of a doc body (blank-line delimited). */
function firstParagraph(contentMd: string): string {
  return (
    contentMd
      .trim()
      .split(/\n\s*\n/)
      .find((p) => p.trim().length > 0)
      ?.trim() ?? ''
  );
}

export const releasesRoutes = new Hono<CurrentUserEnv>()
  .use('*', currentUser)
  .get('/', async (c) => {
    const rows = await db
      .select({
        id: releases.id,
        name: releases.name,
        targetDate: releases.targetDate,
        status: releases.status,
        notesDocId: releases.notesDocId,
        shippedAt: releases.shippedAt,
        createdAt: releases.createdAt,
        featureCount: count(features.id),
      })
      .from(releases)
      .leftJoin(features, eq(features.releaseId, releases.id))
      .groupBy(releases.id)
      .orderBy(asc(releases.createdAt));
    return c.json(rows);
  })
  .post(
    '/',
    zValidator('json', releaseCreate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const body = c.req.valid('json');
      const [row] = await db
        .insert(releases)
        .values({ name: body.name, targetDate: body.targetDate ?? null })
        .returning();
      return c.json(row, 201);
    },
  )
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const [row] = await db.select().from(releases).where(eq(releases.id, id));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ ...row, features: await releaseFeatures(id) });
  })
  .patch(
    '/:id',
    zValidator('json', releaseUpdate, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const updates = c.req.valid('json');
      const [row] = await db.update(releases).set(updates).where(eq(releases.id, id)).returning();
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await db.delete(releases).where(eq(releases.id, id)).returning({ id: releases.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  })
  .post('/:id/ship', async (c) => {
    const id = c.req.param('id');
    const user = c.get('currentUser');
    const [prev] = await db.select().from(releases).where(eq(releases.id, id));
    if (!prev) return c.json({ error: 'not_found' }, 404);
    if (prev.status === 'shipped') return c.json(prev); // idempotent — no duplicate activity
    const [row] = await db
      .update(releases)
      .set({ status: 'shipped', shippedAt: sql`now()` })
      .where(eq(releases.id, id))
      .returning();
    // Activity is feature-scoped: log the ship on every feature in the release.
    for (const feature of await releaseFeatures(id)) {
      await recordActivity(feature.id, user?.id, 'release_shipped', {
        releaseId: row.id,
        releaseName: row.name,
      });
    }
    return c.json(row);
  })
  .get('/:id/notes.md', async (c) => {
    const id = c.req.param('id');
    const [release] = await db.select().from(releases).where(eq(releases.id, id));
    if (!release) return c.json({ error: 'not_found' }, 404);
    const rows = await releaseFeatures(id);
    const sections: string[] = [`# ${release.name}`];
    for (const feature of rows) {
      const lines: string[] = [`## ${feature.title}`];
      const finals = await db
        .select({ contentMd: documents.contentMd })
        .from(documents)
        .where(sql`${documents.featureId} = ${feature.id} and ${documents.status} = 'final'`)
        .orderBy(asc(documents.createdAt));
      for (const doc of finals) {
        const summary = firstParagraph(doc.contentMd);
        if (summary) lines.push(summary);
      }
      sections.push(lines.join('\n\n'));
    }
    return c.text(`${sections.join('\n\n')}\n`, 200, {
      'content-type': 'text/markdown; charset=utf-8',
    });
  });
