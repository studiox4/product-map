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
