import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { users } from '@productmap/db/schema';
import { db } from '../db';
import { verifyAccess } from '../lib/auth/tokens';
import { ACCESS_COOKIE } from '../lib/auth/cookies';
import type { UserRow } from './current-user';

export type AuthEnv = { Variables: { currentUser: UserRow } };

/**
 * Verify the access cookie (signature + expiry only — no DB read) and attach a
 * lightweight currentUser. 401 if absent/invalid. The DB row is NOT loaded on
 * the hot path; routes that only need id/role use these claim-derived fields.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  // Cookie is the primary credential. Fall back to a standard `Authorization:
  // Bearer <token>` header — used by the in-browser demo backend (the browser
  // forbids setting a `Cookie` header on a constructed Request) and a legitimate
  // bearer path for any non-cookie client.
  let token = getCookie(c, ACCESS_COOKIE);
  if (!token) {
    const auth = c.req.header('Authorization');
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  }
  const claims = token ? await verifyAccess(token) : null;
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  // Claim-backed user: id + role are authoritative for the access TTL.
  c.set('currentUser', { id: claims.sub, role: claims.role } as UserRow);
  await next();
});

/** Loads the full user row when a handler needs more than id/role. */
export async function loadUser(id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get('currentUser');
  if (!user || user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  await next();
});
