// Integration tests for per-user project favorites.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projectFavorites } from '@productmap/db/schema';
import { and, eq } from 'drizzle-orm';

beforeAll(setupTestDb);
afterAll(closeTestDb);
beforeEach(truncateAll);

describe('favorite endpoints', () => {
  it('POST then DELETE toggles favorite; POST is idempotent', async () => {
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };
    const p = await createTestProject('P');
    await addMembership(u.id, p.id, 'viewer');

    const post = await app.request(`/api/projects/${p.id}/favorite`, { method: 'POST', headers: auth });
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ favorite: true });

    // Idempotent: a second POST is still favorite:true and leaves exactly one row.
    const again = await app.request(`/api/projects/${p.id}/favorite`, { method: 'POST', headers: auth });
    expect(again.status).toBe(200);
    const rows = await db
      .select()
      .from(projectFavorites)
      .where(and(eq(projectFavorites.userId, u.id), eq(projectFavorites.projectId, p.id)));
    expect(rows).toHaveLength(1);

    const del = await app.request(`/api/projects/${p.id}/favorite`, { method: 'DELETE', headers: auth });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ favorite: false });
  });

  it('works for an admin with no membership row (favorites live in project_favorites)', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const auth = { cookie: await authCookie(admin), origin: 'http://localhost', host: 'localhost' };
    const p = await createTestProject('AdminFav'); // admin is NOT a member

    const post = await app.request(`/api/projects/${p.id}/favorite`, { method: 'POST', headers: auth });
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ favorite: true });
  });

  it('non-member (non-admin) gets 404', async () => {
    const outsider = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(outsider), origin: 'http://localhost', host: 'localhost' };
    const p = await createTestProject('Private'); // outsider has no membership

    const res = await app.request(`/api/projects/${p.id}/favorite`, { method: 'POST', headers: auth });
    expect(res.status).toBe(404);
  });
});
