// Roadmap scenario plans: list/create (snapshot), rename/delete, entry edits
// (plan_entries only — features untouched), and apply (transaction writing
// entries back to features with per-field + plan_applied activity).
// Routes nested under /api/projects/:projectId/plans (Task A7).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq, asc } from 'drizzle-orm';
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
import { features, plans, planEntries, activity } from '@productmap/db';

let projectId: string;
let userId: string;
let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  // Actor IS the Corban user — attribution checks compare against userId
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  userId = actor.id;
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
  const p = await createTestProject('ProductMap');
  projectId = p.id;
});

/** Two scheduled features + one dateless later feature. */
async function seedFeatures(pid: string) {
  const [alpha] = await db
    .insert(features)
    .values({
      projectId: pid,
      title: 'Alpha',
      horizon: 'now',
      startDate: '2026-07-01',
      endDate: '2026-07-21',
    })
    .returning();
  const [beta] = await db
    .insert(features)
    .values({
      projectId: pid,
      title: 'Beta',
      horizon: 'next',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    })
    .returning();
  const [gamma] = await db
    .insert(features)
    .values({ projectId: pid, title: 'Gamma', horizon: 'later' })
    .returning();
  return { alpha, beta, gamma };
}

async function createPlan(name = 'Q4 stretch', copyFrom: string = 'current', pid = projectId) {
  const res = await app.request(`/api/projects/${pid}/plans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ name, copyFrom }),
  });
  return res;
}

describe('GET /api/projects/:projectId/plans', () => {
  it('returns an empty list when no plans exist', async () => {
    const res = await app.request(`/api/projects/${projectId}/plans`, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists plans oldest-first with status and appliedAt', async () => {
    await db.insert(plans).values([
      { projectId, name: 'Q4 stretch', createdBy: userId, createdAt: new Date('2026-06-01T00:00:00Z') },
      { projectId, name: 'Lean cut', createdBy: userId, createdAt: new Date('2026-06-05T00:00:00Z') },
    ]);
    const res = await app.request(`/api/projects/${projectId}/plans`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((p: { name: string }) => p.name)).toEqual(['Q4 stretch', 'Lean cut']);
    expect(body[0]).toMatchObject({ status: 'draft', appliedAt: null, createdBy: userId });
  });
});

describe('POST /api/projects/:projectId/plans (snapshot)', () => {
  it('snapshots every feature dates+horizon into entries (copyFrom current)', async () => {
    const { alpha, beta, gamma } = await seedFeatures(projectId);

    const res = await createPlan('Q4 stretch');
    expect(res.status).toBe(201);
    const plan = await res.json();
    expect(plan).toMatchObject({ name: 'Q4 stretch', status: 'draft', createdBy: userId, appliedAt: null });
    const byFeature = Object.fromEntries(
      plan.entries.map((e: { featureId: string }) => [e.featureId, e]),
    );
    expect(plan.entries).toHaveLength(3);
    expect(byFeature[alpha.id]).toMatchObject({
      startDate: '2026-07-01',
      endDate: '2026-07-21',
      horizon: 'now',
    });
    expect(byFeature[beta.id]).toMatchObject({
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      horizon: 'next',
    });
    expect(byFeature[gamma.id]).toMatchObject({ startDate: null, endDate: null, horizon: 'later' });
  });

  it('snapshots another plan entries (copyFrom planId), not current features', async () => {
    const { alpha } = await seedFeatures(projectId);

    const source = await (await createPlan('Source')).json();
    // Drift the source plan away from the real schedule.
    await app.request(`/api/projects/${projectId}/plans/${source.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-09-01', endDate: '2026-09-30', horizon: 'next' }),
    });

    const copy = await (await createPlan('Copy of source', source.id)).json();
    const entry = copy.entries.find((e: { featureId: string }) => e.featureId === alpha.id);
    expect(entry).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30', horizon: 'next' });
  });

  it('404s when copyFrom references a missing plan', async () => {
    const res = await createPlan('Ghost', '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('400s on a missing name', async () => {
    const res = await app.request(`/api/projects/${projectId}/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects/:projectId/plans/:id', () => {
  it('returns the plan with its entries', async () => {
    await seedFeatures(projectId);
    const plan = await (await createPlan()).json();

    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(plan.id);
    expect(body.entries).toHaveLength(3);
  });

  it('404s on an unknown plan', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/plans/00000000-0000-0000-0000-000000000000`,
      { headers: auth },
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/projects/:projectId/plans/:id', () => {
  it('renames a plan', async () => {
    const plan = await (await createPlan('Old name')).json();
    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'New name' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('New name');
  });

  it('404s on an unknown plan', async () => {
    const res = await app.request(`/api/projects/${projectId}/plans/00000000-0000-0000-0000-000000000000`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/projects/:projectId/plans/:id/entries/:featureId (scenario edit isolation)', () => {
  it('updates the plan entry and leaves the real feature untouched', async () => {
    const { alpha } = await seedFeatures(projectId);
    const plan = await (await createPlan()).json();

    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-08-01', endDate: '2026-08-21', horizon: 'next' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      planId: plan.id,
      featureId: alpha.id,
      startDate: '2026-08-01',
      endDate: '2026-08-21',
      horizon: 'next',
    });

    // The real roadmap is untouched.
    const [feature] = await db.select().from(features).where(eq(features.id, alpha.id));
    expect(feature).toMatchObject({ startDate: '2026-07-01', endDate: '2026-07-21', horizon: 'now' });
    // And no activity was recorded for a scenario-only edit.
    expect(await db.select().from(activity)).toHaveLength(0);
  });

  it('creates an entry for a feature added after the snapshot (tray-drop)', async () => {
    const plan = await (await createPlan()).json();
    const [late] = await db
      .insert(features)
      .values({ projectId, title: 'Latecomer', horizon: 'later' })
      .returning();

    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}/entries/${late.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-10-01', endDate: '2026-10-14', horizon: 'now' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ featureId: late.id, horizon: 'now' });
  });

  it('404s on an unknown plan or feature', async () => {
    const { alpha } = await seedFeatures(projectId);
    const plan = await (await createPlan()).json();

    const badPlan = await app.request(
      `/api/projects/${projectId}/plans/00000000-0000-0000-0000-000000000000/entries/${alpha.id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ horizon: 'now' }),
      },
    );
    expect(badPlan.status).toBe(404);

    const badFeature = await app.request(
      `/api/projects/${projectId}/plans/${plan.id}/entries/00000000-0000-0000-0000-000000000000`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ horizon: 'now' }),
      },
    );
    expect(badFeature.status).toBe(404);
  });

  it('400s on inverted dates', async () => {
    const { alpha } = await seedFeatures(projectId);
    const plan = await (await createPlan()).json();
    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-08-21', endDate: '2026-08-01' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/projects/:projectId/plans/:id/apply', () => {
  it('writes entries to features, returns the diff, and records activity', async () => {
    const { alpha, beta, gamma } = await seedFeatures(projectId);
    const plan = await (await createPlan()).json();

    // Scenario: shift Alpha's dates, move Gamma later→now. Beta untouched.
    await app.request(`/api/projects/${projectId}/plans/${plan.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-08-01', endDate: '2026-08-21' }),
    });
    await app.request(`/api/projects/${projectId}/plans/${plan.id}/entries/${gamma.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ horizon: 'now' }),
    });

    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}/apply`, {
      method: 'POST',
      headers: auth,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toMatchObject({ id: plan.id, status: 'applied' });
    expect(body.plan.appliedAt).not.toBeNull();

    expect(body.changed).toHaveLength(2);
    const byFeature = Object.fromEntries(
      body.changed.map((ch: { featureId: string }) => [ch.featureId, ch]),
    );
    expect(byFeature[alpha.id]).toMatchObject({
      title: 'Alpha',
      fields: {
        startDate: { from: '2026-07-01', to: '2026-08-01' },
        endDate: { from: '2026-07-21', to: '2026-08-21' },
      },
    });
    expect(byFeature[gamma.id]).toMatchObject({
      title: 'Gamma',
      fields: { horizon: { from: 'later', to: 'now' } },
    });

    // Features now reflect the plan.
    const [alphaRow] = await db.select().from(features).where(eq(features.id, alpha.id));
    expect(alphaRow).toMatchObject({ startDate: '2026-08-01', endDate: '2026-08-21', horizon: 'now' });
    const [gammaRow] = await db.select().from(features).where(eq(features.id, gamma.id));
    expect(gammaRow).toMatchObject({ startDate: null, endDate: null, horizon: 'now' });
    const [betaRow] = await db.select().from(features).where(eq(features.id, beta.id));
    expect(betaRow).toMatchObject({ startDate: '2026-08-01', endDate: '2026-08-15', horizon: 'next' });

    // Activity: dates_changed + plan_applied on Alpha, horizon_changed + plan_applied on Gamma.
    const rows = await db.select().from(activity).orderBy(asc(activity.createdAt));
    const forAlpha = rows.filter((r) => r.featureId === alpha.id).map((r) => r.kind).sort();
    const forGamma = rows.filter((r) => r.featureId === gamma.id).map((r) => r.kind).sort();
    expect(forAlpha).toEqual(['dates_changed', 'plan_applied']);
    expect(forGamma).toEqual(['horizon_changed', 'plan_applied']);
    expect(rows.filter((r) => r.featureId === beta.id)).toHaveLength(0);
    const datesRow = rows.find((r) => r.kind === 'dates_changed');
    expect(datesRow?.payload).toEqual({
      from: { startDate: '2026-07-01', endDate: '2026-07-21' },
      to: { startDate: '2026-08-01', endDate: '2026-08-21' },
    });
    const planRow = rows.find((r) => r.kind === 'plan_applied');
    expect(planRow?.payload).toMatchObject({ planId: plan.id, planName: 'Q4 stretch' });
    expect(planRow?.actorId).toBe(userId);
  });

  it('archives previously applied plans when a new one is applied', async () => {
    await seedFeatures(projectId);
    const first = await (await createPlan('First')).json();
    const second = await (await createPlan('Second')).json();

    await app.request(`/api/projects/${projectId}/plans/${first.id}/apply`, { method: 'POST', headers: auth });
    await app.request(`/api/projects/${projectId}/plans/${second.id}/apply`, { method: 'POST', headers: auth });

    const [firstRow] = await db.select().from(plans).where(eq(plans.id, first.id));
    const [secondRow] = await db.select().from(plans).where(eq(plans.id, second.id));
    expect(firstRow.status).toBe('archived');
    expect(secondRow.status).toBe('applied');
  });

  it('double-apply is idempotent: empty diff, no duplicate activity, stays applied', async () => {
    const { alpha } = await seedFeatures(projectId);
    const plan = await (await createPlan()).json();
    await app.request(`/api/projects/${projectId}/plans/${plan.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ horizon: 'later' }),
    });

    const first = await app.request(`/api/projects/${projectId}/plans/${plan.id}/apply`, {
      method: 'POST',
      headers: auth,
    });
    expect((await first.json()).changed).toHaveLength(1);
    const countAfterFirst = (await db.select().from(activity)).length;

    const second = await app.request(`/api/projects/${projectId}/plans/${plan.id}/apply`, {
      method: 'POST',
      headers: auth,
    });
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.changed).toEqual([]);
    expect(body.plan.status).toBe('applied');
    expect((await db.select().from(activity)).length).toBe(countAfterFirst);
  });

  it('404s on an unknown plan', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/plans/00000000-0000-0000-0000-000000000000/apply`,
      { method: 'POST', headers: auth },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:projectId/plans/:id', () => {
  it('deletes the plan and cascades its entries, leaving features intact', async () => {
    const { alpha } = await seedFeatures(projectId);
    const plan = await (await createPlan()).json();
    expect(await db.select().from(planEntries)).toHaveLength(3);

    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}`, {
      method: 'DELETE',
      headers: auth,
    });
    expect(res.status).toBe(204);
    expect(await db.select().from(plans)).toHaveLength(0);
    expect(await db.select().from(planEntries)).toHaveLength(0);
    const [feature] = await db.select().from(features).where(eq(features.id, alpha.id));
    expect(feature).toBeDefined();
  });

  it('404s on an unknown plan', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/plans/00000000-0000-0000-0000-000000000000`,
      { method: 'DELETE', headers: auth },
    );
    expect(res.status).toBe(404);
  });
});

// ---- Cross-project isolation tests (Task A7 new tests) ----
describe('plans cross-project isolation', () => {
  it('member-of-A GET /api/projects/A/plans/:planInB → 404 (path-id IDOR)', async () => {
    const projectB = await createTestProject('Project B');
    const [planInB] = await db
      .insert(plans)
      .values({ projectId: projectB.id, name: 'B Plan' })
      .returning();

    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = {
      cookie: await authCookie(memberA),
      origin: 'http://localhost',
      host: 'localhost',
    };

    const res = await app.request(`/api/projects/${projectId}/plans/${planInB.id}`, {
      headers: memberAAuth,
    });
    expect(res.status).toBe(404);
  });

  it('GET list in A does not include B\'s plans (list isolation)', async () => {
    const projectB = await createTestProject('Project B');
    await db.insert(plans).values({ projectId: projectB.id, name: 'B Plan' });
    await db.insert(plans).values({ projectId, name: 'A Plan' });

    const res = await app.request(`/api/projects/${projectId}/plans`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.map((p: { name: string }) => p.name);
    expect(names).toContain('A Plan');
    expect(names).not.toContain('B Plan');
  });

  it('viewer POST → 403 (write gate)', async () => {
    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = {
      cookie: await authCookie(viewer),
      origin: 'http://localhost',
      host: 'localhost',
    };

    const res = await app.request(`/api/projects/${projectId}/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...viewerAuth },
      body: JSON.stringify({ name: 'Should fail' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('PUT /:id/entries/<B feature> → 404 (entry featureId body-reference IDOR)', async () => {
    // Set up project B with its own feature
    const projectB = await createTestProject('Project B');
    const [bFeature] = await db
      .insert(features)
      .values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' })
      .returning();

    // Create a plan in A
    const plan = await (await createPlan('A Plan')).json();

    // member of A tries to edit an entry using B's feature id
    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = {
      cookie: await authCookie(memberA),
      origin: 'http://localhost',
      host: 'localhost',
    };

    const res = await app.request(
      `/api/projects/${projectId}/plans/${plan.id}/entries/${bFeature.id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...memberAAuth },
        body: JSON.stringify({ horizon: 'next' }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('POST with copyFrom=<B plan> → 404 (body-reference IDOR)', async () => {
    // Set up project B with its own plan
    const projectB = await createTestProject('Project B');
    const [bPlan] = await db
      .insert(plans)
      .values({ projectId: projectB.id, name: 'B Plan' })
      .returning();

    // member of A tries to snapshot from B's plan
    const memberA = await createTestUser({ role: 'member' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = {
      cookie: await authCookie(memberA),
      origin: 'http://localhost',
      host: 'localhost',
    };

    const res = await app.request(`/api/projects/${projectId}/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...memberAAuth },
      body: JSON.stringify({ name: 'Should fail', copyFrom: bPlan.id }),
    });
    expect(res.status).toBe(404);
  });

  it('viewer → 403 on POST /:id/apply', async () => {
    await seedFeatures(projectId);
    const plan = await (await createPlan()).json();

    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}/apply`, {
      method: 'POST',
      headers: viewerAuth,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('viewer → 403 on PUT /:id/entries/:featureId', async () => {
    const { alpha } = await seedFeatures(projectId);
    const plan = await (await createPlan()).json();

    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/plans/${plan.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...viewerAuth },
      body: JSON.stringify({ horizon: 'now' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('non-member GET /api/projects/:projectId/plans → 404', async () => {
    const nonMember = await createTestUser({ role: 'member' });
    const nonMemberAuth = { cookie: await authCookie(nonMember), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${projectId}/plans`, { headers: nonMemberAuth });
    expect(res.status).toBe(404);
  });

  it('applying plan in A does NOT archive applied plan in B (cross-project archive isolation)', async () => {
    // Project B with its own feature and applied plan
    const projectB = await createTestProject('Project B');
    const [bFeature] = await db
      .insert(features)
      .values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' })
      .returning();
    const [bPlan] = await db
      .insert(plans)
      .values({ projectId: projectB.id, name: 'B Plan', status: 'applied' })
      .returning();
    await db.insert(planEntries).values({ planId: bPlan.id, featureId: bFeature.id, horizon: 'now' });

    // Project A: seed, create a plan, and apply it
    await seedFeatures(projectId);
    const aRes = await createPlan('A Plan');
    const aPlan = await aRes.json();

    const applyRes = await app.request(`/api/projects/${projectId}/plans/${aPlan.id}/apply`, {
      method: 'POST',
      headers: auth,
    });
    expect(applyRes.status).toBe(200);

    // B's plan must still be 'applied' — the archive query must be project-scoped
    const [bPlanRow] = await db.select().from(plans).where(eq(plans.id, bPlan.id));
    expect(bPlanRow.status).toBe('applied');
  });
});
