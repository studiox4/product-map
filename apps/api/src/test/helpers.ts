import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '@productmap/db';
import { users, projects, memberships, invites } from '@productmap/db/schema';
import { configureDb } from '../db';
import { signAccess } from '../lib/auth/tokens';
import { ACCESS_COOKIE } from '../lib/auth/cookies';
import { hashPassword } from '../lib/auth/password';

// Overridable so parallel build agents (separate worktrees) can each use an
// isolated database and not race on truncateAll. Defaults to productmap_test.
const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'productmap_test';
const PG_BASE = process.env.TEST_PG_BASE ?? 'postgres://localhost:5432';

export const TEST_DATABASE_URL = `${PG_BASE}/${TEST_DB_NAME}`;

// Test files import this module first, so this runs before any request is
// dispatched. Replicate the node entry (index.ts): build the app's pg pool over
// the test database and inject it into the driver-agnostic db handle.
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { db: appDb, pool: appPool } = createDb(TEST_DATABASE_URL);
configureDb(appDb);

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
  await getPool().query(
    'truncate table comments, votes, activity, feature_collaborators, uploads, documents, idea_votes, ideas, evidence, decisions, feature_dependencies, invites, share_tokens, plan_entries, plans, features, releases, objectives, memberships, projects, templates, users cascade',
  );
}

/** Close test pools (helpers' own + the app's shared pool). Call in afterAll. */
export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  await appPool.end().catch(() => {});
}

// Reuse the helper's existing pg.Pool (getPool) — no second pool to leak.
let helperDb: ReturnType<typeof drizzle> | null = null;
function hdb() {
  if (!helperDb) helperDb = drizzle(getPool());
  return helperDb;
}

interface TestUserOpts { role?: 'admin' | 'member'; email?: string; name?: string; color?: string; }

/** Insert a user directly and return the row (for seeding test actors). */
export async function createTestUser(opts: TestUserOpts = {}) {
  const [row] = await hdb()
    .insert(users)
    .values({
      email: opts.email ?? `u-${Math.random().toString(36).slice(2)}@test.co`,
      name: opts.name ?? 'Test User',
      color: opts.color ?? '#2b557e',
      role: opts.role ?? 'member',
      passwordHash: await hashPassword('test-password-1234'),
    })
    .returning();
  return row;
}

/** Cookie header value carrying a valid access token for `user`. */
export async function authCookie(user: { id: string; role: 'admin' | 'member'; tokenVersion?: number }): Promise<string> {
  const token = await signAccess({ id: user.id, role: user.role, tokenVersion: user.tokenVersion ?? 0 });
  return `${ACCESS_COOKIE}=${token}`;
}

/** Insert a project and return the row. */
export async function createTestProject(name = 'Test Project') {
  const [row] = await hdb().insert(projects).values({ name }).returning();
  return row;
}

/** Insert a membership linking a user to a project with the given role. */
export async function addMembership(userId: string, projectId: string, role: 'owner' | 'editor' | 'viewer' = 'editor') {
  await hdb().insert(memberships).values({ userId, projectId, role });
}

/** Insert an invite row directly. expiresInSec defaults to +7d; pass negative to forge an expired invite. */
export async function createTestInvite(opts: {
  projectId: string;
  createdBy: string;
  role?: 'owner' | 'editor' | 'viewer';
  email?: string | null;
  token?: string;
  expiresInSec?: number;
  revoked?: boolean;
}) {
  const expiresAt = new Date(Date.now() + (opts.expiresInSec ?? 7 * 24 * 60 * 60) * 1000);
  const [row] = await hdb()
    .insert(invites)
    .values({
      projectId: opts.projectId,
      createdBy: opts.createdBy,
      role: opts.role ?? 'editor',
      email: opts.email ?? null,
      token: opts.token ?? `tok-${Math.random().toString(36).slice(2)}`,
      expiresAt,
      revokedAt: opts.revoked ? new Date() : null,
    })
    .returning();
  return row;
}
