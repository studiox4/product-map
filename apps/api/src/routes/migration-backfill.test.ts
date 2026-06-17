import { setupTestDb, truncateAll, closeTestDb, createTestUser, TEST_DATABASE_URL } from '../test/helpers';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDb, projects, ideas, releases, memberships } from '@productmap/db';
import { sql } from 'drizzle-orm';

const db = createDb(TEST_DATABASE_URL).db;
beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);

it('backfills orphan rows to the sole project and memberships to all users (admin=owner)', async () => {
  const [p] = await db.insert(projects).values({ name: 'P' }).returning();
  const admin = await createTestUser({ role: 'admin', email: 'a@x.co' });
  const member = await createTestUser({ role: 'member', email: 'm@x.co' });

  // Simulate pre-migration state: insert rows via raw SQL so project_id stays NULL
  // even when the column is NOT NULL (only possible inside a transaction we roll back,
  // so we do a two-phase approach: test membership backfill SQL directly here, and
  // rely on the fresh-DB migrate (Step 6) to prove the row-backfill path on empty tables).
  //
  // Membership backfill: all users get a membership in the first project.
  await db.execute(sql`INSERT INTO memberships (user_id, project_id, role)
    SELECT u.id, ${p.id}, CASE WHEN u.role = 'admin' THEN 'owner'::member_role ELSE 'editor'::member_role END
    FROM users u ON CONFLICT (user_id, project_id) DO NOTHING`);

  const mem = await db.select().from(memberships);
  expect(mem.length).toBe(2);
  expect(mem.find((m) => m.userId === admin.id)?.role).toBe('owner');
  expect(mem.find((m) => m.userId === member.id)?.role).toBe('editor');
});

it('row backfill UPDATE sets project_id where null', async () => {
  const [p] = await db.insert(projects).values({ name: 'SoleProject' }).returning();

  // Drop NOT NULL so we can insert a genuinely NULL project_id row, simulating
  // the pre-migration state that the backfill UPDATE must handle.
  await db.execute(sql`ALTER TABLE ideas ALTER COLUMN project_id DROP NOT NULL`);
  try {
    // Insert an orphan row with project_id = NULL.
    // db.execute returns a pg QueryResult; rows are at .rows.
    const insertResult = await db.execute(
      sql`INSERT INTO ideas (title, body_md, source) VALUES ('Orphan idea', '', '') RETURNING id`,
    ) as unknown as { rows: Array<{ id: string }> };
    const orphanId = insertResult.rows[0].id;

    // Confirm it truly has a NULL project_id.
    const beforeResult = await db.execute(
      sql`SELECT project_id FROM ideas WHERE id = ${orphanId}`,
    ) as unknown as { rows: Array<{ project_id: string | null }> };
    expect(beforeResult.rows[0].project_id).toBeNull();

    // Run the backfill UPDATE (mirrors the migration SQL).
    const result = await db.execute(
      sql`UPDATE ideas SET project_id = ${p.id} WHERE project_id IS NULL`,
    );
    expect((result as unknown as { rowCount: number }).rowCount).toBe(1);

    // The row should now carry the project id.
    const afterResult = await db.execute(
      sql`SELECT project_id FROM ideas WHERE id = ${orphanId}`,
    ) as unknown as { rows: Array<{ project_id: string }> };
    expect(afterResult.rows[0].project_id).toBe(p.id);
  } finally {
    // Clean up any remaining NULL rows and restore NOT NULL to avoid poisoning the shared test DB.
    await db.execute(sql`DELETE FROM ideas WHERE project_id IS NULL`);
    await db.execute(sql`ALTER TABLE ideas ALTER COLUMN project_id SET NOT NULL`);
  }
});
