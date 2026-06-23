import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects, features, activity, featureDependencies } from '@productmap/db/schema';
import { asc, eq } from 'drizzle-orm';

let projectId: string;
let userId: string;
let featureA: string;
let featureB: string;
let featureC: string;
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
  const [p] = await db.insert(projects).values({ name: 'ProductMap', vision: 'v', aboutMd: '' }).returning();
  projectId = p.id;
  const [a] = await db.insert(features).values({ projectId, title: 'Auth', horizon: 'now' }).returning();
  featureA = a.id;
  const [b] = await db.insert(features).values({ projectId, title: 'Realtime', horizon: 'next' }).returning();
  featureB = b.id;
  const [cf] = await db.insert(features).values({ projectId, title: 'Comments', horizon: 'later' }).returning();
  featureC = cf.id;
});

const put = (body: unknown) => ({
  method: 'PUT',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

async function setBlockers(id: string, blockerIds: string[]) {
  return app.request(`/api/projects/${projectId}/features/${id}/dependencies`, put({ blockerIds }));
}

async function activityRows(fid: string) {
  return db.select().from(activity).where(eq(activity.featureId, fid)).orderBy(asc(activity.createdAt));
}

describe('GET /api/projects/:projectId/features/:id/dependencies', () => {
  it('returns empty blockers and blocked for an unlinked feature', async () => {
    const res = await app.request(`/api/projects/${projectId}/features/${featureA}/dependencies`, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ blockers: [], blocked: [] });
  });

  it('returns blockers and blocked with full feature rows', async () => {
    await db.insert(featureDependencies).values([
      { blockerId: featureA, blockedId: featureB },
      { blockerId: featureB, blockedId: featureC },
    ]);
    const res = await app.request(`/api/projects/${projectId}/features/${featureB}/dependencies`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blockers.map((f: { id: string }) => f.id)).toEqual([featureA]);
    expect(body.blockers[0].title).toBe('Auth');
    expect(body.blocked.map((f: { id: string }) => f.id)).toEqual([featureC]);
  });

  it('404s on unknown feature', async () => {
    const res = await app.request(`/api/projects/${projectId}/features/00000000-0000-4000-8000-000000000000/dependencies`, { headers: auth });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/projects/:projectId/features/:id/dependencies', () => {
  it('replaces the blocker set and returns the new graph', async () => {
    await db.insert(featureDependencies).values({ blockerId: featureA, blockedId: featureC });
    const res = await setBlockers(featureC, [featureB]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blockers.map((f: { id: string }) => f.id)).toEqual([featureB]);
    const edges = await db.select().from(featureDependencies);
    expect(edges).toEqual([{ blockerId: featureB, blockedId: featureC }]);
  });

  it('records dependency_added and dependency_removed activity on the blocked feature', async () => {
    await db.insert(featureDependencies).values({ blockerId: featureA, blockedId: featureC });
    const res = await setBlockers(featureC, [featureB]);
    expect(res.status).toBe(200);
    const acts = await activityRows(featureC);
    expect(acts.map((a) => a.kind).sort()).toEqual(['dependency_added', 'dependency_removed']);
    const added = acts.find((a) => a.kind === 'dependency_added')!;
    expect(added.actorId).toBe(userId);
    expect(added.payload).toMatchObject({ blockerId: featureB, blockerTitle: 'Realtime' });
    const removed = acts.find((a) => a.kind === 'dependency_removed')!;
    expect(removed.payload).toMatchObject({ blockerId: featureA });
  });

  it('does not log activity for unchanged blockers', async () => {
    await db.insert(featureDependencies).values({ blockerId: featureA, blockedId: featureC });
    await setBlockers(featureC, [featureA, featureB]);
    const acts = await activityRows(featureC);
    expect(acts.map((a) => a.kind)).toEqual(['dependency_added']);
  });

  it('rejects a direct cycle with 400 {error:"cycle"}', async () => {
    await setBlockers(featureB, [featureA]);
    const res = await setBlockers(featureA, [featureB]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'cycle' });
    // graph untouched
    const edges = await db.select().from(featureDependencies);
    expect(edges).toEqual([{ blockerId: featureA, blockedId: featureB }]);
  });

  it('rejects a transitive cycle (A→B→C, then C blocks A)', async () => {
    await setBlockers(featureB, [featureA]); // A blocks B
    await setBlockers(featureC, [featureB]); // B blocks C
    const res = await setBlockers(featureA, [featureC]); // C would block A → A→B→C→A
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'cycle' });
  });

  it('rejects a self-blocker with 400 cycle', async () => {
    const res = await setBlockers(featureA, [featureA]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'cycle' });
  });

  it('allows re-pointing an edge that previously formed part of a chain', async () => {
    await setBlockers(featureB, [featureA]); // A blocks B
    // Replacing B's blockers with C is fine: removes A→B, adds C→B.
    const res = await setBlockers(featureB, [featureC]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blockers.map((f: { id: string }) => f.id)).toEqual([featureC]);
  });

  it('404s on unknown feature or unknown blocker id', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await setBlockers(missing, [])).status).toBe(404);
    expect((await setBlockers(featureA, [missing])).status).toBe(404);
  });

  it('400s on invalid body', async () => {
    const res = await app.request(`/api/projects/${projectId}/features/${featureA}/dependencies`, put({ blockerIds: ['nope'] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });
});

// ---- cross-project security tests ----

describe('cross-project deps scoping', () => {
  it('PUT with a blockerId from a different project → 404', async () => {
    // Create project B with a feature in it
    const projectB = await createTestProject('Project B');
    const [featureInB] = await db.insert(features).values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' }).returning();

    // Member of A (editor) tries to set B's feature as a blocker for A's feature
    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(
      `/api/projects/${projectId}/features/${featureA}/dependencies`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...memberAAuth },
        body: JSON.stringify({ blockerIds: [featureInB.id] }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('path-id IDOR: GET deps for a feature in project B via project A path → 404', async () => {
    const projectB = await createTestProject('Project B');
    const [featureInB] = await db.insert(features).values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' }).returning();

    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };

    // Try to GET deps for B's feature via A's project path
    const res = await app.request(
      `/api/projects/${projectId}/features/${featureInB.id}/dependencies`,
      { headers: memberAAuth },
    );
    expect(res.status).toBe(404);
  });

  it('viewer write → 403', async () => {
    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(
      `/api/projects/${projectId}/features/${featureA}/dependencies`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...viewerAuth },
        body: JSON.stringify({ blockerIds: [] }),
      },
    );
    expect(res.status).toBe(403);
  });
});
