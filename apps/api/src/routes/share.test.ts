import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  setupTestDb,
  truncateAll,
  closeTestDb,
  createTestUser,
  createTestProject,
  addMembership,
  authCookie,
} from '../test/helpers';

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

/**
 * Mint a token via the nested project-scoped route.
 * Requires `cookie` to be an editor/owner or admin on the project.
 */
async function createToken(projectId: string, cookie: string): Promise<string> {
  const res = await app.request(`/api/projects/${projectId}/share/roadmap`, {
    method: 'POST',
    headers: { cookie, origin: 'http://localhost', host: 'localhost' },
  });
  expect(res.status).toBe(201);
  const { url } = await res.json();
  const token = url.split('/').pop() as string;
  return token;
}

describe('POST /api/projects/:projectId/share/roadmap (nested mint)', () => {
  it('mint without auth cookie → 401', async () => {
    const project = await createTestProject();
    const res = await app.request(`/api/projects/${project.id}/share/roadmap`, {
      method: 'POST',
      headers: { origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(401);
  });

  it('mint with admin cookie → 201 and returns a share url with projectId', async () => {
    const { project } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const res = await app.request(`/api/projects/${project.id}/share/roadmap`, {
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
    // Token is scoped to the correct project.
    expect(row.projectId).toBe(project.id);
  });

  it('each call mints a distinct token', async () => {
    const { project } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const a = await createToken(project.id, cookie);
    const b = await createToken(project.id, cookie);
    expect(a).not.toBe(b);
  });

  it('viewer → 403 (method gate: only editors can mint)', async () => {
    const project = await createTestProject();
    const viewer = await createTestUser();
    await addMembership(viewer.id, project.id, 'viewer');
    const cookie = await authCookie(viewer);
    const res = await app.request(`/api/projects/${project.id}/share/roadmap`, {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(403);
  });

  it('non-member → 404 (project scoping)', async () => {
    const project = await createTestProject();
    const outsider = await createTestUser();
    // no membership row
    const cookie = await authCookie(outsider);
    const res = await app.request(`/api/projects/${project.id}/share/roadmap`, {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/share/:token/data — public + project isolation', () => {
  it('returns the read-only aggregate with NO auth headers (public read)', async () => {
    const { project, featureA, featureB, doc, release } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(project.id, cookie);

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

    // The seeded release is 'planned' (forward-looking roadmap data). The
    // changelog renders only shipped releases, so a planned one must never ship
    // in the public payload — even on a default all-on link.
    expect(data.releases.map((r: { id: string }) => r.id)).not.toContain(release.id);
  });

  it('returns ONLY the token project data — second project features and releases are absent (§13.5 isolation)', async () => {
    const { project } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(project.id, cookie);

    // Seed a SECOND project with its own feature and release.
    const [projectB] = await db
      .insert(projects)
      .values({ name: 'Project B', vision: 'Should never appear', aboutMd: '' })
      .returning();
    const [releaseB] = await db
      .insert(releases)
      .values({ projectId: projectB.id, name: 'B-release', targetDate: '2026-08-01' })
      .returning();
    const [featureB2] = await db
      .insert(features)
      .values({ projectId: projectB.id, title: 'B-feature (should not appear)', horizon: 'now' })
      .returning();

    const res = await app.request(`/api/share/${token}/data`);
    expect(res.status).toBe(200);
    const data = await res.json();

    // Project B's feature must NOT appear.
    const featureIds = (data.features as Array<{ id: string }>).map((f) => f.id);
    expect(featureIds).not.toContain(featureB2.id);

    // Project B's release must NOT appear (this was the line-102 unscoped leak).
    const releaseIds = (data.releases as Array<{ id: string }>).map((r) => r.id);
    expect(releaseIds).not.toContain(releaseB.id);
  });

  it('404 on unknown token', async () => {
    await seedWorkspace();
    const res = await app.request('/api/share/not-a-real-token/data');
    expect(res.status).toBe(404);
  });

  it('404 after revoke', async () => {
    const { project } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(project.id, cookie);

    const del = await app.request(`/api/share/${token}`, {
      method: 'DELETE',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(del.status).toBe(200);

    const res = await app.request(`/api/share/${token}/data`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/share/:token (revoke + membership check)', () => {
  it('revoke without auth cookie → 401', async () => {
    const { project } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(project.id, cookie);
    const res = await app.request(`/api/share/${token}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(401);
  });

  it('revokes (sets revoked_at) and 404s on repeat or unknown', async () => {
    const { project } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);
    const token = await createToken(project.id, cookie);

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

  it('member-of-A cannot revoke B project token → 404; token B remains active', async () => {
    // Project A — member will authenticate against this.
    const projectA = await createTestProject('Project A');
    const memberA = await createTestUser();
    await addMembership(memberA.id, projectA.id, 'editor');
    const cookieA = await authCookie(memberA);

    // Project B — token minted by an admin.
    const [projectB] = await db
      .insert(projects)
      .values({ name: 'Project B', aboutMd: '' })
      .returning();
    const admin = await createTestUser({ role: 'admin' });
    const adminCookie = await authCookie(admin);
    const tokenB = await createToken(projectB.id, adminCookie);

    // Member of A tries to revoke B's token — should get 404.
    const res = await app.request(`/api/share/${tokenB}`, {
      method: 'DELETE',
      headers: { cookie: cookieA, origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(404);

    // Token B must still be active (not revoked).
    const [row] = await db.select().from(shareTokens).where(eq(shareTokens.token, tokenB));
    expect(row.revokedAt).toBeNull();
  });

  it('member of the token project can revoke their own project token', async () => {
    const project = await createTestProject();
    const editor = await createTestUser();
    await addMembership(editor.id, project.id, 'editor');
    const cookie = await authCookie(editor);

    // Mint via admin since editor-on-project also satisfies the method gate.
    const admin = await createTestUser({ role: 'admin' });
    const adminCookie = await authCookie(admin);
    const token = await createToken(project.id, adminCookie);

    // Editor (viewer role on same project) also allowed — any membership suffices for revoke.
    const res = await app.request(`/api/share/${token}`, {
      method: 'DELETE',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(shareTokens).where(eq(shareTokens.token, token));
    expect(row.revokedAt).not.toBeNull();
  });

  it('viewer-role member of the token project can revoke → 200', async () => {
    const project = await createTestProject();
    const viewer = await createTestUser();
    await addMembership(viewer.id, project.id, 'viewer');
    const viewerCookie = await authCookie(viewer);

    // Mint via admin.
    const admin = await createTestUser({ role: 'admin' });
    const adminCookie = await authCookie(admin);
    const token = await createToken(project.id, adminCookie);

    // Viewer on the same project can revoke (policy: any membership suffices).
    const res = await app.request(`/api/share/${token}`, {
      method: 'DELETE',
      headers: { cookie: viewerCookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(shareTokens).where(eq(shareTokens.token, token));
    expect(row.revokedAt).not.toBeNull();
  });
});

// --- E1 public-share polish: selective sections + optional expiry ---
const jsonHeaders = (cookie: string) => ({
  cookie,
  origin: 'http://localhost',
  host: 'localhost',
  'content-type': 'application/json',
});

async function mint(projectId: string, cookie: string, body: unknown) {
  return app.request(`/api/projects/${projectId}/share/roadmap`, {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify(body),
  });
}

describe('intake token cannot read roadmap data via share reader', () => {
  it('GET /api/share/<intakeToken>/data → 404 (kind guard)', async () => {
    const { project } = await seedWorkspace();
    const admin = await createTestUser({ role: 'admin' });
    const cookie = await authCookie(admin);

    // Mint an intake token (write-only; must never expose roadmap data).
    const mintRes = await app.request(`/api/projects/${project.id}/share/intake`, {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(mintRes.status).toBe(201);
    const { url: intakeUrl } = await mintRes.json();
    // intakeUrl is /p/<token>/submit — extract the token.
    const intakeToken = intakeUrl.split('/')[2] as string;

    // The share reader must refuse intake tokens — opaque 404, no data leak.
    const res = await app.request(`/api/share/${intakeToken}/data`);
    expect(res.status).toBe(404);
  });
});

describe('share polish — sections + expiry', () => {
  it('persists chosen sections + expiry and echoes them on mint', async () => {
    const { project } = await seedWorkspace();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const res = await mint(project.id, cookie, {
      sections: { roadmap: false, board: false, changelog: true },
      expiresInDays: 7,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sections).toEqual({ roadmap: false, board: false, changelog: true });
    expect(typeof body.expiresAt).toBe('string');

    const token = body.url.split('/').pop();
    const [row] = await db.select().from(shareTokens).where(eq(shareTokens.token, token));
    expect(row.sections).toEqual({ roadmap: false, board: false, changelog: true });
    expect(row.expiresAt).not.toBeNull();
  });

  it('defaults to the legacy all-on, never-expires link when body is empty', async () => {
    const { project } = await seedWorkspace();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const res = await app.request(`/api/projects/${project.id}/share/roadmap`, {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost', host: 'localhost' },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sections).toEqual({ roadmap: true, board: true, changelog: true });
    expect(body.expiresAt).toBeNull();
  });

  it('rejects an all-off sections set → 400', async () => {
    const { project } = await seedWorkspace();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const res = await mint(project.id, cookie, {
      sections: { roadmap: false, board: false, changelog: false },
    });
    expect(res.status).toBe(400);
  });

  it('changelog-only link exposes only shipped-release features, never the roadmap', async () => {
    const project = await createTestProject();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const [shipped] = await db
      .insert(releases)
      .values({ projectId: project.id, name: 'v1', status: 'shipped', shippedAt: new Date() })
      .returning();
    const [shippedFeature] = await db
      .insert(features)
      .values({ projectId: project.id, title: 'Shipped thing', horizon: 'now', releaseId: shipped.id })
      .returning();
    const [futureFeature] = await db
      .insert(features)
      .values({ projectId: project.id, title: 'Secret future', horizon: 'later' })
      .returning();
    // A planned (unshipped) release — forward-looking roadmap, must NOT leak.
    const [plannedRelease] = await db
      .insert(releases)
      .values({ projectId: project.id, name: 'v2 — secret plans', targetDate: '2027-01-01' })
      .returning();

    const res = await mint(project.id, cookie, {
      sections: { roadmap: false, board: false, changelog: true },
    });
    const token = (await res.json()).url.split('/').pop();

    const read = await app.request(`/api/share/${token}/data`);
    expect(read.status).toBe(200);
    const data = await read.json();
    expect(data.sections).toEqual({ roadmap: false, board: false, changelog: true });
    const ids = (data.features as Array<{ id: string }>).map((f) => f.id);
    expect(ids).toContain(shippedFeature.id);
    expect(ids).not.toContain(futureFeature.id);
    // Only the shipped release ships — the planned one stays private.
    const releaseIds = (data.releases as Array<{ id: string }>).map((r) => r.id);
    expect(releaseIds).toEqual([shipped.id]);
    expect(releaseIds).not.toContain(plannedRelease.id);
  });

  it('board-only link keeps features but drops releases (changelog off)', async () => {
    const { project, featureA } = await seedWorkspace();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const res = await mint(project.id, cookie, {
      sections: { roadmap: false, board: true, changelog: false },
    });
    const token = (await res.json()).url.split('/').pop();

    const read = await app.request(`/api/share/${token}/data`);
    const data = await read.json();
    expect((data.features as Array<{ id: string }>).map((f) => f.id)).toContain(featureA.id);
    expect(data.releases).toEqual([]);
  });

  it('board+changelog link (roadmap off) never leaks planned/unshipped releases', async () => {
    const project = await createTestProject();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const [shipped] = await db
      .insert(releases)
      .values({ projectId: project.id, name: 'v1', status: 'shipped', shippedAt: new Date() })
      .returning();
    const [plannedRelease] = await db
      .insert(releases)
      .values({ projectId: project.id, name: 'v2 — secret plans', targetDate: '2027-01-01' })
      .returning();

    const res = await mint(project.id, cookie, {
      sections: { roadmap: false, board: true, changelog: true },
    });
    const token = (await res.json()).url.split('/').pop();

    const read = await app.request(`/api/share/${token}/data`);
    const data = await read.json();
    const releaseIds = (data.releases as Array<{ id: string }>).map((r) => r.id);
    // Roadmap is hidden, so the planned release is forward-looking and must stay private.
    expect(releaseIds).toContain(shipped.id);
    expect(releaseIds).not.toContain(plannedRelease.id);
  });

  it('roadmap+changelog link still never ships planned/unshipped releases', async () => {
    const project = await createTestProject();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const [shipped] = await db
      .insert(releases)
      .values({ projectId: project.id, name: 'v1', status: 'shipped', shippedAt: new Date() })
      .returning();
    const [plannedRelease] = await db
      .insert(releases)
      .values({ projectId: project.id, name: 'v2 — secret plans', targetDate: '2027-01-01' })
      .returning();

    const res = await mint(project.id, cookie, {
      sections: { roadmap: true, board: true, changelog: true },
    });
    const token = (await res.json()).url.split('/').pop();

    const read = await app.request(`/api/share/${token}/data`);
    const data = await read.json();
    const releaseIds = (data.releases as Array<{ id: string }>).map((r) => r.id);
    expect(releaseIds).toEqual([shipped.id]);
    expect(releaseIds).not.toContain(plannedRelease.id);
  });

  it('archived features never surface on a public link', async () => {
    const project = await createTestProject();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const [liveFeature] = await db
      .insert(features)
      .values({ projectId: project.id, title: 'Live feature', horizon: 'now' })
      .returning();
    const [archivedFeature] = await db
      .insert(features)
      .values({ projectId: project.id, title: 'Archived feature', horizon: 'now', archivedAt: new Date() })
      .returning();

    const token = await createToken(project.id, cookie);
    const read = await app.request(`/api/share/${token}/data`);
    const data = await read.json();
    const featureIds = (data.features as Array<{ id: string }>).map((f) => f.id);
    expect(featureIds).toContain(liveFeature.id);
    expect(featureIds).not.toContain(archivedFeature.id);
  });

  it('a non-empty but unparseable body fails closed → 400 (no maximally-public link)', async () => {
    const { project } = await seedWorkspace();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const res = await app.request(`/api/projects/${project.id}/share/roadmap`, {
      method: 'POST',
      headers: jsonHeaders(cookie),
      body: '{ "sections": { "roadmap": fa', // truncated JSON
    });
    expect(res.status).toBe(400);
  });

  it('a still-valid (future) expiry returns 200', async () => {
    const { project } = await seedWorkspace();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const res = await mint(project.id, cookie, {
      sections: { roadmap: true, board: true, changelog: true },
      expiresInDays: 7,
    });
    const token = (await res.json()).url.split('/').pop();
    const read = await app.request(`/api/share/${token}/data`);
    expect(read.status).toBe(200);
  });

  it('404 once the link is past its expiry', async () => {
    const { project } = await seedWorkspace();
    const cookie = await authCookie(await createTestUser({ role: 'admin' }));
    const token = await createToken(project.id, cookie);
    await db
      .update(shareTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(shareTokens.token, token));

    const res = await app.request(`/api/share/${token}/data`);
    expect(res.status).toBe(404);
  });
});
