import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership } from '../test/helpers';
import { db } from '../db';
import { notifications, ideas, features, releases, projectFavorites } from '@productmap/db';
import { fanOutIdeaSubmittedNotification } from './notifications';

beforeAll(async () => { await setupTestDb(); });
beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeTestDb(); });

describe('fanOutIdeaSubmittedNotification', () => {
  it('notifies owners and editors (not viewers) of a held submission', async () => {
    const project = await createTestProject('P');
    const owner = await createTestUser({ role: 'member', name: 'O', email: 'o@t.co' });
    const editor = await createTestUser({ role: 'member', name: 'E', email: 'e@t.co' });
    const viewer = await createTestUser({ role: 'member', name: 'V', email: 'v@t.co' });
    await addMembership(owner.id, project.id, 'owner');
    await addMembership(editor.id, project.id, 'editor');
    await addMembership(viewer.id, project.id, 'viewer');
    const [idea] = await db.insert(ideas).values({ projectId: project.id, title: 'X', source: 'public', status: 'pending' }).returning();

    await fanOutIdeaSubmittedNotification({ projectId: project.id, ideaId: idea.id, title: 'X' });

    const rows = await db.select().from(notifications).where(eq(notifications.projectId, project.id));
    const recipientIds = rows.map((r) => r.userId).sort();
    expect(recipientIds).toEqual([owner.id, editor.id].sort());
    expect(rows.every((r) => r.kind === 'idea_submitted')).toBe(true);
    expect(rows.every((r) => r.actorId === null)).toBe(true);
    expect(rows[0].payload).toMatchObject({ ideaId: idea.id, title: 'X' });
  });
});

describe('fanOutAssignedNotification + fanOutReleasePublishedNotification', () => {
  let alice: { id: string };
  let bob: { id: string };
  let projectId: string;
  let featureId: string;

  beforeEach(async () => {
    alice = await createTestUser({ name: 'Alice', email: 'alice@t.co' });
    bob = await createTestUser({ name: 'Bob', email: 'bob@t.co' });
    const project = await createTestProject('TestProject');
    projectId = project.id;
    await addMembership(alice.id, projectId, 'owner');
    await addMembership(bob.id, projectId, 'editor');
    const [feat] = await db.insert(features).values({ projectId, title: 'Feature 1' }).returning();
    featureId = feat.id;
  });

  it('fanOutAssignedNotification notifies added users (not actor/muted), deduping unread', async () => {
    const { fanOutAssignedNotification } = await import('../lib/notifications');
    await fanOutAssignedNotification({ featureId, projectId, addedUserIds: [bob.id, alice.id], actorId: alice.id });
    let rows = await db.select().from(notifications).where(and(eq(notifications.userId, bob.id), eq(notifications.kind, 'assigned')));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ featureId, actorId: alice.id });
    // actor (alice) excluded
    expect((await db.select().from(notifications).where(and(eq(notifications.userId, alice.id), eq(notifications.kind, 'assigned')))).length).toBe(0);
    // dedupe: re-fire while unread → still 1
    await fanOutAssignedNotification({ featureId, projectId, addedUserIds: [bob.id], actorId: alice.id });
    rows = await db.select().from(notifications).where(and(eq(notifications.userId, bob.id), eq(notifications.kind, 'assigned')));
    expect(rows).toHaveLength(1);
  });

  it('release_published notifies only favoriters, excludes actor + muted', async () => {
    const { fanOutReleasePublishedNotification } = await import('../lib/notifications');
    const [rel] = await db.insert(releases).values({ projectId, name: 'v1', status: 'shipped', shippedAt: new Date() }).returning();
    // bob favorited; alice (actor) did not
    await db.insert(projectFavorites).values({ userId: bob.id, projectId });
    await fanOutReleasePublishedNotification({ projectId, releaseId: rel.id, releaseName: 'v1', actorId: alice.id });
    const rows = await db.select().from(notifications).where(eq(notifications.kind, 'release_published'));
    expect(rows.map((r) => r.userId)).toEqual([bob.id]);
    expect(rows[0].payload).toMatchObject({ releaseId: rel.id, name: 'v1' });
  });
});
