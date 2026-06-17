// Mounted at /api/projects/:projectId/releases (project-scoped.ts).
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, count, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { releaseCreate, releaseUpdate, releaseFeaturesPut } from '@productmap/shared';
import { releases, features, documents, templates } from '@productmap/db';
import { db } from '../db';
import { type MembershipEnv } from '../middleware/membership';
import { loadScoped } from '../lib/scope';
import { recordActivity } from '../lib/activity';
import { markdownToTiptap } from '../lib/markdown';

const EMPTY_DOC = { type: 'doc', content: [] };

type ReleaseRow = typeof releases.$inferSelect;

async function releaseFeatures(releaseId: string, projectId?: string) {
  return db
    .select()
    .from(features)
    .where(
      projectId
        ? and(eq(features.releaseId, releaseId), eq(features.projectId, projectId))
        : eq(features.releaseId, releaseId),
    )
    .orderBy(asc(features.sortOrder), asc(features.createdAt));
}

/**
 * Apply name/targetDate/status updates to a release. Status moves BOTH ways:
 * →shipped stamps shipped_at, →planned clears it; every transition logs
 * release_status_changed (from,to) on each member feature (activity is
 * feature-scoped). Same-status updates are no-ops for shipped_at + activity.
 * Returns null when the release does not exist.
 */
async function updateRelease(
  id: string,
  updates: { name?: string; targetDate?: string | null; status?: ReleaseRow['status'] },
  userId: string | undefined,
): Promise<ReleaseRow | null> {
  const [prev] = await db.select().from(releases).where(eq(releases.id, id));
  if (!prev) return null;
  const set: Partial<typeof releases.$inferInsert> = {};
  if (updates.name !== undefined) set.name = updates.name;
  if (updates.targetDate !== undefined) set.targetDate = updates.targetDate;
  const statusChanged = updates.status !== undefined && updates.status !== prev.status;
  if (statusChanged) {
    set.status = updates.status;
    set.shippedAt = updates.status === 'shipped' ? new Date() : null;
  }
  if (Object.keys(set).length === 0) return prev;
  const [row] = await db.update(releases).set(set).where(eq(releases.id, id)).returning();
  if (statusChanged) {
    for (const feature of await releaseFeatures(id, prev.projectId)) {
      await recordActivity(feature.id, userId, 'release_status_changed', {
        releaseId: row.id,
        releaseName: row.name,
        from: prev.status,
        to: row.status,
      });
    }
  }
  return row;
}

/**
 * The release's notes doc, creating one from the default release_notes
 * template if none is linked yet ({{title}} = release name). Returns the doc
 * row plus whether this call created it.
 */
async function ensureNotesDoc(
  release: ReleaseRow,
  userId: string | undefined,
): Promise<{ doc: typeof documents.$inferSelect; created: boolean }> {
  if (release.notesDocId) {
    const [existing] = await db.select().from(documents).where(eq(documents.id, release.notesDocId));
    if (existing) return { doc: existing, created: false };
  }
  const [template] = await db
    .select()
    .from(templates)
    .where(
      and(eq(templates.type, 'release_notes'), eq(templates.isDefault, true), isNull(templates.archivedAt)),
    );
  let contentJson: unknown = EMPTY_DOC;
  let contentMd = '';
  if (template) {
    contentMd = template.bodyMd.replaceAll('{{title}}', release.name);
    const escapedTitle = JSON.stringify(release.name).slice(1, -1);
    contentJson = JSON.parse(JSON.stringify(template.bodyJson).replaceAll('{{title}}', escapedTitle));
  }
  // release_notes docs are owned via releases.notes_doc_id: feature_id and
  // idea_id both stay NULL (documents_owner_check).
  const [doc] = await db
    .insert(documents)
    .values({
      projectId: release.projectId,
      type: 'release_notes',
      title: release.name,
      contentJson,
      contentMd,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    })
    .returning();
  await db.update(releases).set({ notesDocId: doc.id }).where(eq(releases.id, release.id));
  return { doc, created: true };
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

export const releasesRoutes = new Hono<MembershipEnv>()
  .get('/', async (c) => {
    const pid = c.get('currentProjectId');
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
      .where(eq(releases.projectId, pid))
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
      const projectId = c.get('currentProjectId');
      const [row] = await db
        .insert(releases)
        .values({ projectId, name: body.name, targetDate: body.targetDate ?? null })
        .returning();
      return c.json(row, 201);
    },
  )
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    const row = await loadScoped(releases, id, pid);
    return c.json({ ...row, features: await releaseFeatures(id, pid) });
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
      const pid = c.get('currentProjectId');
      await loadScoped(releases, id, pid);
      const updates = c.req.valid('json');
      const row = await updateRelease(id, updates, c.get('currentUser')?.id);
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    await loadScoped(releases, id, pid);
    const deleted = await db.delete(releases).where(eq(releases.id, id)).returning({ id: releases.id });
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  })
  // Thin back-compat alias for PATCH {status:'shipped'} (same logic, same
  // release_status_changed activity). Idempotent: re-shipping is a no-op.
  .post('/:id/ship', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    await loadScoped(releases, id, pid);
    const row = await updateRelease(id, { status: 'shipped' }, c.get('currentUser')?.id);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  })
  // POST /:id/notes-doc → DocumentFull (201 created from default template, 200 existing).
  .post('/:id/notes-doc', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    const release = (await loadScoped(releases, id, pid)) as ReleaseRow;
    const { doc, created } = await ensureNotesDoc(release, c.get('currentUser')?.id);
    return c.json(doc, created ? 201 : 200);
  })
  // POST /:id/generate-notes → DocumentFull. Pure assembly (no AI): one ##
  // section per member feature with the first paragraph of each of its FINAL
  // docs, run through the markdown→tiptap pipeline, overwriting the notes doc.
  .post('/:id/generate-notes', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    const user = c.get('currentUser');
    const release = (await loadScoped(releases, id, pid)) as ReleaseRow;
    const { doc } = await ensureNotesDoc(release, user?.id);

    const sections: string[] = [];
    for (const feature of await releaseFeatures(id, pid)) {
      const lines: string[] = [`## ${feature.title}`];
      const finals = await db
        .select({ contentMd: documents.contentMd })
        .from(documents)
        .where(sql`${documents.featureId} = ${feature.id} and ${documents.status} = 'final'`)
        .orderBy(asc(documents.createdAt));
      for (const final of finals) {
        const summary = firstParagraph(final.contentMd);
        if (summary) lines.push(summary);
      }
      sections.push(lines.join('\n\n'));
    }
    const contentMd = sections.join('\n\n');
    const [updated] = await db
      .update(documents)
      .set({
        contentMd,
        contentJson: markdownToTiptap(contentMd),
        updatedAt: new Date(),
        updatedBy: user?.id ?? null,
      })
      .where(eq(documents.id, doc.id))
      .returning();
    return c.json(updated);
  })
  // PUT /:id/features {featureIds} → replace-set membership. Features in the
  // list are pulled into this release (stealing from any other release);
  // current members left out of the list are cleared.
  .put(
    '/:id/features',
    zValidator('json', releaseFeaturesPut, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation', issues: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const id = c.req.param('id');
      const pid = c.get('currentProjectId');
      const release = await loadScoped(releases, id, pid);
      const { featureIds } = c.req.valid('json');
      const ids = [...new Set(featureIds)];
      if (ids.length > 0) {
        // Project-scoped membership check: reject body ids that belong to another project.
        const existing = await db
          .select({ id: features.id })
          .from(features)
          .where(and(inArray(features.id, ids), eq(features.projectId, pid)));
        if (existing.length !== ids.length) return c.json({ error: 'not_found' }, 404);
      }
      await db
        .update(features)
        .set({ releaseId: null })
        .where(
          ids.length > 0
            ? and(eq(features.releaseId, id), notInArray(features.id, ids), eq(features.projectId, pid))
            : and(eq(features.releaseId, id), eq(features.projectId, pid)),
        );
      if (ids.length > 0) {
        // ids are pre-validated to belong to pid above; the projectId predicate
        // is belt-and-suspenders so the assignment can never cross projects.
        await db.update(features).set({ releaseId: id }).where(and(inArray(features.id, ids), eq(features.projectId, pid)));
      }
      return c.json({ ...release, features: await releaseFeatures(id, pid) });
    },
  )
  .get('/:id/notes.md', async (c) => {
    const id = c.req.param('id');
    const pid = c.get('currentProjectId');
    const release = (await loadScoped(releases, id, pid)) as ReleaseRow;
    const rows = await releaseFeatures(id, pid);
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
