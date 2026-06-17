// Roadmap scenario plans: list/create (snapshot), rename/delete, entry edits
// (plan_entries only — features untouched), and apply (transaction writing
// entries back to features with per-field + plan_applied activity).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects, features, plans, planEntries, activity } from '@productmap/db';

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
});

async function seedProject() {
  const [p] = await db.insert(projects).values({ name: 'ProductMap' }).returning();
  return p;
}

/** Two scheduled features + one dateless later feature. */
async function seedFeatures(projectId: string) {
  const [alpha] = await db
    .insert(features)
    .values({
      projectId,
      title: 'Alpha',
      horizon: 'now',
      startDate: '2026-07-01',
      endDate: '2026-07-21',
    })
    .returning();
  const [beta] = await db
    .insert(features)
    .values({
      projectId,
      title: 'Beta',
      horizon: 'next',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    })
    .returning();
  const [gamma] = await db
    .insert(features)
    .values({ projectId, title: 'Gamma', horizon: 'later' })
    .returning();
  return { alpha, beta, gamma };
}

async function createPlan(name = 'Q4 stretch', copyFrom: string = 'current') {
  const res = await app.request('/api/plans', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ name, copyFrom }),
  });
  return res;
}

describe('GET /api/plans', () => {
  it('returns an empty list when no plans exist', async () => {
    const res = await app.request('/api/plans', { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists plans oldest-first with status and appliedAt', async () => {
    await db.insert(plans).values([
      { name: 'Q4 stretch', createdBy: userId, createdAt: new Date('2026-06-01T00:00:00Z') },
      { name: 'Lean cut', createdBy: userId, createdAt: new Date('2026-06-05T00:00:00Z') },
    ]);
    const res = await app.request('/api/plans', { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((p: { name: string }) => p.name)).toEqual(['Q4 stretch', 'Lean cut']);
    expect(body[0]).toMatchObject({ status: 'draft', appliedAt: null, createdBy: userId });
  });
});

describe('POST /api/plans (snapshot)', () => {
  it('snapshots every feature dates+horizon into entries (copyFrom current)', async () => {
    const p = await seedProject();
    const { alpha, beta, gamma } = await seedFeatures(p.id);

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
    const p = await seedProject();
    const { alpha } = await seedFeatures(p.id);

    const source = await (await createPlan('Source')).json();
    // Drift the source plan away from the real schedule.
    await app.request(`/api/plans/${source.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-09-01', endDate: '2026-09-30', horizon: 'next' }),
    });

    const copy = await (await createPlan('Copy of source', source.id)).json();
    const entry = copy.entries.find((e: { featureId: string }) => e.featureId === alpha.id);
    expect(entry).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30', horizon: 'next' });
  });

  it('404s when copyFrom references a missing plan', async () => {
    await seedProject();
    const res = await createPlan('Ghost', '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('400s on a missing name', async () => {
    const res = await app.request('/api/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/plans/:id', () => {
  it('returns the plan with its entries', async () => {
    const p = await seedProject();
    await seedFeatures(p.id);
    const plan = await (await createPlan()).json();

    const res = await app.request(`/api/plans/${plan.id}`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(plan.id);
    expect(body.entries).toHaveLength(3);
  });

  it('404s on an unknown plan', async () => {
    const res = await app.request('/api/plans/00000000-0000-0000-0000-000000000000', { headers: auth });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/plans/:id', () => {
  it('renames a plan', async () => {
    await seedProject();
    const plan = await (await createPlan('Old name')).json();
    const res = await app.request(`/api/plans/${plan.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'New name' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('New name');
  });

  it('404s on an unknown plan', async () => {
    const res = await app.request('/api/plans/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/plans/:id/entries/:featureId (scenario edit isolation)', () => {
  it('updates the plan entry and leaves the real feature untouched', async () => {
    const p = await seedProject();
    const { alpha } = await seedFeatures(p.id);
    const plan = await (await createPlan()).json();

    const res = await app.request(`/api/plans/${plan.id}/entries/${alpha.id}`, {
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
    const p = await seedProject();
    const plan = await (await createPlan()).json();
    const [late] = await db
      .insert(features)
      .values({ projectId: p.id, title: 'Latecomer', horizon: 'later' })
      .returning();

    const res = await app.request(`/api/plans/${plan.id}/entries/${late.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-10-01', endDate: '2026-10-14', horizon: 'now' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ featureId: late.id, horizon: 'now' });
  });

  it('404s on an unknown plan or feature', async () => {
    const p = await seedProject();
    const { alpha } = await seedFeatures(p.id);
    const plan = await (await createPlan()).json();

    const badPlan = await app.request(
      `/api/plans/00000000-0000-0000-0000-000000000000/entries/${alpha.id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ horizon: 'now' }),
      },
    );
    expect(badPlan.status).toBe(404);

    const badFeature = await app.request(
      `/api/plans/${plan.id}/entries/00000000-0000-0000-0000-000000000000`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ horizon: 'now' }),
      },
    );
    expect(badFeature.status).toBe(404);
  });

  it('400s on inverted dates', async () => {
    const p = await seedProject();
    const { alpha } = await seedFeatures(p.id);
    const plan = await (await createPlan()).json();
    const res = await app.request(`/api/plans/${plan.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-08-21', endDate: '2026-08-01' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/plans/:id/apply', () => {
  it('writes entries to features, returns the diff, and records activity', async () => {
    const p = await seedProject();
    const { alpha, beta, gamma } = await seedFeatures(p.id);
    const plan = await (await createPlan()).json();

    // Scenario: shift Alpha's dates, move Gamma later→now. Beta untouched.
    await app.request(`/api/plans/${plan.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ startDate: '2026-08-01', endDate: '2026-08-21' }),
    });
    await app.request(`/api/plans/${plan.id}/entries/${gamma.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ horizon: 'now' }),
    });

    const res = await app.request(`/api/plans/${plan.id}/apply`, { method: 'POST', headers: auth });
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
    const p = await seedProject();
    await seedFeatures(p.id);
    const first = await (await createPlan('First')).json();
    const second = await (await createPlan('Second')).json();

    await app.request(`/api/plans/${first.id}/apply`, { method: 'POST', headers: auth });
    await app.request(`/api/plans/${second.id}/apply`, { method: 'POST', headers: auth });

    const [firstRow] = await db.select().from(plans).where(eq(plans.id, first.id));
    const [secondRow] = await db.select().from(plans).where(eq(plans.id, second.id));
    expect(firstRow.status).toBe('archived');
    expect(secondRow.status).toBe('applied');
  });

  it('double-apply is idempotent: empty diff, no duplicate activity, stays applied', async () => {
    const p = await seedProject();
    const { alpha } = await seedFeatures(p.id);
    const plan = await (await createPlan()).json();
    await app.request(`/api/plans/${plan.id}/entries/${alpha.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ horizon: 'later' }),
    });

    const first = await app.request(`/api/plans/${plan.id}/apply`, { method: 'POST', headers: auth });
    expect((await first.json()).changed).toHaveLength(1);
    const countAfterFirst = (await db.select().from(activity)).length;

    const second = await app.request(`/api/plans/${plan.id}/apply`, { method: 'POST', headers: auth });
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.changed).toEqual([]);
    expect(body.plan.status).toBe('applied');
    expect((await db.select().from(activity)).length).toBe(countAfterFirst);
  });

  it('404s on an unknown plan', async () => {
    const res = await app.request('/api/plans/00000000-0000-0000-0000-000000000000/apply', {
      method: 'POST',
      headers: auth,
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/plans/:id', () => {
  it('deletes the plan and cascades its entries, leaving features intact', async () => {
    const p = await seedProject();
    const { alpha } = await seedFeatures(p.id);
    const plan = await (await createPlan()).json();
    expect(await db.select().from(planEntries)).toHaveLength(3);

    const res = await app.request(`/api/plans/${plan.id}`, { method: 'DELETE', headers: auth });
    expect(res.status).toBe(204);
    expect(await db.select().from(plans)).toHaveLength(0);
    expect(await db.select().from(planEntries)).toHaveLength(0);
    const [feature] = await db.select().from(features).where(eq(features.id, alpha.id));
    expect(feature).toBeDefined();
  });

  it('404s on an unknown plan', async () => {
    const res = await app.request('/api/plans/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers: auth,
    });
    expect(res.status).toBe(404);
  });
});
