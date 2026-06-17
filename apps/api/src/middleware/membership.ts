import { createMiddleware } from 'hono/factory';
import { and, eq } from 'drizzle-orm';
import { memberships } from '@productmap/db';
import { ROLE_RANK, type MemberRole } from '@productmap/shared';
import { db } from '../db';
import type { AuthEnv } from './auth';

export type MembershipEnv = AuthEnv & { Variables: { currentRole: MemberRole } };

/**
 * Gate a `:projectId` route. Allows instance admins (super-admin → effective
 * 'owner') and members whose role rank >= minRole. 404 for non-members (never
 * leak project existence); 403 for members with an insufficient role.
 * Sets `currentRole` (the effective role) for handlers. Must run after requireAuth.
 */
export function requireMembership(minRole: MemberRole) {
  return createMiddleware<MembershipEnv>(async (c, next) => {
    const user = c.get('currentUser');
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    const projectId = c.req.param('projectId');
    if (!projectId) return c.json({ error: 'not_found' }, 404);

    if (user.role === 'admin') {
      c.set('currentRole', 'owner');
      await next();
      return;
    }
    const [m] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.projectId, projectId)))
      .limit(1);
    if (!m) return c.json({ error: 'not_found' }, 404);
    if (ROLE_RANK[m.role] < ROLE_RANK[minRole]) return c.json({ error: 'forbidden' }, 403);
    c.set('currentRole', m.role);
    await next();
  });
}
