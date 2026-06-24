// Unit test for recordActivity — every activity row must carry its projectId
// (the denormalized scope key the cross-project dashboard feed queries on).
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject } from '../test/helpers';
import { recordActivity } from './activity';
import { db } from '../db';
import { features, activity } from '@productmap/db/schema';
import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

beforeAll(setupTestDb);
afterAll(closeTestDb);
beforeEach(truncateAll);

describe('recordActivity', () => {
  it('writes projectId alongside the activity row', async () => {
    const actor = await createTestUser({ role: 'admin' });
    const { id: pid } = await createTestProject('P');
    const [f] = await db.insert(features).values({ projectId: pid, title: 'F', horizon: 'now' }).returning();
    await recordActivity(f.id, pid, actor.id, 'feature_created', { to: 'F' });
    const [row] = await db.select().from(activity).where(eq(activity.featureId, f.id));
    expect(row.projectId).toBe(pid);
    expect(row.kind).toBe('feature_created');
  });

  it('no-ops without an actor (empty demo DB path)', async () => {
    const { id: pid } = await createTestProject('P');
    const [f] = await db.insert(features).values({ projectId: pid, title: 'F', horizon: 'now' }).returning();
    await recordActivity(f.id, pid, undefined, 'feature_created');
    const rows = await db.select().from(activity).where(eq(activity.featureId, f.id));
    expect(rows).toHaveLength(0);
  });
});
