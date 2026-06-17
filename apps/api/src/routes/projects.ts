import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { projectCreate, projectUpdate, memberAdd, memberUpdate } from '@productmap/shared';
import { projects, memberships, users } from '@productmap/db';
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
    const deleted = await db.delete(projects).where(eq(projects.id, c.req.param('projectId'))).returning({ id: projects.id });
    if (!deleted.length) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  })
  .get('/:projectId/members', requireMembership('viewer'), async (c) => {
    const rows = await db
      .select({ userId: memberships.userId, role: memberships.role, name: users.name, color: users.color })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.projectId, c.req.param('projectId')));
    return c.json(rows);
  })
  .post('/:projectId/members', requireMembership('owner'), zValidator('json', memberAdd, bad), async (c) => {
    const projectId = c.req.param('projectId');
    const input = c.req.valid('json');

    // Resolve userId from input — verify existence for the direct-id path.
    let userId: string;
    if (input.userId) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
      if (!u) return c.json({ error: 'user_not_found' }, 404);
      userId = u.id;
    } else if (input.email) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
      if (!u) return c.json({ error: 'user_not_found' }, 404);
      userId = u.id;
    } else {
      return c.json({ error: 'validation' }, 400);
    }

    const role = input.role;

    // Transactional upsert with last-owner guard on demote.
    const result = await db.transaction(async (tx) => {
      // Lock all owner rows for this project to prevent TOCTOU.
      const owners = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.projectId, projectId), eq(memberships.role, 'owner')))
        .for('update');

      // Check if this is a demote of the last owner.
      const isCurrentOwner = owners.some((o) => o.userId === userId);
      const wouldLeaveNoOwner = isCurrentOwner && owners.length === 1 && role !== 'owner';
      if (wouldLeaveNoOwner) return { conflict: true } as const;

      await tx
        .insert(memberships)
        .values({ userId, projectId, role })
        .onConflictDoUpdate({ target: [memberships.userId, memberships.projectId], set: { role } });

      return { conflict: false, userId, projectId, role } as const;
    });

    if (result.conflict) return c.json({ error: 'last_owner' }, 409);
    return c.json({ userId: result.userId, projectId: result.projectId, role: result.role }, 201);
  })
  .patch('/:projectId/members/:userId', requireMembership('owner'), zValidator('json', memberUpdate, bad), async (c) => {
    const projectId = c.req.param('projectId');
    const userId = c.req.param('userId');
    const { role } = c.req.valid('json');

    const result = await db.transaction(async (tx) => {
      // Lock all owner rows for this project to prevent TOCTOU.
      const owners = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.projectId, projectId), eq(memberships.role, 'owner')))
        .for('update');

      const isCurrentOwner = owners.some((o) => o.userId === userId);
      const wouldLeaveNoOwner = isCurrentOwner && owners.length === 1 && role !== 'owner';
      if (wouldLeaveNoOwner) return { conflict: true } as const;

      const [row] = await tx
        .update(memberships)
        .set({ role })
        .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId)))
        .returning();

      if (!row) return { notFound: true } as const;
      return { conflict: false, notFound: false, row } as const;
    });

    if (result.conflict) return c.json({ error: 'last_owner' }, 409);
    if (result.notFound) return c.json({ error: 'not_found' }, 404);
    return c.json({ userId, projectId, role });
  })
  .delete('/:projectId/members/:userId', requireMembership('owner'), async (c) => {
    const projectId = c.req.param('projectId');
    const userId = c.req.param('userId');

    const result = await db.transaction(async (tx) => {
      // Lock all owner rows for this project to prevent TOCTOU.
      const owners = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.projectId, projectId), eq(memberships.role, 'owner')))
        .for('update');

      const isCurrentOwner = owners.some((o) => o.userId === userId);
      const wouldLeaveNoOwner = isCurrentOwner && owners.length === 1;
      if (wouldLeaveNoOwner) return { conflict: true } as const;

      await tx
        .delete(memberships)
        .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId)));

      return { conflict: false } as const;
    });

    if (result.conflict) return c.json({ error: 'last_owner' }, 409);
    return c.body(null, 204);
  });
