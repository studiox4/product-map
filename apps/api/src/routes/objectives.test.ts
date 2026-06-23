import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { objectives, features } from '@productmap/db/schema';

let userId: string;
let projectId: string;
let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  userId = actor.id;
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
  const p = await createTestProject('ProductMap');
  projectId = p.id;
  // Admin is a super-admin (bypasses membership gate entirely)
});

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

describe('objectives CRUD', () => {
  it('creates an objective with 201 and defaults', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/objectives`,
      json('POST', { title: 'Grow weekly actives', metric: 'WAU', target: '500', quarter: 'Q3 2026' }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      title: 'Grow weekly actives',
      metric: 'WAU',
      target: '500',
      quarter: 'Q3 2026',
    });

    const minimal = await app.request(`/api/projects/${projectId}/objectives`, json('POST', { title: 'Ship faster' }));
    expect(minimal.status).toBe(201);
    expect(await minimal.json()).toMatchObject({ title: 'Ship faster', metric: '', target: '', quarter: '' });
  });

  it('400s on invalid create body', async () => {
    const res = await app.request(`/api/projects/${projectId}/objectives`, json('POST', { title: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('lists objectives in creation order', async () => {
    // distinct created_at values — a bulk insert stamps one shared now()
    await db.insert(objectives).values({ projectId, title: 'First', createdAt: new Date('2026-06-01T00:00:00Z') });
    await db.insert(objectives).values({ projectId, title: 'Second', createdAt: new Date('2026-06-02T00:00:00Z') });
    const res = await app.request(`/api/projects/${projectId}/objectives`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((o: { title: string }) => o.title)).toEqual(['First', 'Second']);
  });

  it('gets, patches and deletes an objective', async () => {
    const [o] = await db.insert(objectives).values({ projectId, title: 'Retention' }).returning();

    const got = await app.request(`/api/projects/${projectId}/objectives/${o.id}`, { headers: auth });
    expect(got.status).toBe(200);
    expect((await got.json()).title).toBe('Retention');

    const patched = await app.request(`/api/projects/${projectId}/objectives/${o.id}`, json('PATCH', { metric: 'D30', target: '40%' }));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ title: 'Retention', metric: 'D30', target: '40%' });

    const deleted = await app.request(`/api/projects/${projectId}/objectives/${o.id}`, { method: 'DELETE', headers: auth });
    expect(deleted.status).toBe(204);
    expect((await app.request(`/api/projects/${projectId}/objectives/${o.id}`, { headers: auth })).status).toBe(404);
  });

  it('404s on unknown objective for get/patch/delete', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await app.request(`/api/projects/${projectId}/objectives/${missing}`, { headers: auth })).status).toBe(404);
    expect((await app.request(`/api/projects/${projectId}/objectives/${missing}`, json('PATCH', { title: 'x' }))).status).toBe(404);
    expect((await app.request(`/api/projects/${projectId}/objectives/${missing}`, { method: 'DELETE', headers: auth })).status).toBe(404);
  });
});

describe('objectives dream-tier-2 properties + joins', () => {
  it('creates an objective with all new properties', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/objectives`,
      json('POST', {
        title: 'Grow weekly actives',
        descriptionMd: 'Why this matters.',
        metric: 'WAU',
        target: '500',
        current: '320',
        status: 'at_risk',
        ownerId: userId,
        quarter: 'Q3 2026',
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      title: 'Grow weekly actives',
      descriptionMd: 'Why this matters.',
      metric: 'WAU',
      target: '500',
      current: '320',
      status: 'at_risk',
      ownerId: userId,
      quarter: 'Q3 2026',
    });
  });

  it('defaults status on_track and empty description/current', async () => {
    const res = await app.request(`/api/projects/${projectId}/objectives`, json('POST', { title: 'Ship faster' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      status: 'on_track',
      descriptionMd: '',
      current: '',
      ownerId: null,
    });
  });

  it('patches status, current and ownerId (incl. clearing owner)', async () => {
    const [o] = await db.insert(objectives).values({ projectId, title: 'Retention', ownerId: userId }).returning();
    const patched = await app.request(
      `/api/projects/${projectId}/objectives/${o.id}`,
      json('PATCH', { status: 'achieved', current: '42%', descriptionMd: 'done' }),
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ status: 'achieved', current: '42%', descriptionMd: 'done' });

    const cleared = await app.request(`/api/projects/${projectId}/objectives/${o.id}`, json('PATCH', { ownerId: null }));
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).ownerId).toBeNull();
  });

  it('400s on invalid status', async () => {
    const res = await app.request(`/api/projects/${projectId}/objectives`, json('POST', { title: 'x', status: 'blocked' }));
    expect(res.status).toBe(400);
  });

  it('GET / joins owner {name,color} and featureCount', async () => {
    const [owned] = await db
      .insert(objectives)
      .values({ projectId, title: 'Owned', ownerId: userId, metric: 'WAU', target: '500', current: '320' })
      .returning();
    const [bare] = await db.insert(objectives).values({ projectId, title: 'Bare' }).returning();
    await db.insert(features).values([
      { projectId, title: 'F1', horizon: 'now', objectiveId: owned.id },
      { projectId, title: 'F2', horizon: 'next', objectiveId: owned.id },
      { projectId, title: 'F3', horizon: 'later' },
    ]);

    const res = await app.request(`/api/projects/${projectId}/objectives`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    const ownedRow = body.find((o: { id: string }) => o.id === owned.id);
    expect(ownedRow).toMatchObject({
      title: 'Owned',
      owner: { name: 'Corban', color: '#2b557e' },
      featureCount: 2,
    });
    const bareRow = body.find((o: { id: string }) => o.id === bare.id);
    expect(bareRow).toMatchObject({ owner: null, featureCount: 0 });
  });
});

// ---- Cross-project isolation tests (Task A5 new tests) ----
describe('objectives cross-project isolation', () => {
  it('member-of-A GET /api/projects/A/objectives/:objInB → 404 (path-id IDOR)', async () => {
    // Set up project B with an objective in it
    const projectB = await createTestProject('Project B');
    const [objInB] = await db.insert(objectives).values({ projectId: projectB.id, title: 'B Objective' }).returning();

    // member is a member of project A (projectId), not B
    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = {
      cookie: await authCookie(memberA),
      origin: 'http://localhost',
      host: 'localhost',
    };

    // Try to access B's objective via A's path — loadScoped should 404
    const res = await app.request(
      `/api/projects/${projectId}/objectives/${objInB.id}`,
      { headers: memberAAuth },
    );
    expect(res.status).toBe(404);
  });

  it('GET list in A does not include B\'s objectives (list isolation)', async () => {
    // Objective in project A
    await db.insert(objectives).values({ projectId, title: 'A Objective' });
    // Objective in project B
    const projectB = await createTestProject('Project B');
    await db.insert(objectives).values({ projectId: projectB.id, title: 'B Objective' });

    const res = await app.request(`/api/projects/${projectId}/objectives`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    const titles = body.map((o: { title: string }) => o.title);
    expect(titles).toContain('A Objective');
    expect(titles).not.toContain('B Objective');
  });

  it('viewer POST → 403 (write gate)', async () => {
    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = {
      cookie: await authCookie(viewer),
      origin: 'http://localhost',
      host: 'localhost',
    };

    const res = await app.request(
      `/api/projects/${projectId}/objectives`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...viewerAuth },
        body: JSON.stringify({ title: 'Should fail' }),
      },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('member-of-A PATCH /api/projects/A/objectives/:objInB → 404 (path-id IDOR on PATCH)', async () => {
    const projectB = await createTestProject('Project B');
    const [objInB] = await db.insert(objectives).values({ projectId: projectB.id, title: 'B Objective' }).returning();

    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/objectives/${objInB.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...memberAAuth },
      body: JSON.stringify({ title: 'Mutated' }),
    });
    expect(res.status).toBe(404);
    // The original row must be untouched
    const [row] = await db.select().from(objectives).where(eq(objectives.id, objInB.id));
    expect(row.title).toBe('B Objective');
  });

  it('member-of-A DELETE /api/projects/A/objectives/:objInB → 404 (path-id IDOR on DELETE)', async () => {
    const projectB = await createTestProject('Project B');
    const [objInB] = await db.insert(objectives).values({ projectId: projectB.id, title: 'B Objective' }).returning();

    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/objectives/${objInB.id}`, {
      method: 'DELETE',
      headers: memberAAuth,
    });
    expect(res.status).toBe(404);
    // The original row must still exist
    const [row] = await db.select().from(objectives).where(eq(objectives.id, objInB.id));
    expect(row).toBeDefined();
    expect(row.title).toBe('B Objective');
  });
});
