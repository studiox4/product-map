import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { invites, memberships, projects, users } from '@productmap/db/schema';
import { db } from '../db';
import type { AuthEnv } from '../middleware/auth';
import type { MemberRole } from '@productmap/shared';

/** Load a non-revoked invite by token, with project name. null when unknown/revoked. */
async function loadActiveInvite(token: string) {
  const [row] = await db
    .select({
      token: invites.token, projectId: invites.projectId, role: invites.role,
      email: invites.email, expiresAt: invites.expiresAt,
      projectName: projects.name,
    })
    .from(invites)
    .innerJoin(projects, eq(projects.id, invites.projectId))
    .where(and(eq(invites.token, token), isNull(invites.revokedAt)))
    .limit(1);
  return row ?? null;
}

export const invitesRoutes = new Hono<AuthEnv>()
  // Preview — auth required (caller is logging in to decide whether to accept).
  .get('/:token', async (c) => {
    const inv = await loadActiveInvite(c.req.param('token'));
    if (!inv) return c.json({ error: 'not_found' }, 404);
    return c.json({
      projectId: inv.projectId,
      projectName: inv.projectName,
      role: inv.role,
      expired: inv.expiresAt.getTime() < Date.now(),
    });
  })
  // Accept — authenticated user joins with the embedded role.
  .post('/:token/accept', async (c) => {
    const user = c.get('currentUser');
    const inv = await loadActiveInvite(c.req.param('token')); // revoked/unknown → null → 404
    if (!inv) return c.json({ error: 'not_found' }, 404);
    if (inv.expiresAt.getTime() < Date.now()) return c.json({ error: 'expired' }, 410);

    if (inv.email) {
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, user.id));
      if (!u?.email || u.email.toLowerCase() !== inv.email.toLowerCase()) {
        return c.json({ error: 'email_mismatch' }, 403);
      }
    }

    // Idempotent: insert if absent; do NOT downgrade an existing membership.
    const inserted = await db
      .insert(memberships)
      .values({ userId: user.id, projectId: inv.projectId, role: inv.role })
      .onConflictDoNothing({ target: [memberships.userId, memberships.projectId] })
      .returning({ role: memberships.role });

    let actualRole: MemberRole;
    if (inserted.length > 0) {
      actualRole = inserted[0].role;
    } else {
      // Row already existed — return the actual (possibly higher) role.
      const [existing] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.projectId, inv.projectId)));
      actualRole = existing.role;
    }

    return c.json({ projectId: inv.projectId, role: actualRole });
  });
