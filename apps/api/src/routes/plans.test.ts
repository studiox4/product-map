// Foundation stub coverage: GET /api/plans lists saved scenario plans.
// The scenario endpoints (create/apply/entries) are tested by the plans agent.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { users, plans } from '@productmap/db';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

describe('GET /api/plans', () => {
  it('returns an empty list when no plans exist', async () => {
    const res = await app.request('/api/plans');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists plans oldest-first with status and appliedAt', async () => {
    const [u] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
    await db.insert(plans).values([
      { name: 'Q4 stretch', createdBy: u.id, createdAt: new Date('2026-06-01T00:00:00Z') },
      { name: 'Lean cut', createdBy: u.id, createdAt: new Date('2026-06-05T00:00:00Z') },
    ]);
    const res = await app.request('/api/plans');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((p: { name: string }) => p.name)).toEqual(['Q4 stretch', 'Lean cut']);
    expect(body[0]).toMatchObject({ status: 'draft', appliedAt: null, createdBy: u.id });
  });
});
