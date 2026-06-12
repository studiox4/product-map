import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { products, features, documents, users, activity, featureCollaborators, votes, objectives, releases, featureDependencies } from '@productmap/db';
import { asc, eq } from 'drizzle-orm';

let productId: string;
let userId: string;

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const [p] = await db
    .insert(products)
    .values({ name: 'ProductMap', vision: 'v', aboutMd: '' })
    .returning();
  productId = p.id;
  const [u] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
  userId = u.id;
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
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const patch = (body: unknown) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/features', () => {
  it('creates a feature with 201 and defaults', async () => {
    const res = await app.request('/api/features', json({ title: 'Gantt', horizon: 'next' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Gantt');
    expect(body.horizon).toBe('next');
    expect(body.status).toBe('idea');
    expect(body.sortOrder).toBe(0);
    expect(body.startDate).toBeNull();
    expect(body.endDate).toBeNull();
    expect(body.productId).toBe(productId);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('feature_created payload carries a replayable snapshot', async () => {
    const res = await app.request('/api/features', json({ title: 'Gantt', horizon: 'next' }));
    const body = await res.json();
    const acts = await activityRows(body.id);
    expect(acts).toHaveLength(1);
    expect(acts[0].payload).toEqual({
      to: 'Gantt',
      snapshot: { title: 'Gantt', horizon: 'next', status: 'idea', startDate: null, endDate: null },
    });
  });

  it('attributes creation to the fallback user and records feature_created activity', async () => {
    const res = await app.request('/api/features', json({ title: 'Gantt', horizon: 'next' }));
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

  it('resolves x-user-id header as the actor', async () => {
    const [other] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();
    const res = await app.request('/api/features', {
      ...json({ title: 'Voting', horizon: 'later' }),
      headers: { 'content-type': 'application/json', 'x-user-id': other.id },
    });
    const body = await res.json();
    expect(body.createdBy).toBe(other.id);
    const acts = await activityRows(body.id);
    expect(acts[0].actorId).toBe(other.id);
  });

  it('400 on invalid body', async () => {
    const res = await app.request('/api/features', json({ title: '', horizon: 'soon' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation');
    expect(body.issues).toBeDefined();
  });
});

describe('GET /api/features', () => {
  it('returns FeatureWithDocs with empty documents array', async () => {
    await app.request('/api/features', json({ title: 'A', horizon: 'now' }));
    const res = await app.request('/api/features');
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(1);
    expect(list[0].documents).toEqual([]);
  });

  it('orders by horizon (now,next,later) then sortOrder then createdAt', async () => {
    const insert = (title: string, horizon: 'now' | 'next' | 'later', sortOrder: number) =>
      db.insert(features).values({ productId, title, horizon, sortOrder }).returning();
    await insert('later-0', 'later', 0);
    await insert('now-1', 'now', 1);
    await insert('next-0', 'next', 0);
    await insert('now-0a', 'now', 0);
    await insert('now-0b', 'now', 0);

    const res = await app.request('/api/features');
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

describe('PUT /api/features/:id/vote', () => {
  const put = (value: number, asUser?: string) => ({
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(asUser ? { 'x-user-id': asUser } : {}) },
    body: JSON.stringify({ value }),
  });

  it('votes, flips, and clears with persisted summaries', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();

    const boost = await app.request(`/api/features/${f.id}/vote`, put(1));
    expect(boost.status).toBe(200);
    expect(await boost.json()).toEqual({ score: 1, boosts: 1, cools: 0, myVote: 1 });

    const flip = await app.request(`/api/features/${f.id}/vote`, put(-1));
    expect(await flip.json()).toEqual({ score: -1, boosts: 0, cools: 1, myVote: -1 });

    const clear = await app.request(`/api/features/${f.id}/vote`, put(0));
    expect(await clear.json()).toEqual({ score: 0, boosts: 0, cools: 0, myVote: 0 });

    const rows = await db.select().from(votes).where(eq(votes.featureId, f.id));
    expect(rows).toHaveLength(0);
  });

  it('enforces one vote per user and aggregates across users', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const [ada] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();

    await app.request(`/api/features/${f.id}/vote`, put(1));
    await app.request(`/api/features/${f.id}/vote`, put(1)); // same user again: still one row
    const res = await app.request(`/api/features/${f.id}/vote`, put(-1, ada.id));
    expect(await res.json()).toEqual({ score: 0, boosts: 1, cools: 1, myVote: -1 });

    const rows = await db.select().from(votes).where(eq(votes.featureId, f.id));
    expect(rows).toHaveLength(2);
  });

  it('404 on unknown feature and 400 on invalid value', async () => {
    const missing = await app.request('/api/features/00000000-0000-4000-8000-000000000000/vote', put(1));
    expect(missing.status).toBe(404);
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const bad = await app.request(`/api/features/${f.id}/vote`, put(2));
    expect(bad.status).toBe(400);
  });

  it('GET /api/features and /api/features/:id include vote fields with per-user myVote', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const [ada] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();
    await app.request(`/api/features/${f.id}/vote`, put(1));
    await app.request(`/api/features/${f.id}/vote`, put(-1, ada.id));

    const list = await (await app.request('/api/features', { headers: { 'x-user-id': ada.id } })).json();
    expect(list[0]).toMatchObject({ score: 0, boosts: 1, cools: 1, myVote: -1 });

    const single = await (await app.request(`/api/features/${f.id}`)).json();
    expect(single).toMatchObject({ score: 0, boosts: 1, cools: 1, myVote: 1 }); // fallback user = Corban

    const [unvoted] = await db.insert(features).values({ productId, title: 'G', horizon: 'later' }).returning();
    const fresh = await (await app.request(`/api/features/${unvoted.id}`)).json();
    expect(fresh).toMatchObject({ score: 0, boosts: 0, cools: 0, myVote: 0 });
  });

  it('reads with a stale/unknown x-user-id fall back to the first user (matches write path)', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    // Stale id (e.g. localStorage survives a db reset): the write fell back to
    // the first user, so the read must compute myVote for that same user.
    const staleId = '11111111-2222-4333-8444-555555555555';
    await app.request(`/api/features/${f.id}/vote`, put(1, staleId));

    const single = await (
      await app.request(`/api/features/${f.id}`, { headers: { 'x-user-id': staleId } })
    ).json();
    expect(single).toMatchObject({ score: 1, boosts: 1, cools: 0, myVote: 1 });
  });
});

describe('GET /api/features/:id', () => {
  it('returns the feature with its documents', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    await db.insert(documents).values({ featureId: f.id, type: 'prd', title: 'F PRD' });
    const res = await app.request(`/api/features/${f.id}`);
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
    const res = await app.request('/api/features/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('PATCH /api/features/:id', () => {
  it('updates horizon, status and dates', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(
      `/api/features/${f.id}`,
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
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    await app.request(
      `/api/features/${f.id}`,
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
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(`/api/features/${f.id}`, patch({ descriptionMd: '## Why' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.descriptionMd).toBe('## Why');
    expect(body.updatedBy).toBe(userId);
    const acts = await activityRows(f.id);
    expect(acts.map((a) => a.kind)).toEqual(['description_edited']);
  });

  it('records no activity when values do not change', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    await app.request(`/api/features/${f.id}`, patch({ horizon: 'now', sortOrder: 3 }));
    expect(await activityRows(f.id)).toHaveLength(0);
  });

  it('auto-adds the editor as collaborator on PATCH', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    await app.request(`/api/features/${f.id}`, patch({ status: 'planned' }));
    const collabs = await db
      .select()
      .from(featureCollaborators)
      .where(eq(featureCollaborators.featureId, f.id));
    expect(collabs.map((c) => c.userId)).toEqual([userId]);
  });

  it('400 on inverted dates', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(
      `/api/features/${f.id}`,
      patch({ startDate: '2026-06-15', endDate: '2026-06-01' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('404 on unknown id', async () => {
    const res = await app.request(
      '/api/features/00000000-0000-4000-8000-000000000000',
      patch({ status: 'shipped' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/features/:id', () => {
  it('204, then GET 404, and cascades documents', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    await db.insert(documents).values({ featureId: f.id, type: 'prd', title: 'doc' });

    const del = await app.request(`/api/features/${f.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    const get = await app.request(`/api/features/${f.id}`);
    expect(get.status).toBe(404);

    const docs = await db.select().from(documents).where(eq(documents.featureId, f.id));
    expect(docs).toHaveLength(0);
  });

  it('404 on unknown id', async () => {
    const res = await app.request('/api/features/00000000-0000-4000-8000-000000000000', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/features/:id/activity', () => {
  it('returns ActivityItems joined with actor name/color, newest first, capped at 50', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    for (let i = 0; i < 55; i++) {
      await db.insert(activity).values({
        featureId: f.id,
        actorId: userId,
        kind: 'status_changed',
        payload: { from: 'idea', to: `step-${i}` },
        createdAt: new Date(Date.now() - (55 - i) * 1000),
      });
    }
    const res = await app.request(`/api/features/${f.id}/activity`);
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(50);
    expect(list[0].actorName).toBe('Corban');
    expect(list[0].actorColor).toBe('#2b557e');
    expect(list[0].payload.to).toBe('step-54'); // newest first
    expect(list[49].payload.to).toBe('step-5');
  });

  it('404 on unknown feature', async () => {
    const res = await app.request('/api/features/00000000-0000-4000-8000-000000000000/activity');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/features/:id/collaborators', () => {
  it('replaces the collaborator set and returns 204', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const [other] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();
    await db.insert(featureCollaborators).values({ featureId: f.id, userId });

    const res = await app.request(`/api/features/${f.id}/collaborators`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
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
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const bad = await app.request(`/api/features/${f.id}/collaborators`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: ['nope'] }),
    });
    expect(bad.status).toBe(400);

    const missing = await app.request(
      '/api/features/00000000-0000-4000-8000-000000000000/collaborators',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: [] }),
      },
    );
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/features/:id — dream-tier fields (size/riskMd/objectiveId/releaseId)', () => {
  it('updates size, riskMd, objectiveId and releaseId; records size_changed activity', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const [obj] = await db.insert(objectives).values({ title: 'Roadmap of record' }).returning();
    const [rel] = await db.insert(releases).values({ name: 'v0.2 — Team ready' }).returning();

    const res = await app.request(
      `/api/features/${f.id}`,
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
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now', size: 'm' }).returning();
    const same = await app.request(`/api/features/${f.id}`, patch({ size: 'm' }));
    expect(same.status).toBe(200);
    expect((await activityRows(f.id)).filter((a) => a.kind === 'size_changed')).toHaveLength(0);

    const cleared = await app.request(`/api/features/${f.id}`, patch({ size: null }));
    expect((await cleared.json()).size).toBeNull();
    const acts = (await activityRows(f.id)).filter((a) => a.kind === 'size_changed');
    expect(acts).toHaveLength(1);
    expect(acts[0].payload).toEqual({ from: 'm', to: null });
  });

  it('400 on invalid size', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const res = await app.request(`/api/features/${f.id}`, patch({ size: 'xl' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/features — blockerIds', () => {
  it('list and detail include blockerIds from feature_dependencies', async () => {
    const [blocker] = await db.insert(features).values({ productId, title: 'Auth', horizon: 'now' }).returning();
    const [blocked] = await db.insert(features).values({ productId, title: 'Realtime', horizon: 'later' }).returning();
    await db.insert(featureDependencies).values({ blockerId: blocker.id, blockedId: blocked.id });

    const list = await (await app.request('/api/features')).json();
    const blockedRow = list.find((x: { id: string }) => x.id === blocked.id);
    expect(blockedRow.blockerIds).toEqual([blocker.id]);
    const blockerRow = list.find((x: { id: string }) => x.id === blocker.id);
    expect(blockerRow.blockerIds).toEqual([]);

    const detail = await (await app.request(`/api/features/${blocked.id}`)).json();
    expect(detail.blockerIds).toEqual([blocker.id]);
  });
});

describe('GET /api/features/:id/collaborators', () => {
  it('returns the collaborator users for a feature', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const [other] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();
    await db.insert(featureCollaborators).values([
      { featureId: f.id, userId },
      { featureId: f.id, userId: other.id },
    ]);

    const res = await app.request(`/api/features/${f.id}/collaborators`);
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(2);
    expect(list.map((u: { name: string }) => u.name).sort()).toEqual(['Ada', 'Corban']);
    expect(list[0]).toMatchObject({ color: expect.stringMatching(/^#/) });
  });

  it('returns [] when there are none and 404 on unknown feature', async () => {
    const [f] = await db.insert(features).values({ productId, title: 'F', horizon: 'now' }).returning();
    const empty = await app.request(`/api/features/${f.id}/collaborators`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    const missing = await app.request('/api/features/00000000-0000-4000-8000-000000000000/collaborators');
    expect(missing.status).toBe(404);
  });
});
