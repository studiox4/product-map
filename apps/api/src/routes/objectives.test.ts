import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { users, objectives } from '@productmap/db';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  await db.insert(users).values({ name: 'Corban', color: '#2b557e' });
});

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('objectives CRUD', () => {
  it('creates an objective with 201 and defaults', async () => {
    const res = await app.request(
      '/api/objectives',
      json('POST', { title: 'Grow weekly actives', metric: 'WAU', target: '500', quarter: 'Q3 2026' }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      title: 'Grow weekly actives',
      metric: 'WAU',
      target: '500',
      quarter: 'Q3 2026',
    });

    const minimal = await app.request('/api/objectives', json('POST', { title: 'Ship faster' }));
    expect(minimal.status).toBe(201);
    expect(await minimal.json()).toMatchObject({ title: 'Ship faster', metric: '', target: '', quarter: '' });
  });

  it('400s on invalid create body', async () => {
    const res = await app.request('/api/objectives', json('POST', { title: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('lists objectives in creation order', async () => {
    await db.insert(objectives).values([{ title: 'First' }, { title: 'Second' }]);
    const res = await app.request('/api/objectives');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((o: { title: string }) => o.title)).toEqual(['First', 'Second']);
  });

  it('gets, patches and deletes an objective', async () => {
    const [o] = await db.insert(objectives).values({ title: 'Retention' }).returning();

    const got = await app.request(`/api/objectives/${o.id}`);
    expect(got.status).toBe(200);
    expect((await got.json()).title).toBe('Retention');

    const patched = await app.request(`/api/objectives/${o.id}`, json('PATCH', { metric: 'D30', target: '40%' }));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ title: 'Retention', metric: 'D30', target: '40%' });

    const deleted = await app.request(`/api/objectives/${o.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(204);
    expect((await app.request(`/api/objectives/${o.id}`)).status).toBe(404);
  });

  it('404s on unknown objective for get/patch/delete', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await app.request(`/api/objectives/${missing}`)).status).toBe(404);
    expect((await app.request(`/api/objectives/${missing}`, json('PATCH', { title: 'x' }))).status).toBe(404);
    expect((await app.request(`/api/objectives/${missing}`, { method: 'DELETE' })).status).toBe(404);
  });
});
