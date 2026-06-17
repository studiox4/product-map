import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';

const { app } = await import('../app');
const { db } = await import('../db');
const { projects, features, documents, releases, shareTokens } = await import('@productmap/db');

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedWorkspace() {
  const [project] = await db
    .insert(projects)
    .values({ name: 'ProductMap', vision: 'Roadmaps people read', aboutMd: '' })
    .returning();
  const [release] = await db
    .insert(releases)
    .values({ projectId: project.id, name: 'v0.2 — Team ready', targetDate: '2026-07-01' })
    .returning();
  const [featureA] = await db
    .insert(features)
    .values({
      projectId: project.id,
      title: 'Comments & review',
      horizon: 'now',
      status: 'in_progress',
      releaseId: release.id,
    })
    .returning();
  const [featureB] = await db
    .insert(features)
    .values({ projectId: project.id, title: 'Realtime collaboration', horizon: 'later' })
    .returning();
  const [doc] = await db
    .insert(documents)
    .values({ projectId: project.id, featureId: featureA.id, type: 'prd', title: 'Comments PRD', contentMd: '# Comments' })
    .returning();
  return { project, release, featureA, featureB, doc };
}

async function createToken(cookie: string): Promise<string> {
  const res = await app.request('/api/share/roadmap', {
    method: 'POST',
    headers: { cookie, origin: 'http://localhost', host: 'localhost' },
  });
  expect(res.status).toBe(201);
  const { url } = await res.json();
  const token = url.split('/').pop() as string;
  return token;
}

describe('POST /api/share/roadmap', () => {
  it('mint without auth cookie → 401', async () => {
    const res = await app.request('/api/share/roadmap', {
      method: 'POST',
      headers: { origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(401);
  });

  it('mint with admin cookie → 201 and returns a share url', async () => {
    await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const res = await app.request('/api/share/roadmap', {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toMatch(/^\/share\/[A-Za-z0-9_-]{10,}$/);

    const token = body.url.split('/').pop();
    const [row] = await db.select().from(shareTokens).where(eq(shareTokens.token, token));
    expect(row).toBeDefined();
    expect(row.kind).toBe('roadmap');
    expect(row.revokedAt).toBeNull();
  });

  it('each call mints a distinct token', async () => {
    await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const a = await createToken(cookie);
    const b = await createToken(cookie);
    expect(a).not.toBe(b);
  });
});

describe('GET /api/share/:token/data', () => {
  it('returns the read-only aggregate with NO auth headers (public read)', async () => {
    const { project, featureA, featureB, doc, release } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(cookie);

    // The GET is intentionally unauthenticated — this is the share page read path.
    const res = await app.request(`/api/share/${token}/data`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.project).toMatchObject({
      id: project.id,
      name: 'ProductMap',
      vision: 'Roadmaps people read',
    });

    expect(data.features).toHaveLength(2);
    // ordered by horizon (now before later)
    expect(data.features[0].id).toBe(featureA.id);
    expect(data.features[1].id).toBe(featureB.id);
    expect(data.features[0].documents).toHaveLength(1);
    expect(data.features[0].documents[0]).toMatchObject({ id: doc.id, title: 'Comments PRD' });
    expect(data.features[1].documents).toEqual([]);
    // vote summary present, anonymous viewer has no myVote
    expect(data.features[0]).toMatchObject({ score: 0, boosts: 0, cools: 0, myVote: 0 });

    expect(data.releases).toHaveLength(1);
    expect(data.releases[0]).toMatchObject({
      id: release.id,
      name: 'v0.2 — Team ready',
      status: 'planned',
      targetDate: '2026-07-01',
    });
  });

  it('404 on unknown token', async () => {
    await seedWorkspace();
    const res = await app.request('/api/share/not-a-real-token/data');
    expect(res.status).toBe(404);
  });

  it('404 after revoke', async () => {
    await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(cookie);

    const del = await app.request(`/api/share/${token}`, {
      method: 'DELETE',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(del.status).toBe(200);

    const res = await app.request(`/api/share/${token}/data`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/share/:token', () => {
  it('revoke without auth cookie → 401', async () => {
    await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(cookie);
    const res = await app.request(`/api/share/${token}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(401);
  });

  it('revokes (sets revoked_at) and 404s on repeat or unknown', async () => {
    await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(cookie);

    const del = await app.request(`/api/share/${token}`, {
      method: 'DELETE',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(del.status).toBe(200);
    const [row] = await db.select().from(shareTokens).where(eq(shareTokens.token, token));
    expect(row.revokedAt).not.toBeNull();

    const again = await app.request(`/api/share/${token}`, {
      method: 'DELETE',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(again.status).toBe(404);

    const unknown = await app.request('/api/share/nope', {
      method: 'DELETE',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(unknown.status).toBe(404);
  });
});
