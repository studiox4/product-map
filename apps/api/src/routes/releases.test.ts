import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { products, features, users, documents, releases, activity } from '@productmap/db';
import { asc, eq } from 'drizzle-orm';

let productId: string;
let userId: string;
let releaseId: string;
let featureA: string;
let featureB: string;

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
  const [r] = await db
    .insert(releases)
    .values({ name: 'v0.2 — Team ready', targetDate: '2026-07-01' })
    .returning();
  releaseId = r.id;
  const [a] = await db
    .insert(features)
    .values({ productId, title: 'Comments & review', horizon: 'now', releaseId, sortOrder: 0 })
    .returning();
  featureA = a.id;
  const [b] = await db
    .insert(features)
    .values({ productId, title: 'Voting', horizon: 'now', releaseId, sortOrder: 1 })
    .returning();
  featureB = b.id;
});

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('releases CRUD', () => {
  it('lists releases with featureCount', async () => {
    const res = await app.request('/api/releases');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: releaseId, name: 'v0.2 — Team ready', status: 'planned', featureCount: 2 });
  });

  it('creates a release with 201', async () => {
    const res = await app.request('/api/releases', json('POST', { name: 'v0.3', targetDate: '2026-09-01' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ name: 'v0.3', targetDate: '2026-09-01', status: 'planned', shippedAt: null });
  });

  it('400s on invalid create body', async () => {
    const res = await app.request('/api/releases', json('POST', { name: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('gets a release with its features', async () => {
    const res = await app.request(`/api/releases/${releaseId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('v0.2 — Team ready');
    expect(body.features.map((f: { id: string }) => f.id)).toEqual([featureA, featureB]);
  });

  it('patches a release', async () => {
    const res = await app.request(`/api/releases/${releaseId}`, json('PATCH', { name: 'v0.2.1', notesMd: 'hi' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'v0.2.1', notesMd: 'hi' });
  });

  it('deletes a release and nulls feature linkage', async () => {
    const res = await app.request(`/api/releases/${releaseId}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    const [f] = await db.select().from(features).where(eq(features.id, featureA));
    expect(f.releaseId).toBeNull();
  });

  it('404s on unknown release for get/patch/delete', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await app.request(`/api/releases/${missing}`)).status).toBe(404);
    expect((await app.request(`/api/releases/${missing}`, json('PATCH', { name: 'x' }))).status).toBe(404);
    expect((await app.request(`/api/releases/${missing}`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('POST /api/releases/:id/ship', () => {
  it('ships the release and records release_shipped activity on each feature', async () => {
    const res = await app.request(`/api/releases/${releaseId}/ship`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('shipped');
    expect(body.shippedAt).not.toBeNull();

    const acts = await db.select().from(activity).orderBy(asc(activity.createdAt));
    expect(acts).toHaveLength(2);
    expect(acts.map((a) => a.featureId).sort()).toEqual([featureA, featureB].sort());
    for (const act of acts) {
      expect(act.kind).toBe('release_shipped');
      expect(act.actorId).toBe(userId);
      expect(act.payload).toMatchObject({ releaseId, releaseName: 'v0.2 — Team ready' });
    }
  });

  it('is idempotent: shipping twice logs no duplicate activity', async () => {
    await app.request(`/api/releases/${releaseId}/ship`, { method: 'POST' });
    const res = await app.request(`/api/releases/${releaseId}/ship`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('shipped');
    const acts = await db.select().from(activity);
    expect(acts).toHaveLength(2);
  });

  it('404s on unknown release', async () => {
    const res = await app.request('/api/releases/00000000-0000-4000-8000-000000000000/ship', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/releases/:id/notes.md', () => {
  it('assembles ## sections from feature titles with final-doc first paragraphs', async () => {
    await db.insert(documents).values([
      {
        featureId: featureA,
        type: 'prd',
        title: 'Comments PRD',
        status: 'final',
        contentMd: 'Threaded comments on features and docs.\n\nSecond paragraph that must not appear.',
      },
      {
        featureId: featureA,
        type: 'brd',
        title: 'Draft note',
        status: 'draft',
        contentMd: 'Draft content must be excluded.',
      },
      {
        featureId: featureB,
        type: 'prd',
        title: 'Voting PRD',
        status: 'final',
        contentMd: '\n\nUp/down votes with per-user toggles.\n\nMore detail.',
      },
    ]);
    const res = await app.request(`/api/releases/${releaseId}/notes.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const md = await res.text();
    expect(md).toContain('# v0.2 — Team ready');
    expect(md).toContain('## Comments & review\n\nThreaded comments on features and docs.');
    expect(md).toContain('## Voting\n\nUp/down votes with per-user toggles.');
    expect(md).not.toContain('Second paragraph that must not appear');
    expect(md).not.toContain('Draft content must be excluded');
    // feature order follows sortOrder
    expect(md.indexOf('## Comments & review')).toBeLessThan(md.indexOf('## Voting'));
  });

  it('renders a heading-only section for features without final docs', async () => {
    const res = await app.request(`/api/releases/${releaseId}/notes.md`);
    expect(res.status).toBe(200);
    const md = await res.text();
    expect(md).toContain('## Comments & review');
    expect(md).toContain('## Voting');
  });

  it('404s on unknown release', async () => {
    const res = await app.request('/api/releases/00000000-0000-4000-8000-000000000000/notes.md');
    expect(res.status).toBe(404);
  });
});
