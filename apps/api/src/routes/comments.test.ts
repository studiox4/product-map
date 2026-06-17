import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects, features, documents, users, comments, activity, featureCollaborators } from '@productmap/db';
import { asc, eq } from 'drizzle-orm';

let projectId: string;
let userId: string;
let otherId: string;
let featureId: string;
let docFeatureId: string;
let documentId: string;
let auth: Record<string, string> = {};
let otherAuth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  // Actor IS the Corban user — attribution checks compare against userId
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  userId = actor.id;
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
  // Ada is a secondary user for 403 / doc-comment tests
  const other = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co', color: '#3c6b46' });
  otherId = other.id;
  otherAuth = { cookie: await authCookie(other), origin: 'http://localhost', host: 'localhost' };
  const [p] = await db.insert(projects).values({ name: 'ProductMap', vision: 'v', aboutMd: '' }).returning();
  projectId = p.id;
  const [f] = await db.insert(features).values({ projectId, title: 'Gantt roadmap', horizon: 'next' }).returning();
  featureId = f.id;
  const [df] = await db.insert(features).values({ projectId, title: 'Rich markdown editor', horizon: 'now' }).returning();
  docFeatureId = df.id;
  const [d] = await db.insert(documents).values({ projectId, featureId: docFeatureId, type: 'prd', title: 'PRD' }).returning();
  documentId = d.id;
});

const post = (body: unknown, asAuth?: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(asAuth ?? auth) },
  body: JSON.stringify(body),
});
const patch = (body: unknown, asAuth?: Record<string, string>) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...(asAuth ?? auth) },
  body: JSON.stringify(body),
});

async function activityRows(fid: string) {
  return db.select().from(activity).where(eq(activity.featureId, fid)).orderBy(asc(activity.createdAt));
}

describe('POST /api/comments', () => {
  it('creates a feature comment with 201, author join, activity and collaborator', async () => {
    const res = await app.request('/api/comments', post({ featureId, body: 'Week or month view?' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      featureId,
      documentId: null,
      parentId: null,
      body: 'Week or month view?',
      authorId: userId,
      authorName: 'Corban',
      authorColor: '#2b557e',
      resolvedAt: null,
      resolvedBy: null,
    });

    const acts = await activityRows(featureId);
    expect(acts).toHaveLength(1);
    expect(acts[0].kind).toBe('comment_added');
    expect(acts[0].actorId).toBe(userId);

    const collabs = await db
      .select()
      .from(featureCollaborators)
      .where(eq(featureCollaborators.featureId, featureId));
    expect(collabs.map((c) => c.userId)).toEqual([userId]);
  });

  it('creates a doc comment and attributes activity to the doc’s feature', async () => {
    const res = await app.request('/api/comments', post({ documentId, body: 'Add shortcuts?' }, otherAuth));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.documentId).toBe(documentId);
    expect(body.featureId).toBeNull();
    expect(body.authorName).toBe('Ada');

    const acts = await activityRows(docFeatureId);
    expect(acts.map((a) => a.kind)).toEqual(['comment_added']);
    expect(acts[0].actorId).toBe(otherId);

    const collabs = await db
      .select()
      .from(featureCollaborators)
      .where(eq(featureCollaborators.featureId, docFeatureId));
    expect(collabs.map((c) => c.userId)).toEqual([otherId]);
  });

  it('creates a one-level reply and rejects reply-to-reply with 400', async () => {
    const root = await (await app.request('/api/comments', post({ featureId, body: 'root' }))).json();
    const replyRes = await app.request(
      '/api/comments',
      post({ featureId, parentId: root.id, body: 'reply' }),
    );
    expect(replyRes.status).toBe(201);
    const reply = await replyRes.json();
    expect(reply.parentId).toBe(root.id);

    const nested = await app.request(
      '/api/comments',
      post({ featureId, parentId: reply.id, body: 'reply to reply' }),
    );
    expect(nested.status).toBe(400);
  });

  it('400 when both or neither target is given, and on empty body', async () => {
    expect((await app.request('/api/comments', post({ body: 'x' }))).status).toBe(400);
    expect(
      (await app.request('/api/comments', post({ featureId, documentId, body: 'x' }))).status,
    ).toBe(400);
    expect((await app.request('/api/comments', post({ featureId, body: '' }))).status).toBe(400);
  });

  it('404 on unknown feature, document, or parent', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await app.request('/api/comments', post({ featureId: missing, body: 'x' }))).status).toBe(404);
    expect((await app.request('/api/comments', post({ documentId: missing, body: 'x' }))).status).toBe(404);
    expect(
      (await app.request('/api/comments', post({ featureId, parentId: missing, body: 'x' }))).status,
    ).toBe(404);
  });
});

describe('GET /api/comments', () => {
  it('returns threads with nested replies, unresolved first, newest roots first', async () => {
    const oldRoot = await (await app.request('/api/comments', post({ featureId, body: 'old root' }))).json();
    await app.request('/api/comments', post({ featureId, parentId: oldRoot.id, body: 'first reply' }, otherAuth));
    await app.request('/api/comments', post({ featureId, parentId: oldRoot.id, body: 'second reply' }));
    const newRoot = await (await app.request('/api/comments', post({ featureId, body: 'new root' }))).json();
    const resolvedRoot = await (
      await app.request('/api/comments', post({ featureId, body: 'resolved root' }))
    ).json();
    await app.request(`/api/comments/${resolvedRoot.id}/resolve`, patch({ resolved: true }));

    const res = await app.request(`/api/comments?featureId=${featureId}`, { headers: auth });
    expect(res.status).toBe(200);
    const threads = await res.json();
    expect(threads.map((t: { body: string }) => t.body)).toEqual(['new root', 'old root', 'resolved root']);
    expect(threads[0].replies).toEqual([]);
    expect(threads[1].replies.map((r: { body: string }) => r.body)).toEqual(['first reply', 'second reply']);
    expect(threads[1].replies[0].authorName).toBe('Ada');
    expect(threads[1].replies[0].authorColor).toBe('#3c6b46');
    expect(threads[2].resolvedAt).not.toBeNull();
  });

  it('filters by documentId and keeps surfaces separate', async () => {
    await app.request('/api/comments', post({ featureId, body: 'feature comment' }));
    await app.request('/api/comments', post({ documentId, body: 'doc comment' }));
    const res = await app.request(`/api/comments?documentId=${documentId}`, { headers: auth });
    const threads = await res.json();
    expect(threads).toHaveLength(1);
    expect(threads[0].body).toBe('doc comment');
  });

  it('400 when neither or both query params are given', async () => {
    expect((await app.request('/api/comments', { headers: auth })).status).toBe(400);
    expect(
      (await app.request(`/api/comments?featureId=${featureId}&documentId=${documentId}`, { headers: auth })).status,
    ).toBe(400);
  });
});

describe('PATCH /api/comments/:id', () => {
  it('lets the author edit their own body', async () => {
    const root = await (await app.request('/api/comments', post({ featureId, body: 'tpyo' }))).json();
    const res = await app.request(`/api/comments/${root.id}`, patch({ body: 'typo fixed' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.body).toBe('typo fixed');
    expect(body.authorName).toBe('Corban');
  });

  it('403 for non-authors and 404 on unknown id', async () => {
    const root = await (await app.request('/api/comments', post({ featureId, body: 'mine' }))).json();
    const res = await app.request(`/api/comments/${root.id}`, patch({ body: 'hijack' }, otherAuth));
    expect(res.status).toBe(403);
    const missing = await app.request(
      '/api/comments/00000000-0000-4000-8000-000000000000',
      patch({ body: 'x' }),
    );
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/comments/:id/resolve', () => {
  it('resolves and reopens a root, recording comment_resolved activity', async () => {
    const root = await (await app.request('/api/comments', post({ featureId, body: 'root' }))).json();

    const res = await app.request(`/api/comments/${root.id}/resolve`, patch({ resolved: true }, otherAuth));
    expect(res.status).toBe(200);
    const resolved = await res.json();
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolvedBy).toBe(otherId);

    const reopenRes = await app.request(`/api/comments/${root.id}/resolve`, patch({ resolved: false }));
    const reopened = await reopenRes.json();
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.resolvedBy).toBeNull();

    const acts = await activityRows(featureId);
    const resolveActs = acts.filter((a) => a.kind === 'comment_resolved');
    expect(resolveActs).toHaveLength(2);
    expect(resolveActs[0].payload).toMatchObject({ resolved: true });
    expect(resolveActs[1].payload).toMatchObject({ resolved: false });
  });

  it('400 when resolving a reply, 404 on unknown id', async () => {
    const root = await (await app.request('/api/comments', post({ featureId, body: 'root' }))).json();
    const reply = await (
      await app.request('/api/comments', post({ featureId, parentId: root.id, body: 'reply' }))
    ).json();
    const res = await app.request(`/api/comments/${reply.id}/resolve`, patch({ resolved: true }));
    expect(res.status).toBe(400);
    const missing = await app.request(
      '/api/comments/00000000-0000-4000-8000-000000000000/resolve',
      patch({ resolved: true }),
    );
    expect(missing.status).toBe(404);
  });
});

describe('DELETE /api/comments/:id', () => {
  it('author deletes a root → 204 and replies cascade', async () => {
    const root = await (await app.request('/api/comments', post({ featureId, body: 'root' }))).json();
    await app.request('/api/comments', post({ featureId, parentId: root.id, body: 'reply' }, otherAuth));

    const res = await app.request(`/api/comments/${root.id}`, { method: 'DELETE', headers: auth });
    expect(res.status).toBe(204);
    const remaining = await db.select().from(comments).where(eq(comments.featureId, featureId));
    expect(remaining).toHaveLength(0);
  });

  it('403 for non-authors and 404 on unknown id', async () => {
    const root = await (await app.request('/api/comments', post({ featureId, body: 'root' }))).json();
    const res = await app.request(`/api/comments/${root.id}`, {
      method: 'DELETE',
      headers: otherAuth,
    });
    expect(res.status).toBe(403);
    const missing = await app.request('/api/comments/00000000-0000-4000-8000-000000000000', {
      method: 'DELETE',
      headers: auth,
    });
    expect(missing.status).toBe(404);
  });
});
