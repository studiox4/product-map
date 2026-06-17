import { setupTestDb, truncateAll, closeTestDb, createTestProject, TEST_DATABASE_URL } from '../test/helpers';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDb, ideas } from '@productmap/db';
import { loadScoped, ScopeError } from './scope';

const db = createDb(TEST_DATABASE_URL).db;
beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);

describe('loadScoped', () => {
  it('returns the row when it belongs to the project', async () => {
    const p = await createTestProject();
    const [idea] = await db.insert(ideas).values({ title: 'x', projectId: p.id }).returning();
    const row = await loadScoped(ideas, idea.id, p.id);
    expect(row.id).toBe(idea.id);
  });

  it('throws ScopeError(404) when the row belongs to another project', async () => {
    const a = await createTestProject('A');
    const b = await createTestProject('B');
    const [ideaB] = await db.insert(ideas).values({ title: 'b', projectId: b.id }).returning();
    await expect(loadScoped(ideas, ideaB.id, a.id)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ScopeError(404) when the row does not exist', async () => {
    const a = await createTestProject('A');
    await expect(loadScoped(ideas, '00000000-0000-0000-0000-000000000000', a.id)).rejects.toMatchObject({ status: 404 });
  });

  it('ScopeError is an instance of Error with status 404', () => {
    const e = new ScopeError();
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
  });
});
