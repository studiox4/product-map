import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects } from '@productmap/db/schema';

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
  it('DELETE /api/projects/:id (owner, archived) returns 204', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'owner');
    await app.request(`/api/projects/${p.id}/archive`, { method: 'POST', headers: await auth(u) });
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

describe('project invites (create/revoke)', () => {
  it('owner creates a link-only invite (no email) → token returned, no send', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const res = await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'viewer' }, await auth(owner)));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.role).toBe('viewer');
    expect(body.email).toBeNull();
    expect(body.emailSent).toBe(false); // no SMTP configured in tests
  });

  it('owner lists then revokes an invite', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    const created = await (await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'editor' }, h))).json();

    const list = await app.request(`/api/projects/${p.id}/invites`, { headers: h });
    expect((await list.json()).length).toBe(1);

    const del = await app.request(`/api/projects/${p.id}/invites/${created.token}`, { method: 'DELETE', headers: h });
    expect(del.status).toBe(204);

    // After revoke the list omits it.
    const list2 = await app.request(`/api/projects/${p.id}/invites`, { headers: h });
    expect((await list2.json()).length).toBe(0);
  });

  it('editor cannot create or revoke invites (403)', async () => {
    const u = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(u.id, p.id, 'editor');
    const res = await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'viewer' }, await auth(u)));
    expect(res.status).toBe(403);
  });

  it('non-member gets 404 on invite create (no existence leak)', async () => {
    const u = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const res = await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'viewer' }, await auth(u)));
    expect(res.status).toBe(404);
  });

  it('viewer cannot create an invite (403)', async () => {
    const viewer = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(viewer.id, p.id, 'viewer');
    const res = await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'editor' }, await auth(viewer)));
    expect(res.status).toBe(403);
  });

  it('editor cannot GET invite list (403)', async () => {
    const editor = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(editor.id, p.id, 'editor');
    const res = await app.request(`/api/projects/${p.id}/invites`, { headers: await auth(editor) });
    expect(res.status).toBe(403);
  });

  it('editor cannot DELETE (revoke) an invite (403)', async () => {
    const owner = await createTestUser({ role: 'member' });
    const editor = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    await addMembership(editor.id, p.id, 'editor');
    const hOwner = await auth(owner);
    const created = await (await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'viewer' }, hOwner))).json();
    const res = await app.request(`/api/projects/${p.id}/invites/${created.token}`, { method: 'DELETE', headers: await auth(editor) });
    expect(res.status).toBe(403);
  });

  it('revoking a valid token under the WRONG projectId → 404 AND invite remains active in its true project', async () => {
    const owner = await createTestUser({ role: 'member' });
    const projectA = await createTestProject('Project A');
    const projectB = await createTestProject('Project B');
    await addMembership(owner.id, projectA.id, 'owner');
    await addMembership(owner.id, projectB.id, 'owner');
    const hOwner = await auth(owner);

    // Mint invite under projectA.
    const created = await (await app.request(`/api/projects/${projectA.id}/invites`, json('POST', { role: 'editor' }, hOwner))).json();
    const token = created.token;

    // Try to revoke that token under projectB → 404 (token/projectId mismatch).
    const wrongDel = await app.request(`/api/projects/${projectB.id}/invites/${token}`, { method: 'DELETE', headers: hOwner });
    expect(wrongDel.status).toBe(404);

    // Invite is still active in projectA.
    const list = await app.request(`/api/projects/${projectA.id}/invites`, { headers: hOwner });
    const invites = await list.json() as Array<{ token: string }>;
    expect(invites.some((i) => i.token === token)).toBe(true);
  });
});

describe('project archive/restore', () => {
  it('archive hides the project from the active list and shows it under ?archived=1', async () => {
    // adminAuth + projectId set up by beforeEach
    const arch = await app.request(`/api/projects/${projectId}/archive`, { method: 'POST', headers: adminAuth });
    expect(arch.status).toBe(200);
    const active = await (await app.request('/api/projects', { headers: adminAuth })).json() as Array<{ id: string }>;
    expect(active.find((p) => p.id === projectId)).toBeUndefined();
    const archived = await (await app.request('/api/projects?archived=1', { headers: adminAuth })).json() as Array<{ id: string }>;
    expect(archived.find((p) => p.id === projectId)).toBeDefined();
  });

  it('restore returns the project to the active list', async () => {
    await app.request(`/api/projects/${projectId}/archive`, { method: 'POST', headers: adminAuth });
    const res = await app.request(`/api/projects/${projectId}/restore`, { method: 'POST', headers: adminAuth });
    expect(res.status).toBe(200);
    const active = await (await app.request('/api/projects', { headers: adminAuth })).json() as Array<{ id: string }>;
    expect(active.find((p) => p.id === projectId)).toBeDefined();
  });

  it('non-owner cannot archive (403)', async () => {
    const editor = await createTestUser({ role: 'member', name: 'Ed', email: 'ed@test.co' });
    await addMembership(editor.id, projectId, 'editor');
    const editorAuth = { cookie: await authCookie(editor), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${projectId}/archive`, { method: 'POST', headers: editorAuth });
    expect(res.status).toBe(403);
  });

  it('purge (DELETE) on an active project is rejected 409 not_archived', async () => {
    const res = await app.request(`/api/projects/${projectId}`, { method: 'DELETE', headers: adminAuth });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'not_archived' });
  });

  it('purge after archive hard-deletes the project', async () => {
    await app.request(`/api/projects/${projectId}/archive`, { method: 'POST', headers: adminAuth });
    const res = await app.request(`/api/projects/${projectId}`, { method: 'DELETE', headers: adminAuth });
    expect(res.status).toBe(204);
    const archived = await (await app.request('/api/projects?archived=1', { headers: adminAuth })).json();
    expect(archived.find((p: any) => p.id === projectId)).toBeUndefined();
  });

  it('content write to an archived project is rejected 409 project_archived', async () => {
    await app.request(`/api/projects/${projectId}/archive`, { method: 'POST', headers: adminAuth });
    const res = await app.request(`/api/projects/${projectId}/features`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...adminAuth },
      body: JSON.stringify({ title: 'x', horizon: 'now' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'project_archived' });
  });
});

describe('project slugs', () => {
  const post = (body: unknown) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuth },
    body: JSON.stringify(body),
  });

  it('POST generates a slug from the name and returns it', async () => {
    const res = await app.request('/api/projects', post({ name: 'My Cool Project!' }));
    expect(res.status).toBe(201);
    expect((await res.json()).slug).toBe('my-cool-project');
  });

  it('POST disambiguates a colliding slug with -2', async () => {
    const a = await app.request('/api/projects', post({ name: 'Alpha' }));
    expect((await a.json()).slug).toBe('alpha');
    const b = await app.request('/api/projects', post({ name: 'Alpha' }));
    expect((await b.json()).slug).toBe('alpha-2');
  });

  it('GET /api/projects includes slug', async () => {
    await app.request('/api/projects', post({ name: 'Listed' }));
    const res = await app.request('/api/projects', { headers: adminAuth });
    const rows = (await res.json()) as Array<{ name: string; slug: string }>;
    expect(rows.find((r) => r.name === 'Listed')?.slug).toBe('listed');
  });

  it('PATCH can set a custom slug', async () => {
    const res = await app.request(`/api/projects/${projectId}`, patch({ slug: 'custom-slug' }));
    expect(res.status).toBe(200);
    expect((await res.json()).slug).toBe('custom-slug');
  });

  it('PATCH rejects a slug already taken by another project with 409', async () => {
    const a = await app.request('/api/projects', post({ name: 'Taken' }));
    const takenSlug = (await a.json()).slug; // 'taken'
    const res = await app.request(`/api/projects/${projectId}`, patch({ slug: takenSlug }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('slug_taken');
  });

  it('PATCH allows setting a project to its own existing slug (no false collision)', async () => {
    await app.request(`/api/projects/${projectId}`, patch({ slug: 'mine' }));
    const res = await app.request(`/api/projects/${projectId}`, patch({ slug: 'mine' }));
    expect(res.status).toBe(200);
  });
});
