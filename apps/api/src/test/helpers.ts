import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const TEST_DB_NAME = 'productmap_test';
const PG_BASE = process.env.TEST_PG_BASE ?? 'postgres://localhost:5432';

export const TEST_DATABASE_URL = `${PG_BASE}/${TEST_DB_NAME}`;

// Must run before `../db` (the app's shared pool) is evaluated. Test files
// import this module first, so the app pool picks up the test database.
process.env.DATABASE_URL = TEST_DATABASE_URL;

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/db/migrations',
);

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  return pool;
}

async function createDbIfMissing(): Promise<void> {
  const admin = new pg.Client({ connectionString: `${PG_BASE}/postgres` });
  await admin.connect();
  try {
    const res = await admin.query('select 1 from pg_database where datname = $1', [TEST_DB_NAME]);
    if (res.rowCount === 0) {
      await admin.query(`create database ${TEST_DB_NAME}`);
    }
  } finally {
    await admin.end();
  }
}

/** Create productmap_test if missing and run all migrations. Call once in beforeAll. */
export async function setupTestDb(): Promise<void> {
  await createDbIfMissing();
  const db = drizzle(getPool());
  await migrate(db, { migrationsFolder });
}

/** Wipe all rows from every table. Call in beforeEach. */
export async function truncateAll(): Promise<void> {
  await getPool().query('truncate table uploads, documents, features, products cascade');
}

/** Close test pools (helpers' own + the app's shared pool). Call in afterAll. */
export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  const { pool: appPool } = await import('../db');
  await appPool.end().catch(() => {});
}
