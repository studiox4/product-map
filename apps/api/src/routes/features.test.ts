import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { products, features, documents } from '@productmap/db';
import { eq } from 'drizzle-orm';

let productId: string;

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const [p] = await db
    .insert(products)
    .values({ name: 'ProductMap', vision: 'v', aboutMd: '' })
    .returning();
  productId = p.id;
});

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const patch = (body: unknown) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/features', () => {
  it('creates a feature with 201 and defaults', async () => {
    const res = await app.request('/api/features', json({ title: 'Gantt', horizon: 'next' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Gantt');
    expect(body.horizon).toBe('next');
    expect(body.status).toBe('idea');
    expect(body.sortOrder).toBe(0);
    expect(body.startDate).toBeNull();
    expect(body.endDate).toBeNull();
    expect(body.productId).toBe(productId);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('400 on invalid body', async () => {
    const res = await app.request('/api/features', json({ title: '', horizon: 'soon' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation');
    expect(body.issues).toBeDefined();
  });
});

describe('GET /api/features', () => {
  it('returns FeatureWithDocs with empty documents array', async () => {
    await app.request('/api/features', json({ title: 'A', horizon: 'now' }));
    const res = await app.request('/api/features');
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(1);
    expect(list[0].documents).toEqual([]);
  });

  it('orders by horizon (now,next,later) then sortOrder then createdAt', async () => {
    const insert = (title: string, horizon: 'now' | 'next' | 'later', sortOrder: number) =>
      db.insert(features).values({ productId, title, horizon, sortOrder }).returning();
    await insert('later-0', 'later', 0);
    await insert('now-1', 'now', 1);
    await insert('next-0', 'next', 0);
    await insert('now-0a', 'now', 0);
    await insert('now-0b', 'now', 0);

    const res = await app.request('/api/features');
    const list = await res.json();
    expect(list.map((f: { title: string }) => f.title)).toEqual([
      'now-0a',
      'now-0b',
      'now-1',
      'next-0',
      'later-0',
    ]);
  });
});

describe('GET /api/features/:id', () => {
  it('returns the feature with its documents', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    await db.insert(documents).values({ featureId: f.id, type: 'prd', title: 'F PRD' });
    const res = await app.request(`/api/features/${f.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('F');
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].type).toBe('prd');
    // DocumentMeta only — no content fields
    expect(body.documents[0].contentJson).toBeUndefined();
    expect(body.documents[0].contentMd).toBeUndefined();
  });

  it('404 on unknown id', async () => {
    const res = await app.request('/api/features/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('PATCH /api/features/:id', () => {
  it('updates horizon, status and dates', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(
      `/api/features/${f.id}`,
      patch({ horizon: 'later', status: 'planned', startDate: '2026-06-01', endDate: '2026-06-15' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.horizon).toBe('later');
    expect(body.status).toBe('planned');
    expect(body.startDate).toBe('2026-06-01');
    expect(body.endDate).toBe('2026-06-15');
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(body.createdAt).getTime());
  });

  it('400 on inverted dates', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(
      `/api/features/${f.id}`,
      patch({ startDate: '2026-06-15', endDate: '2026-06-01' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('404 on unknown id', async () => {
    const res = await app.request(
      '/api/features/00000000-0000-4000-8000-000000000000',
      patch({ status: 'shipped' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/features/:id', () => {
  it('204, then GET 404, and cascades documents', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    await db.insert(documents).values({ featureId: f.id, type: 'prd', title: 'doc' });

    const del = await app.request(`/api/features/${f.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    const get = await app.request(`/api/features/${f.id}`);
    expect(get.status).toBe(404);

    const docs = await db.select().from(documents).where(eq(documents.featureId, f.id));
    expect(docs).toHaveLength(0);
  });

  it('404 on unknown id', async () => {
    const res = await app.request('/api/features/00000000-0000-4000-8000-000000000000', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});
