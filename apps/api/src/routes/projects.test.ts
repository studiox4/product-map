import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects } from '@productmap/db';

let projectId: string;
let adminAuth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const actor = await createTestUser({ role: 'admin' });
  adminAuth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
  const [p] = await db
    .insert(projects)
    .values({ name: 'ProductMap', vision: 'old vision', aboutMd: 'about' })
    .returning();
  projectId = p.id;
  // Admin is super-admin so requireMembership passes without a membership row,
  // but the PATCH route now uses requireMembership('owner'). Admins are granted
  // effective 'owner' by the middleware, so existing tests still pass.
});

const patch = (body: unknown) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...adminAuth },
  body: JSON.stringify(body),
});

describe('PATCH /api/projects/:id', () => {
  it('updates vision', async () => {
    const res = await app.request(`/api/projects/${projectId}`, patch({ vision: 'new vision' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vision).toBe('new vision');
    expect(body.name).toBe('ProductMap');
    expect(body.aboutMd).toBe('about');
    expect(body.id).toBe(projectId);
  });

  it('updates name and aboutMd', async () => {
    const res = await app.request(
      `/api/projects/${projectId}`,
      patch({ name: 'PM2', aboutMd: 'changed' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('PM2');
    expect(body.aboutMd).toBe('changed');
    expect(body.vision).toBe('old vision');
  });

  it('400 on invalid body', async () => {
    const res = await app.request(`/api/projects/${projectId}`, patch({ name: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('404 on unknown id', async () => {
    const res = await app.request(
      '/api/projects/00000000-0000-4000-8000-000000000000',
      patch({ vision: 'x' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

const auth = async (u: { id: string; role: 'admin' | 'member' }) => ({ cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' });
const json = (method: string, body: unknown, h: Record<string, string>) => ({ method, headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) });

describe('project CRUD', () => {
  it('POST /api/projects creates a project with the creator as owner', async () => {
    const u = await createTestUser({ role: 'member' });
    const res = await app.request('/api/projects', json('POST', { name: 'New' }, await auth(u)));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('New'); expect(body.role).toBe('owner');
  });
  it('GET /api/projects lists only the caller projects; super-admin sees all', async () => {
    const a = await createTestUser({ role: 'member' });
    const pa = await createTestProject('A'); await addMembership(a.id, pa.id, 'owner');
    await createTestProject('B'); // a is NOT a member of B
    const resA = await app.request('/api/projects', { headers: await auth(a) });
    expect((await resA.json()).map((p: any) => p.name)).toEqual(['A']);
    const admin = await createTestUser({ role: 'admin' });
    const resAdmin = await app.request('/api/projects', { headers: await auth(admin) });
    expect((await resAdmin.json()).length).toBeGreaterThanOrEqual(2);
  });
  it('PATCH /api/projects/:id requires owner; editor gets 403', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'editor');
    const res = await app.request(`/api/projects/${p.id}`, json('PATCH', { name: 'X' }, await auth(u)));
    expect(res.status).toBe(403);
  });
  it('DELETE /api/projects/:id (owner) returns 204', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'owner');
    const res = await app.request(`/api/projects/${p.id}`, { method: 'DELETE', headers: await auth(u) });
    expect(res.status).toBe(204);
  });
  it('non-member GET /api/projects/:id -> 404', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    const res = await app.request(`/api/projects/${p.id}`, { headers: await auth(u) });
    expect(res.status).toBe(404);
  });
});

describe('project members', () => {
  it('owner lists, adds, changes role, and removes members', async () => {
    const owner = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const target = await createTestUser({ role: 'member', email: 't@x.co' });
    const h = await auth(owner);
    const add = await app.request(`/api/projects/${p.id}/members`, json('POST', { userId: target.id, role: 'editor' }, h));
    expect(add.status).toBe(201);
    const list = await app.request(`/api/projects/${p.id}/members`, { headers: h });
    expect((await list.json()).length).toBe(2);
    const patch = await app.request(`/api/projects/${p.id}/members/${target.id}`, json('PATCH', { role: 'viewer' }, h));
    expect(patch.status).toBe(200);
    const del = await app.request(`/api/projects/${p.id}/members/${target.id}`, { method: 'DELETE', headers: h });
    expect(del.status).toBe(204);
  });
  it('cannot demote or remove the last owner', async () => {
    const owner = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    const demote = await app.request(`/api/projects/${p.id}/members/${owner.id}`, json('PATCH', { role: 'editor' }, h));
    expect(demote.status).toBe(409);
    const remove = await app.request(`/api/projects/${p.id}/members/${owner.id}`, { method: 'DELETE', headers: h });
    expect(remove.status).toBe(409);
  });
  it('editor cannot manage members (403)', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'editor');
    const res = await app.request(`/api/projects/${p.id}/members`, json('POST', { email: 'z@x.co', role: 'viewer' }, await auth(u)));
    expect(res.status).toBe(403);
  });

  it('multi-owner: demote one owner to editor succeeds (non-last)', async () => {
    const owner1 = await createTestUser({ role: 'member' });
    const owner2 = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner1.id, p.id, 'owner');
    await addMembership(owner2.id, p.id, 'owner');
    const h = await auth(owner1);
    // Demote owner2 to editor — should succeed since owner1 remains owner.
    const res = await app.request(`/api/projects/${p.id}/members/${owner2.id}`, json('PATCH', { role: 'editor' }, h));
    expect(res.status).toBe(200);
  });

  it('multi-owner: remove one owner succeeds (non-last)', async () => {
    const owner1 = await createTestUser({ role: 'member' });
    const owner2 = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner1.id, p.id, 'owner');
    await addMembership(owner2.id, p.id, 'owner');
    const h = await auth(owner1);
    // Remove owner2 — should succeed since owner1 remains owner.
    const res = await app.request(`/api/projects/${p.id}/members/${owner2.id}`, { method: 'DELETE', headers: h });
    expect(res.status).toBe(204);
  });

  it('email member-add happy path: add by email → 201', async () => {
    const owner = await createTestUser({ role: 'member' });
    const target = await createTestUser({ role: 'member', email: 'x@y.co' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    const res = await app.request(`/api/projects/${p.id}/members`, json('POST', { email: 'x@y.co', role: 'editor' }, h));
    expect(res.status).toBe(201);
    expect((await res.json()).userId).toBe(target.id);
  });

  it('email member-add: unknown email → 404 user_not_found', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    const res = await app.request(`/api/projects/${p.id}/members`, json('POST', { email: 'nobody@y.co', role: 'editor' }, h));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('user_not_found');
  });

  it('direct userId member-add: unknown userId → 404 user_not_found', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    const res = await app.request(`/api/projects/${p.id}/members`, json('POST', { userId: '00000000-0000-4000-8000-000000000099', role: 'editor' }, h));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('user_not_found');
  });

  it('member upsert: POST same user twice updates role', async () => {
    const owner = await createTestUser({ role: 'member' });
    const target = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    // Add as editor.
    await app.request(`/api/projects/${p.id}/members`, json('POST', { userId: target.id, role: 'editor' }, h));
    // Upsert as viewer.
    const res = await app.request(`/api/projects/${p.id}/members`, json('POST', { userId: target.id, role: 'viewer' }, h));
    expect(res.status).toBe(201);
    // GET members should show viewer role.
    const list = await app.request(`/api/projects/${p.id}/members`, { headers: h });
    const members = await list.json() as Array<{ userId: string; role: string }>;
    expect(members.find((m) => m.userId === target.id)?.role).toBe('viewer');
  });

  it('viewer can read members (200)', async () => {
    const owner = await createTestUser({ role: 'member' });
    const viewer = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    await addMembership(viewer.id, p.id, 'viewer');
    const h = await auth(viewer);
    const res = await app.request(`/api/projects/${p.id}/members`, { headers: h });
    expect(res.status).toBe(200);
    const members = await res.json() as Array<{ userId: string }>;
    expect(members.length).toBe(2);
  });

  it('super-admin manages members of a project they are NOT a member of', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const target = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    // Admin has no membership row — requireMembership grants 'owner' automatically.
    const h = await auth(admin);
    const add = await app.request(`/api/projects/${p.id}/members`, json('POST', { userId: target.id, role: 'editor' }, h));
    expect(add.status).toBe(201);
    const del = await app.request(`/api/projects/${p.id}/members/${target.id}`, { method: 'DELETE', headers: h });
    expect(del.status).toBe(204);
  });

  it('sole owner POST own userId role editor → 409 last_owner', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    const res = await app.request(`/api/projects/${p.id}/members`, json('POST', { userId: owner.id, role: 'editor' }, h));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('last_owner');
  });
});
