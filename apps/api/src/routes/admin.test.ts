// Integration tests for POST /api/admin/reset-demo (truncate + reseed; dev only).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { users, products, features, documents, templates, activity } from '@productmap/db';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';

let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const actor = await createTestUser({ role: 'admin', email: 'admin@test.co' });
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
});

afterEach(() => {
  process.env.NODE_ENV = 'test';
});

describe('POST /api/admin/reset-demo', () => {
  it('truncates and reseeds the demo workspace, including default templates', async () => {
    // Pre-existing junk that must be wiped.
    await db.insert(users).values({ name: 'Stale', color: '#9a5a3c' });

    const res = await app.request('/api/admin/reset-demo', { method: 'POST', headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const userRows = await db.select().from(users);
    expect(userRows).toHaveLength(4);
    // Corban is the first-created user — several code paths fall back to it.
    const oldestFirst = [...userRows].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    expect(oldestFirst[0].name).toBe('Corban');

    expect(await db.select().from(products)).toHaveLength(1);
    expect(await db.select().from(features)).toHaveLength(8);
    // 13 feature docs + the SSO idea pitch + the v0.2 release notes doc.
    expect(await db.select().from(documents)).toHaveLength(15);
    expect((await db.select().from(activity)).length).toBeGreaterThan(0);

    // 6 built-in templates, one default per doc type, {{title}} preserved.
    const tplRows = await db.select().from(templates);
    expect(tplRows).toHaveLength(6);
    expect(tplRows.every((t) => t.isDefault)).toBe(true);
    expect(new Set(tplRows.map((t) => t.type))).toEqual(
      new Set(['prd', 'brd', 'tech_spec', 'feature_brief', 'idea_pitch', 'release_notes']),
    );
    for (const t of tplRows) {
      expect(t.bodyMd).toContain('{{title}}');
      expect(JSON.stringify(t.bodyJson)).toContain('{{title}}');
      expect(t.promptHints.length).toBeGreaterThan(0);
    }
  });

  it('is idempotent — running twice leaves a single seed', async () => {
    // JWT auth is claims-only (no DB check), so cookie remains valid after truncate.
    await app.request('/api/admin/reset-demo', { method: 'POST', headers: auth });
    await app.request('/api/admin/reset-demo', { method: 'POST', headers: auth });
    expect(await db.select().from(users)).toHaveLength(4);
    expect(await db.select().from(templates)).toHaveLength(6);
  });

  it('403 when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await app.request('/api/admin/reset-demo', { method: 'POST', headers: auth });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });
});

describe('admin user management', () => {
  it('admin can list, create, and deactivate users', async () => {
    // Use the actor from beforeEach (already in auth)
    const headers = { ...auth, 'content-type': 'application/json' };

    const created = await app.request('/api/admin/users', {
      method: 'POST', headers, body: JSON.stringify({ email: 'new@x.co', name: 'New', role: 'member' }),
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.tempPassword).toBeTruthy();
    expect(body.user.email).toBeUndefined(); // user is scrubbed

    // actor + new user = 2
    const list = await app.request('/api/admin/users', { headers: { cookie: auth.cookie } });
    expect((await list.json()).length).toBe(2);

    const patched = await app.request(`/api/admin/users/${body.user.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ isActive: false }),
    });
    expect(patched.status).toBe(200);
  });

  it('non-admin is forbidden', async () => {
    const member = await createTestUser({ role: 'member', email: 'm@x.co' });
    const res = await app.request('/api/admin/users', { headers: { cookie: await authCookie(member) } });
    expect(res.status).toBe(403);
  });
});
