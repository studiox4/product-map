// Driver-agnostic db handle. Imports NO pg / node-postgres so the Hono `app`
// graph stays browser-safe. The concrete Db is injected at runtime:
//   - node entry (index.ts) builds a pg pool via createDb() and calls configureDb()
//   - demo path builds a PGlite drizzle handle and calls configureDb()
// All route imports of `{ db }` forward to the configured handle via a Proxy.
import type { Db } from '@productmap/db';

let _db: Db | null = null;

export function configureDb(d: Db): void {
  _db = d;
}

export function isDbConfigured(): boolean {
  return _db !== null;
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    if (!_db) throw new Error('db not configured — call configureDb() first');
    const v = (_db as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === 'function' ? v.bind(_db) : v;
  },
}) as Db;
