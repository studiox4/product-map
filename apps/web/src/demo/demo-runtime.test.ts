// Proves the full demo loop against the REAL route logic: in-page PGlite +
// real migrations + real seed + real Hono `app` + real auth cookie. Runs in the
// node environment to isolate the DB/route loop; the browser/jsdom WASM path is
// not exercised here (deferred to the Playwright e2e task). PGlite targets
// browsers, so node-vs-jsdom here is a test-isolation choice, not a portability
// concern.
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { enableDemo, demoFetch, getDemoProjectId, DEMO_USER_ID } from './enableDemo';
import { migrationCount } from './migrations';

describe('demo runtime (real app + PGlite)', () => {
  let pid: string;

  beforeAll(async () => {
    await enableDemo();
    pid = getDemoProjectId();
  }, 60_000);

  it('bundled all 16 migration SQL files', () => {
    expect(migrationCount()).toBe(16);
  });

  it('GET features for the seeded project returns a non-empty list', async () => {
    const res = await demoFetch(`/api/projects/${pid}/features`);
    expect(res.status).toBe(200);
    const features = (await res.json()) as Array<{ id: string; title: string }>;
    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
  });

  it('GET overview for the seeded project succeeds', async () => {
    const res = await demoFetch(`/api/projects/${pid}/overview`);
    expect(res.status).toBe(200);
    const overview = (await res.json()) as Record<string, unknown>;
    expect(overview).toBeTruthy();
  });

  it('POST a new feature, then GET shows it (real route + auth + PGlite write)', async () => {
    const create = await demoFetch(`/api/projects/${pid}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Demo-created feature', horizon: 'now' }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; title: string };
    expect(created.id).toBeTruthy();
    expect(created.title).toBe('Demo-created feature');

    const list = await demoFetch(`/api/projects/${pid}/features`);
    expect(list.status).toBe(200);
    const features = (await list.json()) as Array<{ id: string; title: string }>;
    expect(features.some((f) => f.id === created.id)).toBe(true);
  });

  it('POST a comment authored by the demo user (proves the demo-user FK resolves)', async () => {
    // Grab a feature to attach the comment to.
    const list = await demoFetch(`/api/projects/${pid}/features`);
    const features = (await list.json()) as Array<{ id: string }>;
    const featureId = features[0].id;

    const res = await demoFetch(`/api/projects/${pid}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureId, body: 'A demo comment from the tour user.' }),
    });
    expect(res.status).toBe(201);
    const comment = (await res.json()) as { id: string; authorId: string; body: string };
    expect(comment.id).toBeTruthy();
    // The FK resolved to the seeded admin user — the same id our JWT's sub carries.
    expect(comment.authorId).toBe(DEMO_USER_ID);
  });

  it('never returns 401 (the demo auth cookie is accepted)', async () => {
    const list = await demoFetch(`/api/projects/${pid}/features`);
    const features = (await list.json()) as Array<{ id: string }>;
    const featureId = features[0].id;

    const probes = await Promise.all([
      demoFetch(`/api/projects/${pid}/features`),
      demoFetch(`/api/projects/${pid}/overview`),
      demoFetch(`/api/projects/${pid}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId, body: 'auth probe comment' }),
      }),
    ]);
    for (const res of probes) {
      expect(res.status).not.toBe(401);
    }
  });
});
