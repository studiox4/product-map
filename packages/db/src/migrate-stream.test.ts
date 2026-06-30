import { describe, it, expect, vi } from 'vitest';

const migrateSpy = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: migrateSpy }));

import { migrateStream } from './migrate-stream';

describe('migrateStream', () => {
  it('forwards folder + ledger table to drizzle migrate', async () => {
    const db = {} as never;
    await migrateStream(db, { folder: '/abs/ee-migrations', table: 'ee_migrations' });
    expect(migrateSpy).toHaveBeenCalledWith(db, {
      migrationsFolder: '/abs/ee-migrations',
      migrationsTable: 'ee_migrations',
    });
  });
});
