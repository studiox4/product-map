// Integration tests for GET /api/dashboard (user-scoped, cross-project home).
// helpers must be imported before ../app so DATABASE_URL points at the test DB.
import {
  setupTestDb,
  truncateAll,
  closeTestDb,
  createTestUser,
  authCookie,
  addMembership,
} from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import {
  projects,
  features,
  documents,
  comments,
  activity,
  releases,
  featureCollaborators,
  projectFavorites,
} from '@productmap/db/schema';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function makeProject(name: string, slug: string) {
  const [p] = await db.insert(projects).values({ name, slug }).returning();
  return p;
}
async function makeFeature(projectId: string, title: string, extra: Record<string, unknown> = {}) {
  const [f] = await db
    .insert(features)
    .values({ projectId, title, horizon: 'now', ...extra })
    .returning();
  return f;
}

beforeAll(setupTestDb);
afterAll(closeTestDb);
beforeEach(truncateAll);

describe('GET /api/dashboard — isolation (goal #1)', () => {
  it('returns only the caller’s member/favorited projects — zero leakage from B across all four sections', async () => {
    // User U is a member of project A only.
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };
    const ownerB = await createTestUser({ role: 'member' });

    const A = await makeProject('Alpha', 'alpha');
    const B = await makeProject('Bravo', 'bravo');
    await addMembership(u.id, A.id, 'editor');
    await addMembership(ownerB.id, B.id, 'owner');

    // Project A data the caller is involved in.
    const fA = await makeFeature(A.id, 'A feature', { startDate: null, endDate: null });
    await db.insert(featureCollaborators).values({ featureId: fA.id, userId: u.id });
    const [docA] = await db
      .insert(documents)
      .values({ projectId: A.id, featureId: fA.id, type: 'prd', title: 'A doc', status: 'in_review', createdBy: u.id })
      .returning();
    await db.insert(comments).values({ authorId: u.id, featureId: fA.id, body: 'open thread A' });
    await db.insert(activity).values({ featureId: fA.id, projectId: A.id, actorId: u.id, kind: 'feature_created', payload: { to: 'A feature' } });

    // Project B data — caller is NOT a member, must never surface.
    const fB = await makeFeature(B.id, 'B feature', { startDate: null, endDate: null });
    await db.insert(featureCollaborators).values({ featureId: fB.id, userId: ownerB.id });
    await db
      .insert(documents)
      .values({ projectId: B.id, featureId: fB.id, type: 'prd', title: 'B doc', status: 'in_review', createdBy: ownerB.id });
    await db.insert(comments).values({ authorId: ownerB.id, featureId: fB.id, body: 'open thread B' });
    await db.insert(activity).values({ featureId: fB.id, projectId: B.id, actorId: ownerB.id, kind: 'feature_created', payload: { to: 'B feature' } });

    const res = await app.request('/api/dashboard', { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();

    // One explicit assertion per section: B never appears.
    expect(body.projects.every((p: { id: string }) => p.id !== B.id)).toBe(true);
    expect(body.nextActions.every((n: { projectId: string }) => n.projectId !== B.id)).toBe(true);
    expect(body.myWork.every((w: { projectId: string }) => w.projectId !== B.id)).toBe(true);
    expect(body.activity.every((a: { projectId: string }) => a.projectId !== B.id)).toBe(true);

    // And A is present.
    expect(body.projects.map((p: { id: string }) => p.id)).toContain(A.id);
  });
});

describe('GET /api/dashboard — content', () => {
  it('includes favorited (non-member) projects and sorts favorites first', async () => {
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };

    // Member of Zeta (sorts last alphabetically), favorite-only of Beta.
    const zeta = await makeProject('Zeta', 'zeta');
    const beta = await makeProject('Beta', 'beta');
    await addMembership(u.id, zeta.id, 'editor');
    await db.insert(projectFavorites).values({ userId: u.id, projectId: beta.id });

    const res = await app.request('/api/dashboard', { headers: auth });
    const body = await res.json();
    const ids = body.projects.map((p: { id: string }) => p.id);
    expect(new Set(ids)).toEqual(new Set([zeta.id, beta.id]));
    // Beta is favorited → sorts before Zeta despite alphabetical order.
    expect(ids[0]).toBe(beta.id);
    const betaCard = body.projects.find((p: { id: string }) => p.id === beta.id);
    expect(betaCard.favorite).toBe(true);
    const zetaCard = body.projects.find((p: { id: string }) => p.id === zeta.id);
    expect(zetaCard.favorite).toBe(false);
  });

  it('computes status counts, nextRelease, and staleCount per project', async () => {
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };
    const A = await makeProject('Alpha', 'alpha');
    await addMembership(u.id, A.id, 'owner');

    await makeFeature(A.id, 'idea1', { status: 'idea' });
    await makeFeature(A.id, 'shipped1', { status: 'shipped' });
    // overdue + not shipped → stale
    await makeFeature(A.id, 'overdue', { status: 'in_progress', endDate: daysFromNow(-3) });
    // overdue but shipped → NOT stale
    await makeFeature(A.id, 'old shipped', { status: 'shipped', endDate: daysFromNow(-10) });
    await db.insert(releases).values([
      { projectId: A.id, name: 'R1', targetDate: daysFromNow(30), status: 'planned' },
      { projectId: A.id, name: 'R0-old', targetDate: daysFromNow(-30), status: 'shipped' },
    ]);

    const res = await app.request('/api/dashboard', { headers: auth });
    const body = await res.json();
    const card = body.projects.find((p: { id: string }) => p.id === A.id);
    expect(card.role).toBe('owner');
    expect(card.counts).toEqual({ idea: 1, planned: 0, in_progress: 1, shipped: 2 });
    expect(card.staleCount).toBe(1);
    expect(card.nextRelease).not.toBeNull();
    expect(card.nextRelease.name).toBe('R1');
  });

  it('nextActions includes in_review docs but NOT draft docs', async () => {
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };
    const A = await makeProject('Alpha', 'alpha');
    await addMembership(u.id, A.id, 'editor');
    const f = await makeFeature(A.id, 'F', { startDate: daysFromNow(1), endDate: daysFromNow(5) });

    const [reviewDoc] = await db
      .insert(documents)
      .values({ projectId: A.id, featureId: f.id, type: 'prd', title: 'Review me', status: 'in_review', createdBy: u.id })
      .returning();
    await db
      .insert(documents)
      .values({ projectId: A.id, featureId: f.id, type: 'brd', title: 'Draft only', status: 'draft', createdBy: u.id });

    const res = await app.request('/api/dashboard', { headers: auth });
    const body = await res.json();
    const docActions = body.nextActions.filter((n: { kind: string }) => n.kind === 'doc_in_review');
    expect(docActions.map((d: { documentId: string }) => d.documentId)).toEqual([reviewDoc.id]);
    // No draft leaked as an action of any kind.
    expect(body.nextActions.some((n: { title?: string }) => n.title === 'Draft only')).toBe(false);
  });

  it('nextActions includes open comments and features missing dates for collaborated work', async () => {
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };
    const A = await makeProject('Alpha', 'alpha');
    await addMembership(u.id, A.id, 'editor');
    const f = await makeFeature(A.id, 'Dateless', { startDate: null, endDate: null });
    await db.insert(featureCollaborators).values({ featureId: f.id, userId: u.id });
    await db.insert(comments).values({ authorId: u.id, featureId: f.id, body: 'unresolved' });

    const res = await app.request('/api/dashboard', { headers: auth });
    const body = await res.json();
    expect(body.nextActions.some((n: { kind: string }) => n.kind === 'feature_missing_dates')).toBe(true);
    expect(body.nextActions.some((n: { kind: string }) => n.kind === 'open_comment')).toBe(true);
    // Every action carries a projectSlug for deep-linking.
    expect(body.nextActions.every((n: { projectSlug: string }) => n.projectSlug === 'alpha')).toBe(true);
  });

  it('myWork lists features the caller collaborates on with slug/status/horizon', async () => {
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };
    const A = await makeProject('Alpha', 'alpha');
    await addMembership(u.id, A.id, 'editor');
    const f = await makeFeature(A.id, 'Mine', { status: 'in_progress', horizon: 'next' });
    await db.insert(featureCollaborators).values({ featureId: f.id, userId: u.id });
    // A feature the user does NOT collaborate on must not appear.
    await makeFeature(A.id, 'NotMine');

    const res = await app.request('/api/dashboard', { headers: auth });
    const body = await res.json();
    expect(body.myWork).toHaveLength(1);
    expect(body.myWork[0]).toMatchObject({
      featureId: f.id,
      projectId: A.id,
      projectSlug: 'alpha',
      title: 'Mine',
      status: 'in_progress',
      horizon: 'next',
    });
  });

  it('activity is cross-project, newest first, with project slug joined', async () => {
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };
    const A = await makeProject('Alpha', 'alpha');
    const B = await makeProject('Beta', 'beta');
    await addMembership(u.id, A.id, 'editor');
    await db.insert(projectFavorites).values({ userId: u.id, projectId: B.id });
    const fA = await makeFeature(A.id, 'fa');
    const fB = await makeFeature(B.id, 'fb');
    await db.insert(activity).values({
      featureId: fA.id, projectId: A.id, actorId: u.id, kind: 'feature_created',
      payload: { to: 'fa' }, createdAt: new Date(Date.now() - 60_000),
    });
    await db.insert(activity).values({
      featureId: fB.id, projectId: B.id, actorId: u.id, kind: 'feature_created',
      payload: { to: 'fb' }, createdAt: new Date(),
    });

    const res = await app.request('/api/dashboard', { headers: auth });
    const body = await res.json();
    expect(body.activity).toHaveLength(2);
    // newest first → B's activity leads.
    expect(body.activity[0].projectId).toBe(B.id);
    expect(body.activity[0].projectSlug).toBe('beta');
    expect(body.activity[0].featureTitle).toBe('fb');
    expect(body.activity[0].actorName).toBe(u.name);
  });

  it('returns an empty payload for a user with no projects', async () => {
    const u = await createTestUser({ role: 'member' });
    const auth = { cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request('/api/dashboard', { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [], nextActions: [], myWork: [], activity: [] });
  });
});
