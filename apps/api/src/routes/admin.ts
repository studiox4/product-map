import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { seedDemo } from '@productmap/db/seed-data';
import { adminCreateUserInput, adminUpdateUserInput, USER_COLORS } from '@productmap/shared';
import { users } from '@productmap/db';
import { db } from '../db';
import { hashPassword } from '../lib/auth/password';
import { publicUser, adminUser } from '../lib/auth/serialize';
import { markdownToTiptap } from '../lib/markdown';

// POST /api/admin/reset-demo — truncate everything and re-run the demo seed.
// Dev-only convenience; hard-blocked in production.
export const adminRoutes = new Hono()
  .post('/reset-demo', async (c) => {
    if (process.env.NODE_ENV === 'production') {
      return c.json({ error: 'forbidden', message: 'reset-demo is disabled in production' }, 403);
    }
    await seedDemo(db, markdownToTiptap);
    return c.json({ ok: true });
  })
  .get('/users', async (c) => {
    const rows = await db.select().from(users).orderBy(asc(users.createdAt));
    return c.json(rows.map(adminUser));
  })
  .post('/users', zValidator('json', adminCreateUserInput, (r, c) =>
    r.success ? undefined : c.json({ error: 'validation', issues: r.error.issues }, 400)), async (c) => {
    const { email, name, role } = c.req.valid('json');
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const tempPassword = nanoid(16);
    const [row] = await db.insert(users).values({
      email, name, role, color: USER_COLORS[count % USER_COLORS.length], passwordHash: await hashPassword(tempPassword),
    }).returning();
    return c.json({ user: adminUser(row), tempPassword }, 201);
  })
  .patch('/users/:id', zValidator('json', adminUpdateUserInput, (r, c) =>
    r.success ? undefined : c.json({ error: 'validation', issues: r.error.issues }, 400)), async (c) => {
    const id = c.req.param('id');
    const { role, isActive, resetPassword } = c.req.valid('json');
    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) return c.json({ error: 'not_found' }, 404);
    const set: Partial<typeof users.$inferInsert> = {};
    if (role !== undefined) set.role = role;
    if (isActive !== undefined) { set.isActive = isActive; if (!isActive) set.tokenVersion = existing.tokenVersion + 1; }
    let tempPassword: string | undefined;
    if (resetPassword) { tempPassword = nanoid(16); set.passwordHash = await hashPassword(tempPassword); set.tokenVersion = (set.tokenVersion ?? existing.tokenVersion) + 1; }
    const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
    return c.json({ user: adminUser(row), ...(tempPassword ? { tempPassword } : {}) });
  });
