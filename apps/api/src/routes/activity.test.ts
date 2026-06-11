// Integration tests for GET /api/activity (workspace-wide feed for the Time Machine).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { products, features, users, activity } from '@productmap/db';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

let userId: string;
let editorId: string;
let ganttId: string;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const [product] = await db
    .insert(products)
    .values({ name: 'ProductMap', vision: 'v', aboutMd: '' })
    .returning();
  const [u] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
  userId = u.id;
  const rows = await db
    .insert(features)
    .values([
      { productId: product.id, title: 'Rich markdown editor', horizon: 'now' },
      { productId: product.id, title: 'Gantt roadmap', horizon: 'next' },
    ])
    .returning();
  editorId = rows[0].id;
  ganttId = rows[1].id;
});

async function seedHistory() {
  await db.insert(activity).values([
    {
      featureId: editorId,
      actorId: userId,
      kind: 'feature_created',
      payload: {
        to: 'Rich markdown editor',
        snapshot: { title: 'Rich markdown editor', horizon: 'later', status: 'idea', startDate: null, endDate: null },
      },
      createdAt: daysAgo(30),
    },
    {
      featureId: editorId,
      actorId: userId,
      kind: 'horizon_changed',
      payload: { from: 'later', to: 'now' },
      createdAt: daysAgo(20),
    },
    {
      featureId: ganttId,
      actorId: userId,
      kind: 'dates_changed',
      payload: {
        from: { startDate: null, endDate: null },
        to: { startDate: '2026-07-01', endDate: '2026-07-18' },
      },
      createdAt: daysAgo(5),
    },
  ]);
}

describe('GET /api/activity', () => {
  it('returns workspace-wide activity ascending with joined actor and feature title', async () => {
    await seedHistory();
    const res = await app.request('/api/activity');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(3);
    // ascending — replay order
    expect(body.map((a: { kind: string }) => a.kind)).toEqual([
      'feature_created',
      'horizon_changed',
      'dates_changed',
    ]);
    const first = body[0];
    expect(first.featureId).toBe(editorId);
    expect(first.featureTitle).toBe('Rich markdown editor');
    expect(first.actorId).toBe(userId);
    expect(first.actorName).toBe('Corban');
    expect(first.actorColor).toBe('#2b557e');
    expect(first.payload.snapshot).toEqual({
      title: 'Rich markdown editor',
      horizon: 'later',
      status: 'idea',
      startDate: null,
      endDate: null,
    });
    expect(new Date(first.createdAt).getTime()).toBeLessThan(new Date(body[1].createdAt).getTime());
    // spans multiple features
    expect(body[2].featureId).toBe(ganttId);
    expect(body[2].featureTitle).toBe('Gantt roadmap');
    expect(body[2].payload).toEqual({
      from: { startDate: null, endDate: null },
      to: { startDate: '2026-07-01', endDate: '2026-07-18' },
    });
  });

  it('filters with ?since= (inclusive lower bound)', async () => {
    await seedHistory();
    const res = await app.request(`/api/activity?since=${daysAgo(21).toISOString()}`);
    const body = await res.json();
    expect(body.map((a: { kind: string }) => a.kind)).toEqual(['horizon_changed', 'dates_changed']);
  });

  it('400 on a malformed since', async () => {
    const res = await app.request('/api/activity?since=not-a-date');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('caps the feed at 1000 rows', async () => {
    const rows = Array.from({ length: 1010 }, (_, i) => ({
      featureId: editorId,
      actorId: userId,
      kind: 'description_edited',
      payload: null,
      createdAt: new Date(Date.now() - (1010 - i) * 60_000),
    }));
    await db.insert(activity).values(rows);
    const res = await app.request('/api/activity');
    const body = await res.json();
    expect(body).toHaveLength(1000);
  });
});
