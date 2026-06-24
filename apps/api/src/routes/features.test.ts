import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects, features, documents, users, activity, featureCollaborators, votes, objectives, releases, featureDependencies } from '@productmap/db/schema';
import { asc, eq } from 'drizzle-orm';

let projectId: string;
let userId: string;
let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  // Actor IS the Corban user — attribution checks compare against userId
  // Admin role = super-admin (bypasses membership gate entirely)
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  userId = actor.id;
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
  const p = await createTestProject('ProductMap');
  projectId = p.id;
});

async function activityRows(featureId: string) {
  return db
    .select()
    .from(activity)
    .where(eq(activity.featureId, featureId))
    .orderBy(asc(activity.createdAt));
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

const patch = (body: unknown) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

describe('POST /api/projects/:projectId/features', () => {
  it('creates a feature with 201 and defaults', async () => {
    const res = await app.request(`/api/projects/${projectId}/features`, json({ title: 'Gantt', horizon: 'next' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Gantt');
    expect(body.horizon).toBe('next');
    expect(body.status).toBe('idea');
    expect(body.sortOrder).toBe(0);
    expect(body.startDate).toBeNull();
    expect(body.endDate).toBeNull();
    expect(body.projectId).toBe(projectId);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('feature_created payload carries a replayable snapshot', async () => {
    const res = await app.request(`/api/projects/${projectId}/features`, json({ title: 'Gantt', horizon: 'next' }));
    const body = await res.json();
    const acts = await activityRows(body.id);
    expect(acts).toHaveLength(1);
    expect(acts[0].payload).toEqual({
      to: 'Gantt',
      snapshot: { title: 'Gantt', horizon: 'next', status: 'idea', startDate: null, endDate: null },
    });
  });

  it('attributes creation to the fallback user and records feature_created activity', async () => {
    const res = await app.request(`/api/projects/${projectId}/features`, json({ title: 'Gantt', horizon: 'next' }));
    const body = await res.json();
    expect(body.createdBy).toBe(userId);
    expect(body.updatedBy).toBe(userId);
    expect(body.descriptionMd).toBe('');

    const acts = await activityRows(body.id);
    expect(acts).toHaveLength(1);
    expect(acts[0].kind).toBe('feature_created');
    expect(acts[0].actorId).toBe(userId);

    const collabs = await db
      .select()
      .from(featureCollaborators)
      .where(eq(featureCollaborators.featureId, body.id));
    expect(collabs.map((c) => c.userId)).toEqual([userId]);
  });

  it('auth cookie determines the actor on write', async () => {
    const other = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co', color: '#3c6b46' });
    await addMembership(other.id, projectId, 'editor');
    const otherAuth = { cookie: await authCookie(other), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${projectId}/features`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...otherAuth },
      body: JSON.stringify({ title: 'Voting', horizon: 'later' }),
    });
    const body = await res.json();
    expect(body.createdBy).toBe(other.id);
    const acts = await activityRows(body.id);
    expect(acts[0].actorId).toBe(other.id);
  });

  it('400 on invalid body', async () => {
    const res = await app.request(`/api/projects/${projectId}/features`, json({ title: '', horizon: 'soon' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation');
    expect(body.issues).toBeDefined();
  });
});

describe('GET /api/projects/:projectId/features', () => {
  it('returns FeatureWithDocs with empty documents array', async () => {
    await app.request(`/api/projects/${projectId}/features`, json({ title: 'A', horizon: 'now' }));
    const res = await app.request(`/api/projects/${projectId}/features`, { headers: auth });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(1);
    expect(list[0].documents).toEqual([]);
  });

  it('orders by horizon (now,next,later) then sortOrder then createdAt', async () => {
    const insert = (title: string, horizon: 'now' | 'next' | 'later', sortOrder: number) =>
      db.insert(features).values({ projectId, title, horizon, sortOrder }).returning();
    await insert('later-0', 'later', 0);
    await insert('now-1', 'now', 1);
    await insert('next-0', 'next', 0);
    await insert('now-0a', 'now', 0);
    await insert('now-0b', 'now', 0);

    const res = await app.request(`/api/projects/${projectId}/features`, { headers: auth });
    const list = await res.json();
    expect(list.map((f: { title: string }) => f.title)).toEqual([
      'now-0a',
      'now-0b',
      'now-1',
      'next-0',
      'later-0',
    ]);
  });
});

describe('PUT /api/projects/:projectId/features/:id/vote', () => {
  // Voter identity (write and read) comes from the auth cookie.
  const put = (value: number, voteAuth?: Record<string, string>) => ({
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(voteAuth ?? auth) },
    body: JSON.stringify({ value }),
  });

  it('votes, flips, and clears with persisted summaries', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();

    const boost = await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(1));
    expect(boost.status).toBe(200);
    expect(await boost.json()).toEqual({ score: 1, boosts: 1, cools: 0, myVote: 1 });

    const flip = await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(-1));
    expect(await flip.json()).toEqual({ score: -1, boosts: 0, cools: 1, myVote: -1 });

    const clear = await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(0));
    expect(await clear.json()).toEqual({ score: 0, boosts: 0, cools: 0, myVote: 0 });

    const rows = await db.select().from(votes).where(eq(votes.featureId, f.id));
    expect(rows).toHaveLength(0);
  });

  it('enforces one vote per user and aggregates across users', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const ada = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co', color: '#3c6b46' });
    await addMembership(ada.id, projectId, 'editor');
    const adaAuth = { cookie: await authCookie(ada), origin: 'http://localhost', host: 'localhost' };

    await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(1));
    await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(1)); // same user again: still one row
    const res = await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(-1, adaAuth));
    expect(await res.json()).toEqual({ score: 0, boosts: 1, cools: 1, myVote: -1 });

    const rows = await db.select().from(votes).where(eq(votes.featureId, f.id));
    expect(rows).toHaveLength(2);
  });

  it('404 on unknown feature and 400 on invalid value', async () => {
    const missing = await app.request(`/api/projects/${projectId}/features/00000000-0000-4000-8000-000000000000/vote`, put(1, auth));
    expect(missing.status).toBe(404);
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const bad = await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(2));
    expect(bad.status).toBe(400);
  });

  it('GET /features and /features/:id include vote fields with per-user myVote', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const ada = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co', color: '#3c6b46' });
    await addMembership(ada.id, projectId, 'editor');
    const adaAuth = { cookie: await authCookie(ada), origin: 'http://localhost', host: 'localhost' };
    await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(1)); // Corban votes +1
    await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(-1, adaAuth)); // Ada votes -1

    // GET list authenticated as Ada → her myVote = -1
    const list = await (await app.request(`/api/projects/${projectId}/features`, { headers: adaAuth })).json();
    expect(list[0]).toMatchObject({ score: 0, boosts: 1, cools: 1, myVote: -1 });

    // GET single authenticated as Corban → his myVote = +1
    const single = await (await app.request(`/api/projects/${projectId}/features/${f.id}`, { headers: auth })).json();
    expect(single).toMatchObject({ score: 0, boosts: 1, cools: 1, myVote: 1 }); // Corban voted +1

    const [unvoted] = await db.insert(features).values({ projectId, title: 'G', horizon: 'later' }).returning();
    const fresh = await (await app.request(`/api/projects/${projectId}/features/${unvoted.id}`, { headers: auth })).json();
    expect(fresh).toMatchObject({ score: 0, boosts: 0, cools: 0, myVote: 0 });
  });

  it('reads return personalized myVote for the authenticated cookie user', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    // Corban votes +1 via auth cookie
    await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, put(1));
    // Read as Corban via the same auth cookie → myVote = +1
    const single = await (
      await app.request(`/api/projects/${projectId}/features/${f.id}`, { headers: auth })
    ).json();
    expect(single).toMatchObject({ score: 1, boosts: 1, cools: 0, myVote: 1 });
  });
});

describe('GET /api/projects/:projectId/features/:id', () => {
  it('returns the feature with its documents', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    await db.insert(documents).values({ projectId, featureId: f.id, type: 'prd', title: 'F PRD' });
    const res = await app.request(`/api/projects/${projectId}/features/${f.id}`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('F');
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].type).toBe('prd');
    // DocumentMeta only — no content fields
    expect(body.documents[0].contentJson).toBeUndefined();
    expect(body.documents[0].contentMd).toBeUndefined();
  });

  it('404 on unknown id', async () => {
    const res = await app.request(`/api/projects/${projectId}/features/00000000-0000-4000-8000-000000000000`, { headers: auth });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('PATCH /api/projects/:projectId/features/:id', () => {
  it('updates horizon, status and dates', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(
      `/api/projects/${projectId}/features/${f.id}`,
      patch({ horizon: 'later', status: 'planned', startDate: '2026-06-01', endDate: '2026-06-15' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.horizon).toBe('later');
    expect(body.status).toBe('planned');
    expect(body.startDate).toBe('2026-06-01');
    expect(body.endDate).toBe('2026-06-15');
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(body.createdAt).getTime());
  });

  it('records one activity entry per changed field group, with {from,to} payloads', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    await app.request(
      `/api/projects/${projectId}/features/${f.id}`,
      patch({ horizon: 'later', status: 'planned', startDate: '2026-06-01', endDate: '2026-06-15' }),
    );
    const acts = await activityRows(f.id);
    const byKind = new Map(acts.map((a) => [a.kind, a]));
    expect(byKind.get('horizon_changed')?.payload).toEqual({ from: 'now', to: 'later' });
    expect(byKind.get('status_changed')?.payload).toEqual({ from: 'idea', to: 'planned' });
    expect(byKind.get('dates_changed')?.payload).toEqual({
      from: { startDate: null, endDate: null },
      to: { startDate: '2026-06-01', endDate: '2026-06-15' },
    });
    expect(acts).toHaveLength(3);
    expect(acts.every((a) => a.actorId === userId)).toBe(true);
  });

  it('records description_edited and sets updatedBy when descriptionMd changes', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(`/api/projects/${projectId}/features/${f.id}`, patch({ descriptionMd: '## Why' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.descriptionMd).toBe('## Why');
    expect(body.updatedBy).toBe(userId);
    const acts = await activityRows(f.id);
    expect(acts.map((a) => a.kind)).toEqual(['description_edited']);
  });

  it('records no activity when values do not change', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    await app.request(`/api/projects/${projectId}/features/${f.id}`, patch({ horizon: 'now', sortOrder: 3 }));
    expect(await activityRows(f.id)).toHaveLength(0);
  });

  it('auto-adds the editor as collaborator on PATCH', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    await app.request(`/api/projects/${projectId}/features/${f.id}`, patch({ status: 'planned' }));
    const collabs = await db
      .select()
      .from(featureCollaborators)
      .where(eq(featureCollaborators.featureId, f.id));
    expect(collabs.map((c) => c.userId)).toEqual([userId]);
  });

  it('400 on inverted dates', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(
      `/api/projects/${projectId}/features/${f.id}`,
      patch({ startDate: '2026-06-15', endDate: '2026-06-01' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('404 on unknown id', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/features/00000000-0000-4000-8000-000000000000`,
      patch({ status: 'shipped' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:projectId/features/:id', () => {
  it('204, then GET 404, and cascades documents', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    await db.insert(documents).values({ projectId, featureId: f.id, type: 'prd', title: 'doc' });

    const del = await app.request(`/api/projects/${projectId}/features/${f.id}`, { method: 'DELETE', headers: auth });
    expect(del.status).toBe(204);

    const get = await app.request(`/api/projects/${projectId}/features/${f.id}`, { headers: auth });
    expect(get.status).toBe(404);

    const docs = await db.select().from(documents).where(eq(documents.featureId, f.id));
    expect(docs).toHaveLength(0);
  });

  it('404 on unknown id', async () => {
    const res = await app.request(`/api/projects/${projectId}/features/00000000-0000-4000-8000-000000000000`, {
      method: 'DELETE',
      headers: auth,
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/projects/:projectId/features/:id/activity', () => {
  it('returns ActivityItems joined with actor name/color, newest first, capped at 50', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    for (let i = 0; i < 55; i++) {
      await db.insert(activity).values({
        featureId: f.id,
        projectId,
        actorId: userId,
        kind: 'status_changed',
        payload: { from: 'idea', to: `step-${i}` },
        createdAt: new Date(Date.now() - (55 - i) * 1000),
      });
    }
    const res = await app.request(`/api/projects/${projectId}/features/${f.id}/activity`, { headers: auth });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(50);
    expect(list[0].actorName).toBe('Corban');
    expect(list[0].actorColor).toBe('#2b557e');
    expect(list[0].payload.to).toBe('step-54'); // newest first
    expect(list[49].payload.to).toBe('step-5');
  });

  it('404 on unknown feature', async () => {
    const res = await app.request(`/api/projects/${projectId}/features/00000000-0000-4000-8000-000000000000/activity`, { headers: auth });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/projects/:projectId/features/:id/collaborators', () => {
  it('replaces the collaborator set and returns 204', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const [other] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();
    await db.insert(featureCollaborators).values({ featureId: f.id, userId });

    const res = await app.request(`/api/projects/${projectId}/features/${f.id}/collaborators`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ userIds: [other.id] }),
    });
    expect(res.status).toBe(204);

    const collabs = await db
      .select()
      .from(featureCollaborators)
      .where(eq(featureCollaborators.featureId, f.id));
    expect(collabs.map((c) => c.userId)).toEqual([other.id]);
  });

  it('400 on non-uuid ids and 404 on unknown feature', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const bad = await app.request(`/api/projects/${projectId}/features/${f.id}/collaborators`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ userIds: ['nope'] }),
    });
    expect(bad.status).toBe(400);

    const missing = await app.request(
      `/api/projects/${projectId}/features/00000000-0000-4000-8000-000000000000/collaborators`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ userIds: [] }),
      },
    );
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/projects/:projectId/features/:id — dream-tier fields (size/riskMd/objectiveId/releaseId)', () => {
  it('updates size, riskMd, objectiveId and releaseId; records size_changed activity', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const [obj] = await db.insert(objectives).values({ projectId, title: 'Roadmap of record' }).returning();
    const [rel] = await db.insert(releases).values({ projectId, name: 'v0.2 — Team ready' }).returning();

    const res = await app.request(
      `/api/projects/${projectId}/features/${f.id}`,
      patch({ size: 'l', riskMd: 'CRDT risk', objectiveId: obj.id, releaseId: rel.id }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ size: 'l', riskMd: 'CRDT risk', objectiveId: obj.id, releaseId: rel.id });

    const acts = await activityRows(f.id);
    const sizeActs = acts.filter((a) => a.kind === 'size_changed');
    expect(sizeActs).toHaveLength(1);
    expect(sizeActs[0].payload).toEqual({ from: null, to: 'l' });
  });

  it('size can be cleared back to null, recording size_changed; no activity when unchanged', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now', size: 'm' }).returning();
    const same = await app.request(`/api/projects/${projectId}/features/${f.id}`, patch({ size: 'm' }));
    expect(same.status).toBe(200);
    expect((await activityRows(f.id)).filter((a) => a.kind === 'size_changed')).toHaveLength(0);

    const cleared = await app.request(`/api/projects/${projectId}/features/${f.id}`, patch({ size: null }));
    expect((await cleared.json()).size).toBeNull();
    const acts = (await activityRows(f.id)).filter((a) => a.kind === 'size_changed');
    expect(acts).toHaveLength(1);
    expect(acts[0].payload).toEqual({ from: 'm', to: null });
  });

  it('400 on invalid size', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(`/api/projects/${projectId}/features/${f.id}`, patch({ size: 'xl' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects/:projectId/features — blockerIds', () => {
  it('list and detail include blockerIds from feature_dependencies', async () => {
    const [blocker] = await db.insert(features).values({ projectId, title: 'Auth', horizon: 'now' }).returning();
    const [blocked] = await db.insert(features).values({ projectId, title: 'Realtime', horizon: 'later' }).returning();
    await db.insert(featureDependencies).values({ blockerId: blocker.id, blockedId: blocked.id });

    const list = await (await app.request(`/api/projects/${projectId}/features`, { headers: auth })).json();
    const blockedRow = list.find((x: { id: string }) => x.id === blocked.id);
    expect(blockedRow.blockerIds).toEqual([blocker.id]);
    const blockerRow = list.find((x: { id: string }) => x.id === blocker.id);
    expect(blockerRow.blockerIds).toEqual([]);

    const detail = await (await app.request(`/api/projects/${projectId}/features/${blocked.id}`, { headers: auth })).json();
    expect(detail.blockerIds).toEqual([blocker.id]);
  });
});

describe('GET /api/projects/:projectId/features/:id/collaborators', () => {
  it('returns the collaborator users for a feature', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const [other] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();
    await db.insert(featureCollaborators).values([
      { featureId: f.id, userId },
      { featureId: f.id, userId: other.id },
    ]);

    const res = await app.request(`/api/projects/${projectId}/features/${f.id}/collaborators`, { headers: auth });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(2);
    expect(list.map((u: { name: string }) => u.name).sort()).toEqual(['Ada', 'Corban']);
    expect(list[0]).toMatchObject({ color: expect.stringMatching(/^#/) });
  });

  it('returns [] when there are none and 404 on unknown feature', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const empty = await app.request(`/api/projects/${projectId}/features/${f.id}/collaborators`, { headers: auth });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    const missing = await app.request(`/api/projects/${projectId}/features/00000000-0000-4000-8000-000000000000/collaborators`, { headers: auth });
    expect(missing.status).toBe(404);
  });
});

// ---- Cross-project isolation tests (Task B1 new tests) ----
describe('features cross-project isolation', () => {
  it('member-of-A GET /api/projects/A/features/:featureInB → 404 (path-id IDOR)', async () => {
    const projectB = await createTestProject('Project B');
    const [featureInB] = await db.insert(features).values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' }).returning();

    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/features/${featureInB.id}`, { headers: memberAAuth });
    expect(res.status).toBe(404);
  });

  it('member-of-A PATCH /api/projects/A/features/:featureInB → 404 (path-id IDOR on PATCH)', async () => {
    const projectB = await createTestProject('Project B');
    const [featureInB] = await db.insert(features).values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' }).returning();

    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/features/${featureInB.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...memberAAuth },
      body: JSON.stringify({ status: 'planned' }),
    });
    expect(res.status).toBe(404);
  });

  it('member-of-A DELETE /api/projects/A/features/:featureInB → 404 (path-id IDOR on DELETE)', async () => {
    const projectB = await createTestProject('Project B');
    const [featureInB] = await db.insert(features).values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' }).returning();

    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/features/${featureInB.id}`, {
      method: 'DELETE',
      headers: memberAAuth,
    });
    expect(res.status).toBe(404);
    // Row still exists in project B
    const [row] = await db.select().from(features).where(eq(features.id, featureInB.id));
    expect(row).toBeDefined();
  });

  it('PATCH with objectiveId belonging to project B → 404 (body-id scoping)', async () => {
    const [featureInA] = await db.insert(features).values({ projectId, title: 'A Feature', horizon: 'now' }).returning();
    const projectB = await createTestProject('Project B');
    const [objInB] = await db.insert(objectives).values({ projectId: projectB.id, title: 'B Objective' }).returning();

    const res = await app.request(`/api/projects/${projectId}/features/${featureInA.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ objectiveId: objInB.id }),
    });
    expect(res.status).toBe(404);
    // Feature should not be updated
    const [row] = await db.select().from(features).where(eq(features.id, featureInA.id));
    expect(row.objectiveId).toBeNull();
  });

  it('PATCH with releaseId belonging to project B → 404 (body-id scoping)', async () => {
    const [featureInA] = await db.insert(features).values({ projectId, title: 'A Feature', horizon: 'now' }).returning();
    const projectB = await createTestProject('Project B');
    const [relInB] = await db.insert(releases).values({ projectId: projectB.id, name: 'B Release' }).returning();

    const res = await app.request(`/api/projects/${projectId}/features/${featureInA.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ releaseId: relInB.id }),
    });
    expect(res.status).toBe(404);
    // Feature should not be updated
    const [row] = await db.select().from(features).where(eq(features.id, featureInA.id));
    expect(row.releaseId).toBeNull();
  });

  it('GET list in A does not include B\'s features (list isolation)', async () => {
    await db.insert(features).values({ projectId, title: 'A Feature', horizon: 'now' });
    const projectB = await createTestProject('Project B');
    await db.insert(features).values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' });

    const res = await app.request(`/api/projects/${projectId}/features`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    const titles = body.map((f: { title: string }) => f.title);
    expect(titles).toContain('A Feature');
    expect(titles).not.toContain('B Feature');
  });

  it('viewer POST → 403 (write gate)', async () => {
    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/features`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...viewerAuth },
      body: JSON.stringify({ title: 'Should fail', horizon: 'now' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('viewer PUT vote → 403 (viewer cannot vote)', async () => {
    const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/features/${f.id}/vote`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...viewerAuth },
      body: JSON.stringify({ value: 1 }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('GET /api/projects/A/features/<B feature>/activity → 404 (cross-project activity IDOR)', async () => {
    const projectB = await createTestProject('Project B');
    const [featureInB] = await db.insert(features).values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' }).returning();

    const res = await app.request(`/api/projects/${projectId}/features/${featureInB.id}/activity`, { headers: auth });
    expect(res.status).toBe(404);
  });
});
