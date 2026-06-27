// Intake token mint tests — Task 5.
// Extended in Task 6 with public-submit route tests.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie, createTestProject, addMembership } from '../test/helpers';

const { app } = await import('../app');

let userId: string;
let projectId: string;
let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const project = await createTestProject('ProductMap');
  projectId = project.id;
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  userId = actor.id;
  await addMembership(userId, projectId, 'editor');
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
});

afterAll(async () => {
  await closeTestDb();
});

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

describe('POST /api/projects/:projectId/share/intake', () => {
  it('editor mints an intake link; returns the /p/<token>/submit url', async () => {
    const res = await app.request(`/api/projects/${projectId}/share/intake`, json({ introMd: 'Tell us your idea', moderation: true }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toMatch(/^\/p\/[A-Za-z0-9_-]{10,}\/submit$/);
    expect(body.expiresAt).toBeNull();
  });

  it('viewer cannot mint an intake link → 403', async () => {
    const viewer = await createTestUser({ role: 'member', name: 'V', email: 'v@t.co' });
    await addMembership(viewer.id, projectId, 'viewer');
    const vauth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${projectId}/share/intake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...vauth },
      body: JSON.stringify({ introMd: '', moderation: true }),
    });
    expect(res.status).toBe(403);
  });
});
