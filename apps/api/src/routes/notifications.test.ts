import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects, features, documents, comments, featureCollaborators, notifications, notificationMutes } from '@productmap/db/schema';
import { eq } from 'drizzle-orm';

let projectId: string;
let alice: { id: string }; // author/actor
let bob: { id: string };   // collaborator + recipient
let featureId: string;
let aliceAuth: Record<string, string>;
let bobAuth: Record<string, string>;

const headers = (auth: Record<string, string>) => ({ 'content-type': 'application/json', ...auth });
const post = (target: object, auth: Record<string, string>) => ({ method: 'POST', headers: headers(auth), body: JSON.stringify(target) });

beforeAll(async () => { await setupTestDb(); });
afterAll(async () => { await closeTestDb(); });

beforeEach(async () => {
  await truncateAll();
  const a = await createTestUser({ role: 'member', name: 'Alice', email: 'alice@test.co', color: '#2b557e' });
  alice = a; aliceAuth = { cookie: await authCookie(a), origin: 'http://localhost', host: 'localhost' };
  const b = await createTestUser({ role: 'member', name: 'Bob', email: 'bob@test.co', color: '#3c6b46' });
  bob = b; bobAuth = { cookie: await authCookie(b), origin: 'http://localhost', host: 'localhost' };
  const [p] = await db.insert(projects).values({ name: 'PM', vision: 'v', aboutMd: '', slug: 'pm' }).returning();
  projectId = p.id;
  await addMembership(alice.id, projectId, 'editor');
  await addMembership(bob.id, projectId, 'editor');
  const [f] = await db.insert(features).values({ projectId, title: 'F', horizon: 'now' }).returning();
  featureId = f.id;
  // Bob collaborates on the feature so generic comments notify him.
  await db.insert(featureCollaborators).values({ featureId, userId: bob.id });
});

const commentUrl = `/api/projects/`;
async function addComment(body: object, auth: Record<string, string>) {
  return app.request(`/api/projects/${projectId}/comments`, post(body, auth));
}

describe('comment generation', () => {
  it('notifies a collaborator with kind=comment, not the author', async () => {
    await addComment({ featureId, body: 'plain note' }, aliceAuth);
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: bob.id, kind: 'comment', actorId: alice.id });
  });

  it('mention beats comment for the same recipient (one row, kind=mention)', async () => {
    await addComment({ featureId, body: `hi @[Bob](${bob.id})` }, aliceAuth);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, bob.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('mention');
  });

  it('drops a forged mention id that is not a project member', async () => {
    await addComment({ featureId, body: `hi @[Ghost](00000000-0000-0000-0000-000000000000)` }, aliceAuth);
    // Only Bob (collaborator) is notified, as a plain comment; the ghost id yields nothing.
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(bob.id);
  });

  it('never notifies the author about their own comment', async () => {
    // Make Alice a collaborator too; she still must not be notified.
    await db.insert(featureCollaborators).values({ featureId, userId: alice.id });
    await addComment({ featureId, body: 'note' }, aliceAuth);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, alice.id));
    expect(rows).toHaveLength(0);
  });

  it('respects a mute on the assigned kind', async () => {
    await db.insert(notificationMutes).values({ userId: bob.id, kind: 'comment' });
    await addComment({ featureId, body: 'note' }, aliceAuth);
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(0);
  });
});

describe('routes', () => {
  async function seed(kind: 'mention' | 'comment' | 'reply' | 'project_invite' = 'comment') {
    const [n] = await db.insert(notifications).values({ userId: bob.id, projectId, kind, actorId: alice.id }).returning();
    return n.id;
  }

  it('unread-count reflects unread rows', async () => {
    await seed(); await seed();
    const res = await app.request('/api/notifications/unread-count', { headers: bobAuth });
    expect(await res.json()).toEqual({ count: 2 });
  });

  it('mark-read on own notification clears it from the count', async () => {
    const id = await seed();
    await app.request(`/api/notifications/${id}/read`, { method: 'POST', headers: bobAuth });
    const res = await app.request('/api/notifications/unread-count', { headers: bobAuth });
    expect(await res.json()).toEqual({ count: 0 });
  });

  it('mark-read on another user notification → 404', async () => {
    const id = await seed();
    const res = await app.request(`/api/notifications/${id}/read`, { method: 'POST', headers: aliceAuth });
    expect(res.status).toBe(404);
  });

  it('read-all clears only the caller rows', async () => {
    await seed(); await seed();
    await app.request('/api/notifications/read-all', { method: 'POST', headers: bobAuth });
    const res = await app.request('/api/notifications/unread-count', { headers: bobAuth });
    expect(await res.json()).toEqual({ count: 0 });
  });

  it('prefs default all-on, and a mute round-trips', async () => {
    const def = await (await app.request('/api/notifications/prefs', { headers: bobAuth })).json();
    expect(def).toEqual({ mention: true, comment: true, reply: true, project_invite: true });
    await app.request('/api/notifications/prefs', { method: 'PUT', headers: headers(bobAuth), body: JSON.stringify({ kind: 'comment', enabled: false }) });
    const muted = await (await app.request('/api/notifications/prefs', { headers: bobAuth })).json();
    expect(muted.comment).toBe(false);
    await app.request('/api/notifications/prefs', { method: 'PUT', headers: headers(bobAuth), body: JSON.stringify({ kind: 'comment', enabled: true }) });
    const on = await (await app.request('/api/notifications/prefs', { headers: bobAuth })).json();
    expect(on.comment).toBe(true);
  });

  it('unauthenticated → 401', async () => {
    const res = await app.request('/api/notifications/unread-count');
    expect(res.status).toBe(401);
  });
});
