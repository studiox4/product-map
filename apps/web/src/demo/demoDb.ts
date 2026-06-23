// Builds an in-memory PGlite database with the real schema applied, and wraps it
// in a Drizzle handle structurally compatible with the production `Db`.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { Db } from '../../../../packages/db/src/index';
import { applyMigrations } from './migrations';

export interface DemoDb {
  client: PGlite;
  db: Db;
}

/**
 * Create a fresh, in-memory PGlite instance (NO idb:// persistence — zero-state
 * on every load), apply all migrations, and return a Drizzle handle typed as the
 * real `Db`. The pglite drizzle handle is structurally compatible with the
 * queries the routes run, so the cast is safe.
 */
export async function createDemoDb(): Promise<DemoDb> {
  const client = new PGlite();
  await applyMigrations(client);
  const db = drizzle(client) as unknown as Db;
  return { client, db };
}
