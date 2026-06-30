import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Runs a migration stream tracked in its own ledger table. Used by the paid
// edition for `ee` migrations so they never share core's ledger. ee migrations
// MUST be additive-only and must never alter or drop core tables.
export async function migrateStream(
  db: NodePgDatabase,
  opts: { folder: string; table: string },
): Promise<void> {
  await migrate(db, { migrationsFolder: opts.folder, migrationsTable: opts.table });
}
