// Integration tests for GET /api/users and PATCH /api/users/:id (auth-gated).
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { users } from '@productmap/db';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

let auth: Record<string, string> = {};
let actorId: string;

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  actorId = actor.id;
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
});

const patch = (body: unknown) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

describe('GET /api/users', () => {
  it('returns scrubbed {id,name,color,role} shape (no email, no createdAt)', async () => {
    const res = await app.request('/api/users', { headers: auth });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(1); // only the actor
    const u = list[0];
    expect(u).toMatchObject({ id: actorId, name: 'Corban', color: '#2b557e', role: 'admin' });
    expect(u).not.toHaveProperty('email');
    expect(u).not.toHaveProperty('createdAt');
    expect(u).not.toHaveProperty('passwordHash');
  });

  it('lists all users in creation order', async () => {
    // Insert additional users via DB directly (admin actor already in DB)
    await db.insert(users).values([
      { name: 'Ada', color: '#3c6b46', role: 'member', email: 'ada@test.co' },
      { name: 'Brin', color: '#7c4d00', role: 'member', email: 'brin@test.co' },
    ]);
    const res = await app.request('/api/users', { headers: auth });
    expect(res.status).toBe(200);
    const list = await res.json();
    // actor + 2 extras
    expect(list).toHaveLength(3);
    expect(list.map((u: { name: string }) => u.name)).toEqual(['Corban', 'Ada', 'Brin']);
  });
});

describe('PATCH /api/users/:id', () => {
  it('admin can rename any user', async () => {
    const [other] = await db
      .insert(users)
      .values({ name: 'Ada', color: '#3c6b46', role: 'member', email: 'ada@test.co' })
      .returning();
    const res = await app.request(`/api/users/${other.id}`, patch({ name: 'Ada L' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Ada L');
    expect(body.color).toBe('#3c6b46');
    expect(body).not.toHaveProperty('email');
  });

  it('admin can change color of any user', async () => {
    const [other] = await db
      .insert(users)
      .values({ name: 'Ada', color: '#3c6b46', role: 'member', email: 'ada@test.co' })
      .returning();
    const res = await app.request(`/api/users/${other.id}`, patch({ color: '#0e7490' }));
    expect(res.status).toBe(200);
    expect((await res.json()).color).toBe('#0e7490');
  });

  it('member cannot patch another user (403)', async () => {
    const member = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co' });
    const memberAuth = { cookie: await authCookie(member), origin: 'http://localhost', host: 'localhost' };
    const [other] = await db
      .insert(users)
      .values({ name: 'Brin', color: '#7c4d00', role: 'member', email: 'brin@test.co' })
      .returning();
    const res = await app.request(`/api/users/${other.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...memberAuth },
      body: JSON.stringify({ name: 'Hijack' }),
    });
    expect(res.status).toBe(403);
  });

  it('member can patch their own profile', async () => {
    const member = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co' });
    const memberAuth = { cookie: await authCookie(member), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/users/${member.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...memberAuth },
      body: JSON.stringify({ name: 'Ada L' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Ada L');
  });

  it('400 on a non-hex color', async () => {
    const res = await app.request(`/api/users/${actorId}`, patch({ color: 'tomato' }));
    expect(res.status).toBe(400);
  });

  it('400 on invalid name', async () => {
    const res = await app.request(`/api/users/${actorId}`, patch({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('404 on unknown id', async () => {
    const res = await app.request('/api/users/00000000-0000-4000-8000-000000000000', patch({ name: 'x' }));
    expect(res.status).toBe(404);
  });
});
