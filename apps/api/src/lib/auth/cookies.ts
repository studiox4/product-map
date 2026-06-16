import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { config } from '../../config';
import { signAccess, signRefresh } from './tokens';

export const ACCESS_COOKIE = 'pm_session';
export const REFRESH_COOKIE = 'pm_refresh';
const REFRESH_PATH = '/api/auth/refresh';

interface CookieUser {
  id: string;
  role: 'admin' | 'member';
  tokenVersion: number;
}

const base = (maxAge: number, path: string) => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'Lax' as const,
  path,
  maxAge,
});

export async function setAccessCookie(c: Context, user: CookieUser): Promise<void> {
  setCookie(c, ACCESS_COOKIE, await signAccess(user), base(config.accessTtlSec, '/'));
}

export async function setAuthCookies(c: Context, user: CookieUser): Promise<void> {
  await setAccessCookie(c, user);
  setCookie(c, REFRESH_COOKIE, await signRefresh(user), base(config.refreshTtlSec, REFRESH_PATH));
}

export function clearAuthCookies(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE, { path: '/' });
  deleteCookie(c, REFRESH_COOKIE, { path: REFRESH_PATH });
}
