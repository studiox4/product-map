import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { documentCreate, documentUpdate } from '@productmap/shared';
import { documents, features, ideas, releases, templates } from '@productmap/db/schema';
import type { Context } from 'hono';
import { db } from '../db';
import { tiptapToMarkdown } from '../lib/markdown';
import { type MembershipEnv } from '../middleware/membership';
import { loadScoped } from '../lib/scope';
import { recordActivity, addCollaborator } from '../lib/activity';

const EMPTY_DOC = { type: 'doc', content: [] };

type DocRow = typeof documents.$inferSelect;

function toMeta(row: DocRow) {
  const { contentJson: _json, contentMd: _md, ...meta } = row;
  return meta;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

function validationHook(result: { success: boolean; error?: unknown }, c: Context) {
  if (!result.success) {
    return c.json(
      { error: 'validation', issues: (result.error as { issues: unknown }).issues },
      400,
    );
  }
}

function wordCount(md: string): number {
  return md.split(/\s+/).filter(Boolean).length;
}

export const documentsRoutes = new Hono<MembershipEnv>()
  // GET /api/projects/:projectId/documents?featureId= → DocumentMeta[]
  // GET /api/projects/:projectId/documents?all=true   → DocumentListItem[] (meta + featureTitle/featureHorizon/wordCount)
  .get('/', async (c) => {
    const pid = c.get('currentProjectId');
    if (c.req.query('all') === 'true') {
      const rows = await db
        .select({
          id: documents.id,
          featureId: documents.featureId,
          ideaId: documents.ideaId,
          type: documents.type,
          title: documents.title,
          status: documents.status,
          cover: documents.cover,
          createdBy: documents.createdBy,
          updatedBy: documents.updatedBy,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          featureTitle: features.title,
          featureHorizon: features.horizon,
          ideaTitle: ideas.title,
          releaseId: releases.id,
          releaseName: releases.name,
          contentMd: documents.contentMd,
        })
        .from(documents)
        .leftJoin(features, eq(documents.featureId, features.id))
        .leftJoin(ideas, eq(documents.ideaId, ideas.id))
        .leftJoin(releases, eq(releases.notesDocId, documents.id))
        .where(and(eq(documents.projectId, pid), isNull(features.archivedAt)))
        .orderBy(asc(documents.createdAt));
      return c.json(
        rows.map(({ contentMd, ideaTitle, releaseId, releaseName, ...item }) => {
          // Owner precedence: feature (incl. promoted pitches carrying both ids)
          // → idea → release. Null only for orphaned release_notes docs.
          const ownerLabel =
            item.featureId && item.featureTitle
              ? { kind: 'feature' as const, id: item.featureId, title: item.featureTitle }
              : item.ideaId && ideaTitle
                ? { kind: 'idea' as const, id: item.ideaId, title: ideaTitle }
                : releaseId
                  ? { kind: 'release' as const, id: releaseId, title: releaseName }
                  : null;
          return {
            ...item,
            featureTitle: item.featureTitle ?? '',
            wordCount: wordCount(contentMd),
            ownerLabel,
          };
        }),
      );
    }
    const featureId = c.req.query('featureId');
    const rows = await db
      .select()
      .from(documents)
      .where(featureId ? and(eq(documents.projectId, pid), eq(documents.featureId, featureId)) : eq(documents.projectId, pid))
      .orderBy(asc(documents.createdAt));
    return c.json(rows.map(toMeta));
  })
  // POST /api/projects/:projectId/documents → DocumentFull (201)
  .post('/', zValidator('json', documentCreate, validationHook), async (c) => {
    const body = c.req.valid('json');
    const pid = c.get('currentProjectId');
    // Scope feature to this project (404 if cross-project or missing)
    const feature = await loadScoped(features, body.featureId, pid) as typeof features.$inferSelect;

    // Template resolution: explicit templateId → that template; else the
    // default DB template for the doc type; fromTemplate:false → blank.
    let template: typeof templates.$inferSelect | undefined;
    if (body.templateId) {
      [template] = await db.select().from(templates).where(eq(templates.id, body.templateId));
      if (!template) return c.json({ error: 'not_found' }, 404);
    } else if (body.fromTemplate) {
      [template] = await db
        .select()
        .from(templates)
        .where(
          and(
            eq(templates.type, body.type),
            eq(templates.isDefault, true),
            isNull(templates.archivedAt),
          ),
        );
    }
    let contentJson: unknown = EMPTY_DOC;
    let contentMd = '';
    if (template) {
      contentMd = template.bodyMd.replaceAll('{{title}}', body.title);
      // Replace inside JSON text nodes; escape the title for JSON string context.
      const escapedTitle = JSON.stringify(body.title).slice(1, -1);
      contentJson = JSON.parse(
        JSON.stringify(template.bodyJson).replaceAll('{{title}}', escapedTitle),
      );
    }
    const user = c.get('currentUser');
    const [row] = await db
      .insert(documents)
      .values({
        projectId: pid,
        featureId: body.featureId,
        type: body.type,
        title: body.title,
        contentJson,
        contentMd,
        createdBy: user?.id ?? null,
        updatedBy: user?.id ?? null,
      })
      .returning();
    await recordActivity(body.featureId, pid, user?.id, 'doc_created', { to: row.title });
    await addCollaborator(body.featureId, user?.id);
    return c.json(row, 201);
  })
  // GET /api/projects/:projectId/documents/:id/export.md → text/markdown attachment
  .get('/:id/export.md', async (c) => {
    const pid = c.get('currentProjectId');
    const row = await loadScoped(documents, c.req.param('id'), pid) as typeof documents.$inferSelect;
    return c.body(row.contentMd, 200, {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${slugify(row.title)}.md"`,
    });
  })
  // GET /api/projects/:projectId/documents/:id → DocumentFull
  .get('/:id', async (c) => {
    const pid = c.get('currentProjectId');
    const row = await loadScoped(documents, c.req.param('id'), pid) as typeof documents.$inferSelect;
    return c.json(row);
  })
  // PATCH /api/projects/:projectId/documents/:id → DocumentMeta (server derives contentMd)
  .patch('/:id', zValidator('json', documentUpdate, validationHook), async (c) => {
    const id = c.req.param('id')!;
    const body = c.req.valid('json');
    const pid = c.get('currentProjectId');
    const user = c.get('currentUser');
    const prev = await loadScoped(documents, id, pid) as typeof documents.$inferSelect;
    const set: Partial<typeof documents.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    };
    if (body.title !== undefined) set.title = body.title;
    if (body.status !== undefined) set.status = body.status;
    if (body.cover !== undefined) set.cover = body.cover;
    if (body.contentJson !== undefined) {
      set.contentJson = body.contentJson;
      set.contentMd = tiptapToMarkdown(body.contentJson);
    }
    const [row] = await db
      .update(documents)
      .set(set)
      .where(eq(documents.id, id))
      .returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    // Activity/collaborators are feature-scoped; idea- and release-owned docs
    // (feature_id NULL) have no feature feed to write into.
    if (row.featureId) {
      if (body.status !== undefined && row.status !== prev.status) {
        await recordActivity(row.featureId, pid, user?.id, 'doc_status_changed', {
          from: prev.status,
          to: row.status,
        });
      }
      if (body.title !== undefined && row.title !== prev.title) {
        await recordActivity(row.featureId, pid, user?.id, 'doc_renamed', { from: prev.title, to: row.title });
      }
      await addCollaborator(row.featureId, user?.id);
    }
    return c.json(toMeta(row));
  })
  // DELETE /api/projects/:projectId/documents/:id → 204
  .delete('/:id', async (c) => {
    const pid = c.get('currentProjectId');
    await loadScoped(documents, c.req.param('id'), pid);
    await db
      .delete(documents)
      .where(eq(documents.id, c.req.param('id')));
    return c.body(null, 204);
  });

// Mounted at /api/projects/:projectId in project-scoped.ts → GET /api/projects/:projectId/export.zip
export const exportRoutes = new Hono<MembershipEnv>().get('/export.zip', async (c) => {
  const pid = c.get('currentProjectId');
  const featureRows = await db.select().from(features).where(eq(features.projectId, pid)).orderBy(asc(features.createdAt));
  const docRows = await db.select().from(documents).where(eq(documents.projectId, pid)).orderBy(asc(documents.createdAt));

  const { default: archiver } = await import('archiver');
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
  });

  for (const feature of featureRows) {
    const featureSlug = slugify(feature.title);
    for (const doc of docRows.filter((d) => d.featureId === feature.id)) {
      archive.append(doc.contentMd, { name: `${featureSlug}/${slugify(doc.title)}.md` });
    }
  }
  void archive.finalize();
  const buf = await done;

  return c.body(new Uint8Array(buf).buffer as ArrayBuffer, 200, {
    'content-type': 'application/zip',
    'content-disposition': 'attachment; filename="productmap-export.zip"',
  });
});
