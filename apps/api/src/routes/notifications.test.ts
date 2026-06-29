import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects, features, documents, comments, featureCollaborators, notifications, notificationMutes } from '@productmap/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

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

  it('generates a mention notification for a feature-less (release_notes) document', async () => {
    // Insert a release_notes document with no featureId (feature-less doc).
    const [doc] = await db
      .insert(documents)
      .values({ projectId, featureId: null, type: 'release_notes', title: 'Release Notes' })
      .returning();
    // Alice posts a comment on the feature-less doc that @mentions Bob.
    await addComment({ documentId: doc.id, body: `hey @[Bob](${bob.id})` }, aliceAuth);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, bob.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: bob.id, kind: 'mention', actorId: alice.id });
  });

  describe('reply fan-out', () => {
    it('Carol replying notifies both Alice (root author) and Bob (sibling) with kind=reply, not Carol', async () => {
      const carol = await createTestUser({ role: 'member', name: 'Carol', email: 'carol@test.co', color: '#9a6428' });
      const carolAuth = { cookie: await authCookie(carol), origin: 'http://localhost', host: 'localhost' };
      await addMembership(carol.id, projectId, 'editor');

      // Alice posts root comment
      const rootRes = await addComment({ featureId, body: 'root comment' }, aliceAuth);
      const rootBody = await rootRes.json();
      const rootId = rootBody.id as string;

      // Bob replies — seeds Bob as thread participant
      await addComment({ body: 'bob reply', parentId: rootId }, bobAuth);

      // Clear notifications so far; Carol's reply is what we're testing
      await db.delete(notifications);

      // Carol replies to the root thread
      const carolRes = await addComment({ body: 'carol reply', parentId: rootId }, carolAuth);
      expect(carolRes.status).toBe(201);

      const rows = await db.select().from(notifications);
      // Alice and Bob should each get a reply notification; Carol should not
      const aliceRows = rows.filter((r) => r.userId === alice.id);
      const bobRows = rows.filter((r) => r.userId === bob.id);
      const carolRows = rows.filter((r) => r.userId === carol.id);

      expect(aliceRows).toHaveLength(1);
      expect(aliceRows[0].kind).toBe('reply');
      expect(bobRows).toHaveLength(1);
      expect(bobRows[0].kind).toBe('reply');
      expect(carolRows).toHaveLength(0);
    });

    it('reply>comment: thread participant who is also a collaborator gets exactly one reply row', async () => {
      // Bob is already a featureCollaborator (from beforeEach); Alice posts root, Bob replies,
      // then Alice replies again — Bob should get reply (not comment) and only one row.
      const rootRes = await addComment({ featureId, body: 'root' }, aliceAuth);
      const rootId = (await rootRes.json()).id as string;

      // Bob replies
      await addComment({ body: 'bob reply', parentId: rootId }, bobAuth);

      // Clear; now Alice replies — Bob is both thread participant and collaborator
      await db.delete(notifications);
      await addComment({ body: 'alice reply 2', parentId: rootId }, aliceAuth);

      const rows = await db.select().from(notifications).where(eq(notifications.userId, bob.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe('reply');
    });

    it('mention>reply: user mentioned in a reply gets kind=mention, not reply', async () => {
      const carol = await createTestUser({ role: 'member', name: 'Carol', email: 'carol2@test.co', color: '#9a6428' });
      const carolAuth = { cookie: await authCookie(carol), origin: 'http://localhost', host: 'localhost' };
      await addMembership(carol.id, projectId, 'editor');

      // Alice posts root; Carol replies
      const rootRes = await addComment({ featureId, body: 'root' }, aliceAuth);
      const rootId = (await rootRes.json()).id as string;
      await addComment({ featureId, body: 'carol reply', parentId: rootId }, carolAuth);

      // Clear; Bob replies to same thread AND mentions Carol (who is already a thread participant)
      await db.delete(notifications);
      await addComment({ body: `reply with mention @[Carol](${carol.id})`, parentId: rootId }, bobAuth);

      const carolRows = await db.select().from(notifications).where(eq(notifications.userId, carol.id));
      expect(carolRows).toHaveLength(1);
      expect(carolRows[0].kind).toBe('mention');
    });
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
    // Seed an unread notification for Alice as well as Bob
    await db.insert(notifications).values({ userId: alice.id, projectId, kind: 'comment', actorId: bob.id });
    await seed(); await seed();

    // Bob reads all
    await app.request('/api/notifications/read-all', { method: 'POST', headers: bobAuth });

    // Bob's unread count should be 0
    const bobRes = await app.request('/api/notifications/unread-count', { headers: bobAuth });
    expect(await bobRes.json()).toEqual({ count: 0 });

    // Alice's unread row must still exist (read-all must be user-scoped)
    const aliceUnread = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, alice.id), isNull(notifications.readAt)));
    expect(aliceUnread.length).toBeGreaterThanOrEqual(1);
  });

  it('prefs default all-on, and a mute round-trips', async () => {
    const def = await (await app.request('/api/notifications/prefs', { headers: bobAuth })).json();
    expect(def).toEqual({ mention: true, comment: true, reply: true, project_invite: true, idea_submitted: true, assigned: true, release_published: true });
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

  it('list returns items newest-first with joined fields and no nextCursor for small result', async () => {
    // seed two notifications; second inserted later so it has a newer createdAt
    await seed('comment');
    await seed('mention');
    const res = await app.request('/api/notifications', { headers: bobAuth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nextCursor).toBeNull();
    expect(body.items).toHaveLength(2);
    // newest first
    expect(body.items[0].kind).toBe('mention');
    expect(body.items[1].kind).toBe('comment');
    // joined fields
    expect(body.items[0].projectSlug).toBe('pm');
    expect(body.items[0].actorName).toBe('Alice');
    expect(body.items[0].actorColor).toBe('#2b557e');
    expect(body.items[0].readAt).toBeNull();
    expect(typeof body.items[0].createdAt).toBe('string');
  });
});

describe('fanOutInviteNotification via invite route', () => {
  // The invite route is owner-gated. We need an owner user.
  let owner: { id: string; role: 'admin' | 'member' };
  let ownerAuth: Record<string, string>;

  beforeEach(async () => {
    owner = await createTestUser({ role: 'member', name: 'Owner', email: 'owner@test.co', color: '#0e7490' });
    ownerAuth = { cookie: await authCookie(owner), origin: 'http://localhost', host: 'localhost' };
    await addMembership(owner.id, projectId, 'owner');
  });

  const postInvite = (body: object, auth: Record<string, string>) =>
    app.request(`/api/projects/${projectId}/invites`, post(body, auth));

  it('invited email matching an existing user → one project_invite notification', async () => {
    // Bob already exists with bob@test.co; owner invites him
    const res = await postInvite({ role: 'editor', email: 'bob@test.co' }, ownerAuth);
    expect(res.status).toBe(201);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, bob.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('project_invite');
  });

  it('invited email with no account → zero notifications', async () => {
    const res = await postInvite({ role: 'editor', email: 'stranger@example.com' }, ownerAuth);
    expect(res.status).toBe(201);
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(0);
  });

  it('self-invite (owner invites their own email) → notification suppressed', async () => {
    const res = await postInvite({ role: 'editor', email: 'owner@test.co' }, ownerAuth);
    expect(res.status).toBe(201);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(rows).toHaveLength(0);
  });

  it('recipient who muted project_invite → no notification', async () => {
    await db.insert(notificationMutes).values({ userId: bob.id, kind: 'project_invite' });
    const res = await postInvite({ role: 'editor', email: 'bob@test.co' }, ownerAuth);
    expect(res.status).toBe(201);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, bob.id));
    expect(rows).toHaveLength(0);
  });

  it('mixed-case email still matches an existing lower-case account → notification created', async () => {
    // bob@test.co is stored lowercase; invite with BOB@TEST.CO should still match
    const res = await postInvite({ role: 'editor', email: 'BOB@TEST.CO' }, ownerAuth);
    expect(res.status).toBe(201);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, bob.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('project_invite');
  });
});
