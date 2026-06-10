import { createMiddleware } from 'hono/factory';
import { asc, eq } from 'drizzle-orm';
import { users } from '@productmap/db';
import { db } from '../db';

export type UserRow = typeof users.$inferSelect;

/** Hono env for routes that read the resolved request user. */
export type CurrentUserEnv = { Variables: { currentUser: UserRow | null } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves `x-user-id` to a user row (fallback: first seeded user) and attaches
 * it as `currentUser`. Resolution is skipped on read-only requests — only
 * mutating handlers consume the actor.
 */
export const currentUser = createMiddleware<CurrentUserEnv>(async (c, next) => {
  let user: UserRow | null = null;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const headerId = c.req.header('x-user-id');
    if (headerId && UUID_RE.test(headerId)) {
      const [row] = await db.select().from(users).where(eq(users.id, headerId));
      user = row ?? null;
    }
    if (!user) {
      const [first] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1);
      user = first ?? null;
    }
  }
  c.set('currentUser', user);
  await next();
});
