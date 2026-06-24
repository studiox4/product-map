// Integration tests for GET /api/projects/:projectId/activity (workspace feed).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import {
  setupTestDb,
  truncateAll,
  closeTestDb,
  createTestUser,
  createTestProject,
  addMembership,
  authCookie,
} from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects, features, users, activity } from '@productmap/db/schema';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

let userId: string;
let editorId: string;
let ganttId: string;
let projectId: string;
let auth: Record<string, string> = {};

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const actor = await createTestUser({ role: 'admin' });
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
  const [project] = await db
    .insert(projects)
    .values({ name: 'ProductMap', vision: 'v', aboutMd: '' })
    .returning();
  projectId = project.id;
  // Super-admin needs membership for requireMembership to set currentProjectId
  await addMembership(actor.id, project.id, 'editor');
  const [u] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
  userId = u.id;
  const rows = await db
    .insert(features)
    .values([
      { projectId: project.id, title: 'Rich markdown editor', horizon: 'now' },
      { projectId: project.id, title: 'Gantt roadmap', horizon: 'next' },
    ])
    .returning();
  editorId = rows[0].id;
  ganttId = rows[1].id;
});

async function seedHistory() {
  await db.insert(activity).values([
    {
      featureId: editorId,
      projectId,
      actorId: userId,
      kind: 'feature_created',
      payload: {
        to: 'Rich markdown editor',
        snapshot: { title: 'Rich markdown editor', horizon: 'later', status: 'idea', startDate: null, endDate: null },
      },
      createdAt: daysAgo(30),
    },
    {
      featureId: editorId,
      projectId,
      actorId: userId,
      kind: 'horizon_changed',
      payload: { from: 'later', to: 'now' },
      createdAt: daysAgo(20),
    },
    {
      featureId: ganttId,
      projectId,
      actorId: userId,
      kind: 'dates_changed',
      payload: {
        from: { startDate: null, endDate: null },
        to: { startDate: '2026-07-01', endDate: '2026-07-18' },
      },
      createdAt: daysAgo(5),
    },
  ]);
}

describe('GET /api/projects/:projectId/activity', () => {
  it('returns project-scoped activity ascending with joined actor and feature title', async () => {
    await seedHistory();
    const res = await app.request(`/api/projects/${projectId}/activity`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(3);
    // ascending — replay order
    expect(body.map((a: { kind: string }) => a.kind)).toEqual([
      'feature_created',
      'horizon_changed',
      'dates_changed',
    ]);
    const first = body[0];
    expect(first.featureId).toBe(editorId);
    expect(first.featureTitle).toBe('Rich markdown editor');
    expect(first.actorId).toBe(userId);
    expect(first.actorName).toBe('Corban');
    expect(first.actorColor).toBe('#2b557e');
    expect(first.payload.snapshot).toEqual({
      title: 'Rich markdown editor',
      horizon: 'later',
      status: 'idea',
      startDate: null,
      endDate: null,
    });
    expect(new Date(first.createdAt).getTime()).toBeLessThan(new Date(body[1].createdAt).getTime());
    // spans multiple features
    expect(body[2].featureId).toBe(ganttId);
    expect(body[2].featureTitle).toBe('Gantt roadmap');
    expect(body[2].payload).toEqual({
      from: { startDate: null, endDate: null },
      to: { startDate: '2026-07-01', endDate: '2026-07-18' },
    });
  });

  it('filters with ?since= (inclusive lower bound)', async () => {
    await seedHistory();
    const res = await app.request(
      `/api/projects/${projectId}/activity?since=${daysAgo(21).toISOString()}`,
      { headers: auth },
    );
    const body = await res.json();
    expect(body.map((a: { kind: string }) => a.kind)).toEqual(['horizon_changed', 'dates_changed']);
  });

  it('400 on a malformed since', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/activity?since=not-a-date`,
      { headers: auth },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('caps the feed at 1000 rows', async () => {
    const rows = Array.from({ length: 1010 }, (_, i) => ({
      featureId: editorId,
      projectId,
      actorId: userId,
      kind: 'description_edited',
      payload: null,
      createdAt: new Date(Date.now() - (1010 - i) * 60_000),
    }));
    await db.insert(activity).values(rows);
    const res = await app.request(`/api/projects/${projectId}/activity`, { headers: auth });
    const body = await res.json();
    expect(body).toHaveLength(1000);
  });

  it('activity list in project A excludes activity from project B (isolation)', async () => {
    // Seed activity in project A
    await seedHistory();

    // Create project B with its own feature and activity
    const actorB = await createTestUser({ role: 'admin' });
    const authB = { cookie: await authCookie(actorB), origin: 'http://localhost', host: 'localhost' };
    const projectB = await createTestProject('Project B');
    await addMembership(actorB.id, projectB.id, 'editor');
    const [featureB] = await db
      .insert(features)
      .values({ projectId: projectB.id, title: 'Feature B', horizon: 'now' })
      .returning();
    await db.insert(activity).values({
      featureId: featureB.id,
      projectId: projectB.id,
      actorId: userId,
      kind: 'feature_created',
      payload: { to: 'Feature B', snapshot: { title: 'Feature B', horizon: 'now', status: 'idea', startDate: null, endDate: null } },
    });

    // Project A activity must not include B's activity
    const resA = await app.request(`/api/projects/${projectId}/activity`, { headers: auth });
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.every((a: { featureId: string }) => a.featureId !== featureB.id)).toBe(true);
    expect(bodyA).toHaveLength(3);

    // Project B activity must not include A's activity
    const resB = await app.request(`/api/projects/${projectB.id}/activity`, { headers: authB });
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    expect(bodyB).toHaveLength(1);
    expect(bodyB[0].featureId).toBe(featureB.id);
  });

  it('viewer GET returns 200 (read allowed)', async () => {
    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${projectId}/activity`, { headers: viewerAuth });
    expect(res.status).toBe(200);
  });

  it('non-member GET returns 404', async () => {
    const outsider = await createTestUser({ role: 'member' });
    const outsiderAuth = { cookie: await authCookie(outsider), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${projectId}/activity`, { headers: outsiderAuth });
    expect(res.status).toBe(404);
  });
});
