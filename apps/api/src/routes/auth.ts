import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getCookie } from 'hono/cookie';
import { eq, sql } from 'drizzle-orm';
import { registerInput, loginInput, changePasswordInput, USER_COLORS } from '@productmap/shared';
import { users } from '@productmap/db';
import { db } from '../db';
import { config } from '../config';
import { hashPassword, verifyPassword } from '../lib/auth/password';
import { setAuthCookies, setAccessCookie, clearAuthCookies, REFRESH_COOKIE } from '../lib/auth/cookies';
import { verifyRefresh } from '../lib/auth/tokens';
import { publicUser } from '../lib/auth/serialize';
import { RateLimiter, clientIp, isSameOrigin } from '../lib/rate-limit';
import { requireAuth, type AuthEnv } from '../middleware/auth';

// Interactive credential checks (login/register) — the brute-force surface.
const credLimiter = new RateLimiter({ max: 30, windowMs: 60_000 });
// /refresh is automated (fires on 401 across tabs) — separate, loose bucket.
const refreshLimiter = new RateLimiter({ max: 120, windowMs: 60_000 });
const badInput = (result: { success: boolean; error?: { issues: unknown } }, c: any) =>
  result.success ? undefined : c.json({ error: 'validation', issues: result.error!.issues }, 400);

export const authRoutes = new Hono<AuthEnv>()
  .use('*', async (c, next) => {
    if (c.req.method !== 'GET') {
      if (!isSameOrigin(c)) return c.json({ error: 'forbidden_origin' }, 403);
      const isRefresh = c.req.path.endsWith('/refresh');
      const limiter = isRefresh ? refreshLimiter : credLimiter;
      if (!limiter.hit(clientIp(c))) return c.json({ error: 'rate_limited' }, 429);
    }
    await next();
  })
  .post('/register', zValidator('json', registerInput, badInput), async (c) => {
    const { email, name, password } = c.req.valid('json');
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const isFirst = count === 0;
    if (!isFirst && !config.allowOpenSignup) return c.json({ error: 'signup_disabled' }, 403);
    const [{ count: emailTaken }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.email, email));
    if (emailTaken > 0) return c.json({ error: 'email_taken' }, 409);
    const color = USER_COLORS[count % USER_COLORS.length];
    const [row] = await db
      .insert(users)
      .values({ email, name, color, role: isFirst ? 'admin' : 'member', passwordHash: await hashPassword(password) })
      .returning();
    await setAuthCookies(c, row);
    return c.json(publicUser(row), 201);
  })
  .post('/login', zValidator('json', loginInput, badInput), async (c) => {
    const { email, password } = c.req.valid('json');
    const [row] = await db.select().from(users).where(eq(users.email, email));
    const ok = row && row.isActive && (await verifyPassword(row.passwordHash ?? '', password));
    if (!ok) return c.json({ error: 'invalid_credentials' }, 401);
    await setAuthCookies(c, row);
    return c.json(publicUser(row));
  })
  .post('/logout', (c) => {
    clearAuthCookies(c);
    return c.body(null, 204);
  })
  .post('/refresh', async (c) => {
    const token = getCookie(c, REFRESH_COOKIE);
    const claims = token ? await verifyRefresh(token) : null;
    if (!claims) return c.json({ error: 'unauthorized' }, 401);
    const [row] = await db.select().from(users).where(eq(users.id, claims.sub));
    if (!row || !row.isActive || row.tokenVersion !== claims.tv) {
      clearAuthCookies(c);
      return c.json({ error: 'unauthorized' }, 401);
    }
    await setAccessCookie(c, row);
    return c.json(publicUser(row));
  })
  .get('/me', requireAuth, async (c) => {
    const id = c.get('currentUser').id;
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (!row) return c.json({ error: 'unauthorized' }, 401);
    return c.json(publicUser(row));
  })
  .post('/change-password', requireAuth, zValidator('json', changePasswordInput, badInput), async (c) => {
    const id = c.get('currentUser').id;
    const { currentPassword, newPassword } = c.req.valid('json');
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (!row || !(await verifyPassword(row.passwordHash ?? '', currentPassword))) {
      return c.json({ error: 'invalid_credentials' }, 401);
    }
    const [updated] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), tokenVersion: row.tokenVersion + 1 })
      .where(eq(users.id, id))
      .returning();
    await setAuthCookies(c, updated);
    return c.json(publicUser(updated));
  });
