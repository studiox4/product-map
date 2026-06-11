// Integration tests for users routes (identity, no auth — demo).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { USER_COLORS } from '@productmap/shared';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/users', () => {
  it('creates a user with the first round-robin color', async () => {
    const res = await app.request('/api/users', json('POST', { name: 'Corban' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Corban');
    expect(body.color).toBe(USER_COLORS[0]);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('assigns colors round-robin, wrapping after the palette is exhausted', async () => {
    const colors: string[] = [];
    for (let i = 0; i < USER_COLORS.length + 1; i++) {
      const res = await app.request('/api/users', json('POST', { name: `User ${i}` }));
      colors.push((await res.json()).color);
    }
    expect(colors.slice(0, USER_COLORS.length)).toEqual([...USER_COLORS]);
    expect(colors[USER_COLORS.length]).toBe(USER_COLORS[0]);
  });

  it('400 on empty or over-long name', async () => {
    expect((await app.request('/api/users', json('POST', { name: '' }))).status).toBe(400);
    expect(
      (await app.request('/api/users', json('POST', { name: 'a'.repeat(81) }))).status,
    ).toBe(400);
  });
});

describe('GET /api/users', () => {
  it('returns [] when empty, then users in creation order', async () => {
    const empty = await app.request('/api/users');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    await app.request('/api/users', json('POST', { name: 'Ada' }));
    await app.request('/api/users', json('POST', { name: 'Brin' }));
    const res = await app.request('/api/users');
    const list = await res.json();
    expect(list.map((u: { name: string }) => u.name)).toEqual(['Ada', 'Brin']);
  });
});

describe('PATCH /api/users/:id', () => {
  it('renames a user, keeping the color', async () => {
    const user = await (await app.request('/api/users', json('POST', { name: 'Ada' }))).json();
    const res = await app.request(`/api/users/${user.id}`, json('PATCH', { name: 'Ada L' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Ada L');
    expect(body.color).toBe(user.color);
  });

  it('changes the avatar color from the palette', async () => {
    const user = await (await app.request('/api/users', json('POST', { name: 'Ada' }))).json();
    const color = USER_COLORS[3];
    const res = await app.request(`/api/users/${user.id}`, json('PATCH', { color }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.color).toBe(color);
    expect(body.name).toBe('Ada');
  });

  it('updates name and color together', async () => {
    const user = await (await app.request('/api/users', json('POST', { name: 'Ada' }))).json();
    const res = await app.request(
      `/api/users/${user.id}`,
      json('PATCH', { name: 'Ada L', color: '#0e7490' }),
    );
    const body = await res.json();
    expect(body.name).toBe('Ada L');
    expect(body.color).toBe('#0e7490');
  });

  it('400 on a non-hex color', async () => {
    const user = await (await app.request('/api/users', json('POST', { name: 'Ada' }))).json();
    const res = await app.request(`/api/users/${user.id}`, json('PATCH', { color: 'tomato' }));
    expect(res.status).toBe(400);
  });

  it('404 on unknown id', async () => {
    const res = await app.request(
      '/api/users/00000000-0000-4000-8000-000000000000',
      json('PATCH', { name: 'x' }),
    );
    expect(res.status).toBe(404);
  });

  it('400 on invalid name', async () => {
    const user = await (await app.request('/api/users', json('POST', { name: 'Ada' }))).json();
    const res = await app.request(`/api/users/${user.id}`, json('PATCH', { name: '' }));
    expect(res.status).toBe(400);
  });
});
