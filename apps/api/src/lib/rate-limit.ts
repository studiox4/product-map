import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { config } from '../config';

interface Bucket { count: number; resetAt: number; }
interface Options { max: number; windowMs: number; clock?: () => number; }

/** In-memory fixed-window limiter. Per-process only (documented multi-instance caveat). */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private opts: Options) {}
  private now() { return this.opts.clock ? this.opts.clock() : Date.now(); }

  hit(key: string): boolean {
    const now = this.now();
    const b = this.buckets.get(key);
    if (!b || now >= b.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.opts.windowMs });
      return true;
    }
    if (b.count >= this.opts.max) return false;
    b.count += 1;
    return true;
  }
}

/**
 * Client IP: first X-Forwarded-For hop when TRUST_PROXY is set, else the socket
 * IP via the node-server adapter's documented `getConnInfo`. Falling back to a
 * single 'unknown' bucket would throttle ALL clients together, so prefer a real
 * address. NOTE: with TRUST_PROXY off and clients behind a NAT/proxy, many users
 * share one egress IP — size limits accordingly and never put automated calls
 * (e.g. /refresh) in the same bucket as interactive login (see auth route).
 */
export function clientIp(c: Context): string {
  if (config.trustProxy) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) return xff.split(',')[0]!.trim();
    const xri = c.req.header('x-real-ip');
    if (xri) return xri.trim();
  }
  return getConnInfo(c).remote.address ?? 'unknown';
}

/**
 * CSRF defense for cookie auth: reject mutating cross-origin requests.
 * Same-origin (or missing Origin, e.g. server-to-server tests) is allowed.
 */
export function isSameOrigin(c: Context): boolean {
  const origin = c.req.header('origin');
  if (!origin) return true; // non-browser / same-origin navigations send none
  const host = c.req.header('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
