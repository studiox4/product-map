// Intake token mint tests — Task 5.
// Extended in Task 6 with public-submit route tests.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie, createTestProject, addMembership } from '../test/helpers';
import { __resetIntakeLimiters } from './intake';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { shareTokens, notifications, ideas } from '@productmap/db/schema';

const { app } = await import('../app');

let userId: string;
let projectId: string;
let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  __resetIntakeLimiters();
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

// Helper to mint + extract token (uses the Task 5 route):
async function mintIntake(over: Record<string, unknown> = {}) {
  const res = await app.request(`/api/projects/${projectId}/share/intake`, json({ introMd: 'hi', moderation: true, ...over }));
  expect(res.status).toBe(201);
  return (await res.json()).url.split('/')[2] as string; // /p/<token>/submit
}
const submit = (token: string, body: unknown) =>
  app.request(`/api/intake/${token}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' }, body: JSON.stringify(body) });

it('meta GET returns project name + intro for an active intake token', async () => {
  const token = await mintIntake({ introMd: 'Share your idea' });
  const res = await app.request(`/api/intake/${token}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ projectName: 'ProductMap', introMd: 'Share your idea', active: true });
});

it('meta GET on a revoked token → opaque 404', async () => {
  const token = await mintIntake();
  await db.update(shareTokens).set({ revokedAt: new Date() }).where(eq(shareTokens.token, token));
  const res = await app.request(`/api/intake/${token}`);
  expect(res.status).toBe(404);
});

it('held submission creates a pending public idea + notifies owners/editors', async () => {
  const token = await mintIntake({ moderation: true });
  const res = await submit(token, { title: 'CSV export', bodyMd: 'please', submitterEmail: 'a@b.co' });
  expect(res.status).toBe(201);
  const rows = await db.select().from(ideas).where(eq(ideas.projectId, projectId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: 'pending', source: 'public', submitterEmail: 'a@b.co', createdBy: null });
  const notifs = await db.select().from(notifications).where(eq(notifications.projectId, projectId));
  expect(notifs.some((n) => n.kind === 'idea_submitted')).toBe(true);
});

it('moderation-off submission lands straight in the inbox, no held notification', async () => {
  const token = await mintIntake({ moderation: false });
  await submit(token, { title: 'Quick idea' });
  const [row] = await db.select().from(ideas).where(eq(ideas.projectId, projectId));
  expect(row.status).toBe('inbox');
  const notifs = await db.select().from(notifications).where(eq(notifications.projectId, projectId));
  expect(notifs.some((n) => n.kind === 'idea_submitted')).toBe(false);
});

it('submit re-validates the token: revoked → 404 even with a valid body', async () => {
  const token = await mintIntake();
  await db.update(shareTokens).set({ revokedAt: new Date() }).where(eq(shareTokens.token, token));
  const res = await submit(token, { title: 'Should not save' });
  expect(res.status).toBe(404);
  const rows = await db.select().from(ideas).where(eq(ideas.projectId, projectId));
  expect(rows).toHaveLength(0);
});

it('honeypot: a filled website field → 201 but no idea saved', async () => {
  const token = await mintIntake();
  const res = await submit(token, { title: 'Bot', website: 'http://spam' });
  expect(res.status).toBe(201);
  const rows = await db.select().from(ideas).where(eq(ideas.projectId, projectId));
  expect(rows).toHaveLength(0);
});

it('a roadmap token cannot be used as an intake token → 404', async () => {
  const mint = await app.request(`/api/projects/${projectId}/share/roadmap`, json({}));
  const roadmapToken = (await mint.json()).url.split('/').pop();
  const res = await submit(roadmapToken, { title: 'wrong kind' });
  expect(res.status).toBe(404);
});

it('rate-limit: 6 submits from the same IP trip the ipLimiter (max 5) → 429', async () => {
  // In the test env clientIp() falls back to 'unknown' for all requests, so
  // all calls share one IP bucket. The IP limit (max 5) trips before the
  // token limit (max 20) — we assert the IP bucket, not per-token semantics.
  const token = await mintIntake({ moderation: false });
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => submit(token, { title: 'Rate test idea' })),
  );
  const statuses = responses.map((r) => r.status);
  expect(statuses).toContain(429);
});
