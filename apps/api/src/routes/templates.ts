import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { templateCreate, templateUpdate, archiveBody } from '@productmap/shared';
import { templates } from '@productmap/db/schema';
import type { Context } from 'hono';
import { db } from '../db';
import { tiptapToMarkdown } from '../lib/markdown';
import { type CurrentUserEnv } from '../middleware/current-user';

const EMPTY_DOC = { type: 'doc', content: [] };

function validationHook(result: { success: boolean; error?: unknown }, c: Context) {
  if (!result.success) {
    return c.json(
      { error: 'validation', issues: (result.error as { issues: unknown }).issues },
      400,
    );
  }
}

export const templatesRoutes = new Hono<CurrentUserEnv>()
  // GET /api/templates?type=&includeArchived= → Template[] (defaults first, then name)
  .get('/', async (c) => {
    const type = c.req.query('type');
    const includeArchived = c.req.query('includeArchived') === 'true';
    const conditions = [];
    if (type) conditions.push(eq(templates.type, type as typeof templates.$inferSelect.type));
    if (!includeArchived) conditions.push(isNull(templates.archivedAt));
    const rows = await db
      .select()
      .from(templates)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(templates.isDefault), asc(templates.name));
    return c.json(rows);
  })
  // POST /api/templates → Template (201; empty body allowed)
  .post('/', zValidator('json', templateCreate, validationHook), async (c) => {
    const body = c.req.valid('json');
    const user = c.get('currentUser');
    const bodyJson = body.bodyJson ?? EMPTY_DOC;
    const [row] = await db
      .insert(templates)
      .values({
        type: body.type,
        name: body.name,
        description: body.description ?? '',
        bodyJson,
        bodyMd: tiptapToMarkdown(bodyJson),
        promptHints: body.promptHints ?? '',
        createdBy: user?.id ?? null,
      })
      .returning();
    return c.json(row, 201);
  })
  // PATCH /api/templates/:id → Template (server derives body_md)
  .patch('/:id', zValidator('json', templateUpdate, validationHook), async (c) => {
    const body = c.req.valid('json');
    const set: Partial<typeof templates.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) set.name = body.name;
    if (body.description !== undefined) set.description = body.description;
    if (body.promptHints !== undefined) set.promptHints = body.promptHints;
    if (body.bodyJson !== undefined) {
      set.bodyJson = body.bodyJson;
      set.bodyMd = tiptapToMarkdown(body.bodyJson);
    }
    const [row] = await db
      .update(templates)
      .set(set)
      .where(eq(templates.id, c.req.param('id')!))
      .returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  })
  // POST /api/templates/:id/duplicate → Template (name + " copy")
  .post('/:id/duplicate', async (c) => {
    const [src] = await db.select().from(templates).where(eq(templates.id, c.req.param('id')));
    if (!src) return c.json({ error: 'not_found' }, 404);
    const user = c.get('currentUser');
    const [row] = await db
      .insert(templates)
      .values({
        type: src.type,
        name: `${src.name} copy`,
        description: src.description,
        bodyJson: src.bodyJson,
        bodyMd: src.bodyMd,
        promptHints: src.promptHints,
        isDefault: false,
        createdBy: user?.id ?? null,
      })
      .returning();
    return c.json(row, 201);
  })
  // POST /api/templates/:id/default → 204 (swaps default within its type)
  .post('/:id/default', async (c) => {
    const [target] = await db.select().from(templates).where(eq(templates.id, c.req.param('id')));
    if (!target) return c.json({ error: 'not_found' }, 404);
    if (target.archivedAt) {
      return c.json({ error: 'archived', message: 'An archived template cannot be the default.' }, 400);
    }
    if (!target.isDefault) {
      await db.transaction(async (tx) => {
        await tx
          .update(templates)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(templates.type, target.type), eq(templates.isDefault, true)));
        await tx
          .update(templates)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(templates.id, target.id));
      });
    }
    return c.body(null, 204);
  })
  // POST /api/templates/:id/archive {archived: boolean} → Template
  .post('/:id/archive', zValidator('json', archiveBody, validationHook), async (c) => {
    const { archived } = c.req.valid('json');
    const [target] = await db.select().from(templates).where(eq(templates.id, c.req.param('id')!));
    if (!target) return c.json({ error: 'not_found' }, 404);
    if (archived && target.isDefault) {
      return c.json(
        { error: 'default_template', message: 'Set another default for this type first.' },
        400,
      );
    }
    const [row] = await db
      .update(templates)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(templates.id, target.id))
      .returning();
    return c.json(row);
  });
