import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership } from '../test/helpers';
import { db } from '../db';
import { notifications, ideas } from '@productmap/db';
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
