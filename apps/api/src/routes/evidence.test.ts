import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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
import { features, evidence } from '@productmap/db/schema';
import { eq } from 'drizzle-orm';

let projectId: string;
let userId: string;
let featureId: string;
let auth: Record<string, string> = {};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  // Actor is admin (super-admin → effective owner) — used for happy-path tests
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  userId = actor.id;
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
  const p = await createTestProject('ProductMap');
  projectId = p.id;
  const [f] = await db.insert(features).values({ projectId, title: 'Gantt roadmap', horizon: 'next' }).returning();
  featureId = f.id;
});

const post = (body: unknown, headers = auth) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

describe('POST /api/projects/:projectId/features/:id/evidence', () => {
  it('creates a quote with defaults and creator join (AC2)', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/features/${featureId}/evidence`,
      post({ kind: 'quote', title: 'Customer loves the gantt' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      featureId,
      kind: 'quote',
      title: 'Customer loves the gantt',
      bodyMd: '',
      sourceUrl: '',
      weight: 1,
      createdBy: userId,
      createdByName: 'Corban',
      createdByColor: '#2b557e',
    });
  });

  it('creates a weighted ticket with body and source url (AC2)', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/features/${featureId}/evidence`,
      post({
        kind: 'ticket',
        title: 'Zoom-level complaints',
        bodyMd: '12 tickets ask for week zoom.',
        sourceUrl: 'https://support.example.com/q?tag=gantt',
        weight: 12,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ kind: 'ticket', weight: 12, sourceUrl: 'https://support.example.com/q?tag=gantt' });
  });

  it('404 on unknown feature', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/features/${MISSING_ID}/evidence`,
      post({ kind: 'quote', title: 'x' }),
    );
    expect(res.status).toBe(404);
  });

  it('400 on invalid kind / empty title', async () => {
    const bad = await app.request(
      `/api/projects/${projectId}/features/${featureId}/evidence`,
      post({ kind: 'rumor', title: 'x' }),
    );
    expect(bad.status).toBe(400);
    const empty = await app.request(
      `/api/projects/${projectId}/features/${featureId}/evidence`,
      post({ kind: 'quote', title: '' }),
    );
    expect(empty.status).toBe(400);
  });

  it('viewer write → 403', async () => {
    const viewer = await createTestUser({ role: 'member', email: 'viewer@test.co' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(
      `/api/projects/${projectId}/features/${featureId}/evidence`,
      post({ kind: 'quote', title: 'Test' }, viewerAuth),
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/projects/:projectId/features/:id/evidence', () => {
  it('lists evidence oldest-first with creator names', async () => {
    await app.request(
      `/api/projects/${projectId}/features/${featureId}/evidence`,
      post({ kind: 'quote', title: 'First' }),
    );
    await app.request(
      `/api/projects/${projectId}/features/${featureId}/evidence`,
      post({ kind: 'metric', title: 'Second', weight: 3 }),
    );

    const res = await app.request(
      `/api/projects/${projectId}/features/${featureId}/evidence`,
      { headers: auth },
    );
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { title: string }) => r.title)).toEqual(['First', 'Second']);
    expect(rows[0].createdByName).toBe('Corban');
    expect(rows[1]).toMatchObject({ kind: 'metric', weight: 3 });
  });

  it('404 on unknown feature', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/features/${MISSING_ID}/evidence`,
      { headers: auth },
    );
    expect(res.status).toBe(404);
  });

  it('cross-project GET → 404 (path-id IDOR: B feature via A project)', async () => {
    // Set up project B with its own feature
    const projectB = await createTestProject('Project B');
    const [fB] = await db
      .insert(features)
      .values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' })
      .returning();

    // Editor of A tries to GET B's feature evidence via A's project path
    const editorA = await createTestUser({ role: 'member', email: 'editorA@test.co' });
    await addMembership(editorA.id, projectId, 'editor');
    const editorAAuth = { cookie: await authCookie(editorA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(
      `/api/projects/${projectId}/features/${fB.id}/evidence`,
      { headers: editorAAuth },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:projectId/evidence/:id', () => {
  it('deletes and returns 204 (AC2)', async () => {
    const created = await (
      await app.request(
        `/api/projects/${projectId}/features/${featureId}/evidence`,
        post({ kind: 'quote', title: 'Bye' }),
      )
    ).json();

    const res = await app.request(
      `/api/projects/${projectId}/evidence/${created.id}`,
      { method: 'DELETE', headers: auth },
    );
    expect(res.status).toBe(204);
    const rows = await db.select().from(evidence).where(eq(evidence.id, created.id));
    expect(rows).toHaveLength(0);
  });

  it('404 on unknown id', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/evidence/${MISSING_ID}`,
      { method: 'DELETE', headers: auth },
    );
    expect(res.status).toBe(404);
  });

  it('cross-project DELETE → 404 (member-of-A deletes B evidence via A path)', async () => {
    // Set up project B with its own feature and evidence
    const projectB = await createTestProject('Project B');
    const [fB] = await db
      .insert(features)
      .values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' })
      .returning();
    const [evB] = await db
      .insert(evidence)
      .values({ featureId: fB.id, kind: 'quote', title: 'B Evidence', bodyMd: '', sourceUrl: '', weight: 1 })
      .returning();

    // Editor of A tries to DELETE B's evidence via A's project path
    const editorA = await createTestUser({ role: 'member', email: 'editorA2@test.co' });
    await addMembership(editorA.id, projectId, 'editor');
    const editorAAuth = { cookie: await authCookie(editorA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(
      `/api/projects/${projectId}/evidence/${evB.id}`,
      { method: 'DELETE', headers: editorAAuth },
    );
    expect(res.status).toBe(404);
    // Evidence B must still exist
    const still = await db.select().from(evidence).where(eq(evidence.id, evB.id));
    expect(still).toHaveLength(1);
  });

  it('cross-project POST → 404 (member-of-A posts evidence to B feature via A path)', async () => {
    // Set up project B with its own feature
    const projectB = await createTestProject('Project B');
    const [fB] = await db
      .insert(features)
      .values({ projectId: projectB.id, title: 'B Feature', horizon: 'now' })
      .returning();

    const editorA = await createTestUser({ role: 'member', email: 'editorA3@test.co' });
    await addMembership(editorA.id, projectId, 'editor');
    const editorAAuth = { cookie: await authCookie(editorA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(
      `/api/projects/${projectId}/features/${fB.id}/evidence`,
      post({ kind: 'quote', title: 'Cross-project post' }, editorAAuth),
    );
    expect(res.status).toBe(404);
  });

  it('viewer DELETE /api/projects/A/evidence/:id → 403', async () => {
    // Create evidence as admin
    const created = await (
      await app.request(
        `/api/projects/${projectId}/features/${featureId}/evidence`,
        post({ kind: 'quote', title: 'Evidence to delete' }),
      )
    ).json();

    const viewer = await createTestUser({ role: 'member', email: 'viewer@test.co' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(
      `/api/projects/${projectId}/evidence/${created.id}`,
      { method: 'DELETE', headers: viewerAuth },
    );
    expect(res.status).toBe(403);
    // Evidence must still exist
    const rows = await db.select().from(evidence).where(eq(evidence.id, created.id));
    expect(rows).toHaveLength(1);
  });
});
