import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { projectCreate, projectUpdate } from '@productmap/shared';
import { projects, memberships } from '@productmap/db';
import { db } from '../db';
import { requireMembership, type MembershipEnv } from '../middleware/membership';

const bad = (r: { success: boolean; error?: { issues: unknown } }, c: any) =>
  r.success ? undefined : c.json({ error: 'validation', issues: r.error!.issues }, 400);

export const projectsRoutes = new Hono<MembershipEnv>()
  .get('/', async (c) => {
    const user = c.get('currentUser');
    if (user.role === 'admin') {
      const rows = await db.select().from(projects);
      return c.json(rows.map((p) => ({ id: p.id, name: p.name, vision: p.vision, aboutMd: p.aboutMd, role: 'owner' as const })));
    }
    const rows = await db
      .select({ id: projects.id, name: projects.name, vision: projects.vision, aboutMd: projects.aboutMd, role: memberships.role })
      .from(memberships)
      .innerJoin(projects, eq(projects.id, memberships.projectId))
      .where(eq(memberships.userId, user.id));
    return c.json(rows);
  })
  .post('/', zValidator('json', projectCreate, bad), async (c) => {
    const user = c.get('currentUser');
    const input = c.req.valid('json');
    const project = await db.transaction(async (tx) => {
      const [p] = await tx.insert(projects).values({ name: input.name, vision: input.vision ?? '', aboutMd: input.aboutMd ?? '' }).returning();
      await tx.insert(memberships).values({ userId: user.id, projectId: p.id, role: 'owner' });
      return p;
    });
    return c.json({ id: project.id, name: project.name, vision: project.vision, aboutMd: project.aboutMd, role: 'owner' as const }, 201);
  })
  .get('/:projectId', requireMembership('viewer'), async (c) => {
    const [p] = await db.select().from(projects).where(eq(projects.id, c.req.param('projectId')));
    if (!p) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: p.id, name: p.name, vision: p.vision, aboutMd: p.aboutMd, role: c.get('currentRole') });
  })
  .patch('/:projectId', requireMembership('owner'), zValidator('json', projectUpdate, bad), async (c) => {
    const [row] = await db.update(projects).set(c.req.valid('json')).where(eq(projects.id, c.req.param('projectId'))).returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, name: row.name, vision: row.vision, aboutMd: row.aboutMd });
  })
  .delete('/:projectId', requireMembership('owner'), async (c) => {
    await db.delete(projects).where(eq(projects.id, c.req.param('projectId')));
    return c.body(null, 204);
  });
