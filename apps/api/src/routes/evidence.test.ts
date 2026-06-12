import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { products, features, users, evidence } from '@productmap/db';
import { eq } from 'drizzle-orm';

let productId: string;
let userId: string;
let featureId: string;

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const [p] = await db.insert(products).values({ name: 'ProductMap', vision: 'v', aboutMd: '' }).returning();
  productId = p.id;
  const [u] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
  userId = u.id;
  const [f] = await db.insert(features).values({ productId, title: 'Gantt roadmap', horizon: 'next' }).returning();
  featureId = f.id;
});

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/features/:id/evidence', () => {
  it('creates a quote with defaults and creator join (AC2)', async () => {
    const res = await app.request(
      `/api/features/${featureId}/evidence`,
      post({ kind: 'quote', title: 'Customer loves the gantt' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      featureId,
      kind: 'quote',
      title: 'Customer loves the gantt',
      bodyMd: '',
      sourceUrl: '',
      weight: 1,
      createdBy: userId,
      createdByName: 'Corban',
      createdByColor: '#2b557e',
    });
  });

  it('creates a weighted ticket with body and source url (AC2)', async () => {
    const res = await app.request(
      `/api/features/${featureId}/evidence`,
      post({
        kind: 'ticket',
        title: 'Zoom-level complaints',
        bodyMd: '12 tickets ask for week zoom.',
        sourceUrl: 'https://support.example.com/q?tag=gantt',
        weight: 12,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ kind: 'ticket', weight: 12, sourceUrl: 'https://support.example.com/q?tag=gantt' });
  });

  it('404 on unknown feature', async () => {
    const res = await app.request(`/api/features/${MISSING_ID}/evidence`, post({ kind: 'quote', title: 'x' }));
    expect(res.status).toBe(404);
  });

  it('400 on invalid kind / empty title', async () => {
    const bad = await app.request(`/api/features/${featureId}/evidence`, post({ kind: 'rumor', title: 'x' }));
    expect(bad.status).toBe(400);
    const empty = await app.request(`/api/features/${featureId}/evidence`, post({ kind: 'quote', title: '' }));
    expect(empty.status).toBe(400);
  });
});

describe('GET /api/features/:id/evidence', () => {
  it('lists evidence oldest-first with creator names', async () => {
    await app.request(`/api/features/${featureId}/evidence`, post({ kind: 'quote', title: 'First' }));
    await app.request(`/api/features/${featureId}/evidence`, post({ kind: 'metric', title: 'Second', weight: 3 }));

    const res = await app.request(`/api/features/${featureId}/evidence`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { title: string }) => r.title)).toEqual(['First', 'Second']);
    expect(rows[0].createdByName).toBe('Corban');
    expect(rows[1]).toMatchObject({ kind: 'metric', weight: 3 });
  });

  it('404 on unknown feature', async () => {
    const res = await app.request(`/api/features/${MISSING_ID}/evidence`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/evidence/:id', () => {
  it('deletes and returns 204 (AC2)', async () => {
    const created = await (
      await app.request(`/api/features/${featureId}/evidence`, post({ kind: 'quote', title: 'Bye' }))
    ).json();

    const res = await app.request(`/api/evidence/${created.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    const rows = await db.select().from(evidence).where(eq(evidence.id, created.id));
    expect(rows).toHaveLength(0);
  });

  it('404 on unknown id', async () => {
    const res = await app.request(`/api/evidence/${MISSING_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
