/**
 * Consolidated cross-project authorization matrix (§13.1).
 *
 * Single source of truth for:
 *   (a) role × action — editor CRUD, viewer read-only (writes 403), member-of-B blocked (404)
 *   (b) path-id IDOR  — member-of-A → 404 accessing B's resources via A's path
 *   (c) body-reference rejection — member-of-A sends B-owned ids in body → 404
 *   (d) super-admin   — passes role×action on both projects but is URL-project-bound
 *
 * DB tests need Postgres → run with dangerouslyDisableSandbox:true.
 */
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
import {
  features,
  ideas,
  releases,
  objectives,
  plans,
  documents,
  decisions,
  comments,
  evidence,
  planEntries,
} from '@productmap/db';

// ─── actors (set per-test in beforeEach) ─────────────────────────────────────
let editorA: { id: string; role: 'admin' | 'member' };
let viewerA: { id: string; role: 'admin' | 'member' };
let memberB: { id: string; role: 'admin' | 'member' };
let superAdmin: { id: string; role: 'admin' | 'member' };

let authEditorA: Record<string, string>;
let authViewerA: Record<string, string>;
let authMemberB: Record<string, string>;
let authAdmin: Record<string, string>;

// ─── projects ────────────────────────────────────────────────────────────────
let projectA: string;
let projectB: string;

// ─── project-A rows (created per beforeEach) ─────────────────────────────────
let featureIdA: string;
let ideaIdA: string;
let releaseIdA: string;
let objectiveIdA: string;
let planIdA: string;
let documentIdA: string;
let decisionIdA: string;
let commentIdA: string; // comment on featureIdA
let evidenceIdA: string;

// ─── project-B rows (created per beforeEach) ─────────────────────────────────
let featureIdB: string;
let ideaIdB: string;
let releaseIdB: string;
let objectiveIdB: string;
let planIdB: string;
let documentIdB: string;
let decisionIdB: string;
let commentIdB: string; // comment on featureIdB

const MISSING = '00000000-0000-4000-8000-000000000000';

// ─── helpers ─────────────────────────────────────────────────────────────────
const hdrs = (auth: Record<string, string>) => ({
  ...auth,
  origin: 'http://localhost',
  host: 'localhost',
});

function get(path: string, auth: Record<string, string>) {
  return app.request(path, { headers: hdrs(auth) });
}
function post(path: string, body: unknown, auth: Record<string, string>) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...hdrs(auth) },
    body: JSON.stringify(body),
  });
}
function patch(path: string, body: unknown, auth: Record<string, string>) {
  return app.request(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...hdrs(auth) },
    body: JSON.stringify(body),
  });
}
function del(path: string, auth: Record<string, string>) {
  return app.request(path, { method: 'DELETE', headers: hdrs(auth) });
}

// ─── test lifecycle ───────────────────────────────────────────────────────────
beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();

  // ── actors
  editorA   = await createTestUser({ role: 'member', email: 'editor-a@test.co', name: 'EditorA' });
  viewerA   = await createTestUser({ role: 'member', email: 'viewer-a@test.co', name: 'ViewerA' });
  memberB   = await createTestUser({ role: 'member', email: 'member-b@test.co', name: 'MemberB' });
  superAdmin = await createTestUser({ role: 'admin',  email: 'admin@test.co',   name: 'Admin' });

  authEditorA = { cookie: await authCookie(editorA) };
  authViewerA = { cookie: await authCookie(viewerA) };
  authMemberB = { cookie: await authCookie(memberB) };
  authAdmin   = { cookie: await authCookie(superAdmin) };

  // ── projects
  const pA = await createTestProject('ProjectA');
  const pB = await createTestProject('ProjectB');
  projectA = pA.id;
  projectB = pB.id;

  // ── memberships
  await addMembership(editorA.id, projectA, 'editor');
  await addMembership(viewerA.id, projectA, 'viewer');
  await addMembership(memberB.id, projectB, 'editor');
  // superAdmin has role:'admin' → super-admin bypass (no membership row needed)

  // ── seed project-A rows
  const [fA] = await db.insert(features)
    .values({ projectId: projectA, title: 'Feature A', horizon: 'now' })
    .returning();
  featureIdA = fA.id;

  const [iA] = await db.insert(ideas)
    .values({ projectId: projectA, title: 'Idea A', bodyMd: 'body', source: 'test' })
    .returning();
  ideaIdA = iA.id;

  const [rA] = await db.insert(releases)
    .values({ projectId: projectA, name: 'Release A', targetDate: '2026-09-01' })
    .returning();
  releaseIdA = rA.id;

  const [oA] = await db.insert(objectives)
    .values({ projectId: projectA, title: 'Objective A' })
    .returning();
  objectiveIdA = oA.id;

  const [plA] = await db.insert(plans)
    .values({ projectId: projectA, name: 'Plan A' })
    .returning();
  planIdA = plA.id;

  const [dA] = await db.insert(documents)
    .values({ projectId: projectA, featureId: featureIdA, type: 'prd', title: 'Doc A' })
    .returning();
  documentIdA = dA.id;

  const [decA] = await db.insert(decisions)
    .values({ projectId: projectA, title: 'Decision A', decisionMd: 'We decided.', alternativesMd: '' })
    .returning();
  decisionIdA = decA.id;

  const [cA] = await db.insert(comments)
    .values({ authorId: editorA.id, featureId: featureIdA, body: 'Comment A' })
    .returning();
  commentIdA = cA.id;

  const [evA] = await db.insert(evidence)
    .values({ featureId: featureIdA, kind: 'quote', title: 'Evidence A' })
    .returning();
  evidenceIdA = evA.id;

  // ── seed project-B rows
  const [fB] = await db.insert(features)
    .values({ projectId: projectB, title: 'Feature B', horizon: 'now' })
    .returning();
  featureIdB = fB.id;

  const [iB] = await db.insert(ideas)
    .values({ projectId: projectB, title: 'Idea B', bodyMd: 'body', source: 'test' })
    .returning();
  ideaIdB = iB.id;

  const [rB] = await db.insert(releases)
    .values({ projectId: projectB, name: 'Release B', targetDate: '2026-10-01' })
    .returning();
  releaseIdB = rB.id;

  const [oB] = await db.insert(objectives)
    .values({ projectId: projectB, title: 'Objective B' })
    .returning();
  objectiveIdB = oB.id;

  const [plB] = await db.insert(plans)
    .values({ projectId: projectB, name: 'Plan B' })
    .returning();
  planIdB = plB.id;

  const [dB] = await db.insert(documents)
    .values({ projectId: projectB, featureId: featureIdB, type: 'prd', title: 'Doc B' })
    .returning();
  documentIdB = dB.id;

  const [decB] = await db.insert(decisions)
    .values({ projectId: projectB, title: 'Decision B', decisionMd: 'We decided.', alternativesMd: '' })
    .returning();
  decisionIdB = decB.id;

  const [cB] = await db.insert(comments)
    .values({ authorId: memberB.id, featureId: featureIdB, body: 'Comment B' })
    .returning();
  commentIdB = cB.id;
});

// ─────────────────────────────────────────────────────────────────────────────
// (a) ROLE × ACTION MATRIX
// ─────────────────────────────────────────────────────────────────────────────
describe('(a) role × action matrix', () => {
  // ── features ──
  describe('features', () => {
    it('editor-of-A: can GET list (200)', async () => {
      const res = await get(`/api/projects/${projectA}/features`, authEditorA);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('editor-of-A: can GET single (200)', async () => {
      const res = await get(`/api/projects/${projectA}/features/${featureIdA}`, authEditorA);
      expect(res.status).toBe(200);
    });

    it('editor-of-A: can CREATE (201)', async () => {
      const res = await post(`/api/projects/${projectA}/features`, { title: 'New feat', horizon: 'now' }, authEditorA);
      expect(res.status).toBe(201);
    });

    it('editor-of-A: can UPDATE (200)', async () => {
      const res = await patch(`/api/projects/${projectA}/features/${featureIdA}`, { title: 'Updated' }, authEditorA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: can GET list (200)', async () => {
      const res = await get(`/api/projects/${projectA}/features`, authViewerA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: can GET single (200)', async () => {
      const res = await get(`/api/projects/${projectA}/features/${featureIdA}`, authViewerA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: create → 403', async () => {
      const res = await post(`/api/projects/${projectA}/features`, { title: 'Nope', horizon: 'now' }, authViewerA);
      expect(res.status).toBe(403);
    });

    it('viewer-of-A: update → 403', async () => {
      const res = await patch(`/api/projects/${projectA}/features/${featureIdA}`, { title: 'Nope' }, authViewerA);
      expect(res.status).toBe(403);
    });

    it('member-of-B: GET list on A → 404', async () => {
      const res = await get(`/api/projects/${projectA}/features`, authMemberB);
      expect(res.status).toBe(404);
    });

    it('member-of-B: GET single on A → 404', async () => {
      const res = await get(`/api/projects/${projectA}/features/${featureIdA}`, authMemberB);
      expect(res.status).toBe(404);
    });

    it('member-of-B: create on A → 404', async () => {
      const res = await post(`/api/projects/${projectA}/features`, { title: 'Nope', horizon: 'now' }, authMemberB);
      expect(res.status).toBe(404);
    });
  });

  // ── ideas ──
  describe('ideas', () => {
    it('editor-of-A: can GET list (200)', async () => {
      const res = await get(`/api/projects/${projectA}/ideas`, authEditorA);
      expect(res.status).toBe(200);
    });

    it('editor-of-A: can CREATE (201)', async () => {
      const res = await post(`/api/projects/${projectA}/ideas`, { title: 'New idea', bodyMd: 'x', source: 'sales' }, authEditorA);
      expect(res.status).toBe(201);
    });

    it('viewer-of-A: can read (200)', async () => {
      const res = await get(`/api/projects/${projectA}/ideas`, authViewerA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: create → 403', async () => {
      const res = await post(`/api/projects/${projectA}/ideas`, { title: 'Nope', bodyMd: 'x', source: 'x' }, authViewerA);
      expect(res.status).toBe(403);
    });

    it('member-of-B: GET list on A → 404', async () => {
      const res = await get(`/api/projects/${projectA}/ideas`, authMemberB);
      expect(res.status).toBe(404);
    });

    it('member-of-B: create on A → 404', async () => {
      const res = await post(`/api/projects/${projectA}/ideas`, { title: 'x', bodyMd: 'x', source: 'x' }, authMemberB);
      expect(res.status).toBe(404);
    });
  });

  // ── releases ──
  describe('releases', () => {
    it('editor-of-A: can GET list (200)', async () => {
      const res = await get(`/api/projects/${projectA}/releases`, authEditorA);
      expect(res.status).toBe(200);
    });

    it('editor-of-A: can CREATE (201)', async () => {
      const res = await post(`/api/projects/${projectA}/releases`, { name: 'v2', targetDate: '2026-12-01' }, authEditorA);
      expect(res.status).toBe(201);
    });

    it('viewer-of-A: can read (200)', async () => {
      const res = await get(`/api/projects/${projectA}/releases`, authViewerA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: create → 403', async () => {
      const res = await post(`/api/projects/${projectA}/releases`, { name: 'nope' }, authViewerA);
      expect(res.status).toBe(403);
    });

    it('member-of-B: GET list on A → 404', async () => {
      const res = await get(`/api/projects/${projectA}/releases`, authMemberB);
      expect(res.status).toBe(404);
    });
  });

  // ── objectives ──
  describe('objectives', () => {
    it('editor-of-A: can GET list (200)', async () => {
      const res = await get(`/api/projects/${projectA}/objectives`, authEditorA);
      expect(res.status).toBe(200);
    });

    it('editor-of-A: can CREATE (201)', async () => {
      const res = await post(`/api/projects/${projectA}/objectives`, { title: 'New obj' }, authEditorA);
      expect(res.status).toBe(201);
    });

    it('viewer-of-A: can read (200)', async () => {
      const res = await get(`/api/projects/${projectA}/objectives`, authViewerA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: create → 403', async () => {
      const res = await post(`/api/projects/${projectA}/objectives`, { title: 'nope' }, authViewerA);
      expect(res.status).toBe(403);
    });

    it('member-of-B: GET list on A → 404', async () => {
      const res = await get(`/api/projects/${projectA}/objectives`, authMemberB);
      expect(res.status).toBe(404);
    });
  });

  // ── plans ──
  describe('plans', () => {
    it('editor-of-A: can GET list (200)', async () => {
      const res = await get(`/api/projects/${projectA}/plans`, authEditorA);
      expect(res.status).toBe(200);
    });

    it('editor-of-A: can CREATE (201)', async () => {
      const res = await post(`/api/projects/${projectA}/plans`, { name: 'New plan', copyFrom: 'current' }, authEditorA);
      expect(res.status).toBe(201);
    });

    it('viewer-of-A: can read (200)', async () => {
      const res = await get(`/api/projects/${projectA}/plans`, authViewerA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: create → 403', async () => {
      const res = await post(`/api/projects/${projectA}/plans`, { name: 'nope', copyFrom: 'current' }, authViewerA);
      expect(res.status).toBe(403);
    });

    it('member-of-B: GET list on A → 404', async () => {
      const res = await get(`/api/projects/${projectA}/plans`, authMemberB);
      expect(res.status).toBe(404);
    });
  });

  // ── documents ──
  describe('documents', () => {
    it('editor-of-A: can GET list (200)', async () => {
      const res = await get(`/api/projects/${projectA}/documents`, authEditorA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: can read (200)', async () => {
      const res = await get(`/api/projects/${projectA}/documents`, authViewerA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: create → 403', async () => {
      const res = await post(`/api/projects/${projectA}/documents`, { featureId: featureIdA, type: 'prd', title: 'x' }, authViewerA);
      expect(res.status).toBe(403);
    });

    it('member-of-B: GET list on A → 404', async () => {
      const res = await get(`/api/projects/${projectA}/documents`, authMemberB);
      expect(res.status).toBe(404);
    });
  });

  // ── decisions ──
  describe('decisions', () => {
    it('editor-of-A: can GET list (200)', async () => {
      const res = await get(`/api/projects/${projectA}/decisions`, authEditorA);
      expect(res.status).toBe(200);
    });

    it('editor-of-A: can CREATE (201)', async () => {
      const res = await post(`/api/projects/${projectA}/decisions`, { title: 'Ship it', decisionMd: 'Yes.' }, authEditorA);
      expect(res.status).toBe(201);
    });

    it('viewer-of-A: can read (200)', async () => {
      const res = await get(`/api/projects/${projectA}/decisions`, authViewerA);
      expect(res.status).toBe(200);
    });

    it('viewer-of-A: create → 403', async () => {
      const res = await post(`/api/projects/${projectA}/decisions`, { title: 'nope', decisionMd: 'no.' }, authViewerA);
      expect(res.status).toBe(403);
    });

    it('member-of-B: GET list on A → 404', async () => {
      const res = await get(`/api/projects/${projectA}/decisions`, authMemberB);
      expect(res.status).toBe(404);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) PATH-ID IDOR
// editor-of-A attempting to access B's resources via /api/projects/A/... → 404
// ─────────────────────────────────────────────────────────────────────────────
describe('(b) path-id IDOR', () => {
  it('features: GET B resource via A path → 404', async () => {
    const res = await get(`/api/projects/${projectA}/features/${featureIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('features: PATCH B resource via A path → 404', async () => {
    const res = await patch(`/api/projects/${projectA}/features/${featureIdB}`, { title: 'hacked' }, authEditorA);
    expect(res.status).toBe(404);
  });

  it('features: DELETE B resource via A path → 404', async () => {
    const res = await del(`/api/projects/${projectA}/features/${featureIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('ideas: GET B resource via A path → 404', async () => {
    const res = await get(`/api/projects/${projectA}/ideas/${ideaIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('ideas: PATCH B resource via A path → 404', async () => {
    const res = await patch(`/api/projects/${projectA}/ideas/${ideaIdB}`, { title: 'hacked' }, authEditorA);
    expect(res.status).toBe(404);
  });

  it('releases: GET B resource via A path → 404', async () => {
    const res = await get(`/api/projects/${projectA}/releases/${releaseIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('releases: PATCH B resource via A path → 404', async () => {
    const res = await patch(`/api/projects/${projectA}/releases/${releaseIdB}`, { name: 'hacked' }, authEditorA);
    expect(res.status).toBe(404);
  });

  it('releases: DELETE B resource via A path → 404', async () => {
    const res = await del(`/api/projects/${projectA}/releases/${releaseIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('objectives: GET B resource via A path → 404', async () => {
    const res = await get(`/api/projects/${projectA}/objectives/${objectiveIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('objectives: PATCH B resource via A path → 404', async () => {
    const res = await patch(`/api/projects/${projectA}/objectives/${objectiveIdB}`, { title: 'hacked' }, authEditorA);
    expect(res.status).toBe(404);
  });

  it('objectives: DELETE B resource via A path → 404', async () => {
    const res = await del(`/api/projects/${projectA}/objectives/${objectiveIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('plans: GET B resource via A path → 404', async () => {
    const res = await get(`/api/projects/${projectA}/plans/${planIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('plans: DELETE B resource via A path → 404', async () => {
    const res = await del(`/api/projects/${projectA}/plans/${planIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('documents: GET B resource via A path → 404', async () => {
    const res = await get(`/api/projects/${projectA}/documents/${documentIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('documents: PATCH B resource via A path → 404', async () => {
    const res = await patch(`/api/projects/${projectA}/documents/${documentIdB}`, { title: 'hacked' }, authEditorA);
    expect(res.status).toBe(404);
  });

  it('documents: DELETE B resource via A path → 404', async () => {
    const res = await del(`/api/projects/${projectA}/documents/${documentIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('decisions: DELETE B resource via A path → 404', async () => {
    const res = await del(`/api/projects/${projectA}/decisions/${decisionIdB}`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('deps: GET dependencies on B feature via A path → 404', async () => {
    const res = await get(`/api/projects/${projectA}/features/${featureIdB}/dependencies`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('deps: PUT dependencies on B feature via A path → 404', async () => {
    const res = await app.request(`/api/projects/${projectA}/features/${featureIdB}/dependencies`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...hdrs(authEditorA) },
      body: JSON.stringify({ blockerIds: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('evidence: GET evidence on B feature via A path → 404', async () => {
    const res = await get(`/api/projects/${projectA}/features/${featureIdB}/evidence`, authEditorA);
    expect(res.status).toBe(404);
  });

  it('plans entries: PUT entry on B plan via A path → 404', async () => {
    // planIdB belongs to projectB; accessing via projectA path must 404
    const res = await app.request(`/api/projects/${projectA}/plans/${planIdB}/entries/${featureIdA}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...hdrs(authEditorA) },
      body: JSON.stringify({ horizon: 'now' }),
    });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) BODY-REFERENCE REJECTION
// editor-of-A sends B-owned ids in request body under A's path → 404
// ─────────────────────────────────────────────────────────────────────────────
describe('(c) body-reference rejection', () => {
  describe('features: objectiveId from B in PATCH body', () => {
    it('→ 404', async () => {
      const res = await patch(
        `/api/projects/${projectA}/features/${featureIdA}`,
        { objectiveId: objectiveIdB },
        authEditorA,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('features: releaseId from B in PATCH body', () => {
    it('→ 404', async () => {
      const res = await patch(
        `/api/projects/${projectA}/features/${featureIdA}`,
        { releaseId: releaseIdB },
        authEditorA,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('deps: blockerIds from B in PUT body', () => {
    it('→ 404', async () => {
      const res = await app.request(`/api/projects/${projectA}/features/${featureIdA}/dependencies`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...hdrs(authEditorA) },
        body: JSON.stringify({ blockerIds: [featureIdB] }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('releases: featureIds from B in PUT body', () => {
    it('→ 404', async () => {
      const res = await app.request(`/api/projects/${projectA}/releases/${releaseIdA}/features`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...hdrs(authEditorA) },
        body: JSON.stringify({ featureIds: [featureIdB] }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('documents: featureId from B in POST body', () => {
    it('→ 404', async () => {
      const res = await post(
        `/api/projects/${projectA}/documents`,
        { featureId: featureIdB, type: 'prd', title: 'Stolen doc' },
        authEditorA,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('comments: featureId from B in POST body', () => {
    it('→ 404', async () => {
      const res = await post(
        `/api/projects/${projectA}/comments`,
        { featureId: featureIdB, body: 'Comment on B via A' },
        authEditorA,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('comments: parentId from B in POST body', () => {
    it('→ 404', async () => {
      // parentId references a comment on B's feature; should fail scope check
      const res = await post(
        `/api/projects/${projectA}/comments`,
        { parentId: commentIdB, body: 'Reply across projects' },
        authEditorA,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('decisions: featureId from B in POST body', () => {
    it('→ 404', async () => {
      const res = await post(
        `/api/projects/${projectA}/decisions`,
        { title: 'Stolen', decisionMd: 'x', featureId: featureIdB },
        authEditorA,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('decisions: sourceCommentId from B in POST body', () => {
    it('→ 404', async () => {
      const res = await post(
        `/api/projects/${projectA}/decisions`,
        { title: 'Stolen', decisionMd: 'x', sourceCommentId: commentIdB },
        authEditorA,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('plans: copyFrom = B plan in POST body', () => {
    it('→ 404', async () => {
      const res = await post(
        `/api/projects/${projectA}/plans`,
        { name: 'Stolen plan', copyFrom: planIdB },
        authEditorA,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('plans entries: B feature as entry in A plan via PUT', () => {
    it('→ 404', async () => {
      // planIdA belongs to A; featureIdB is in B → the featureId path param is B-owned
      const res = await app.request(`/api/projects/${projectA}/plans/${planIdA}/entries/${featureIdB}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...hdrs(authEditorA) },
        body: JSON.stringify({ horizon: 'now' }),
      });
      expect(res.status).toBe(404);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) SUPER-ADMIN
// passes role × action matrix on BOTH projects (effective owner)
// but is still URL-project-bound: sending B-owned ids → 404
// ─────────────────────────────────────────────────────────────────────────────
describe('(d) super-admin', () => {
  describe('effective owner on project A', () => {
    it('can GET features on A (200)', async () => {
      const res = await get(`/api/projects/${projectA}/features`, authAdmin);
      expect(res.status).toBe(200);
    });

    it('can CREATE feature on A (201)', async () => {
      const res = await post(`/api/projects/${projectA}/features`, { title: 'Admin feat', horizon: 'now' }, authAdmin);
      expect(res.status).toBe(201);
    });

    it('can GET ideas on A (200)', async () => {
      const res = await get(`/api/projects/${projectA}/ideas`, authAdmin);
      expect(res.status).toBe(200);
    });

    it('can GET releases on A (200)', async () => {
      const res = await get(`/api/projects/${projectA}/releases`, authAdmin);
      expect(res.status).toBe(200);
    });

    it('can GET objectives on A (200)', async () => {
      const res = await get(`/api/projects/${projectA}/objectives`, authAdmin);
      expect(res.status).toBe(200);
    });

    it('can GET plans on A (200)', async () => {
      const res = await get(`/api/projects/${projectA}/plans`, authAdmin);
      expect(res.status).toBe(200);
    });

    it('can GET documents on A (200)', async () => {
      const res = await get(`/api/projects/${projectA}/documents`, authAdmin);
      expect(res.status).toBe(200);
    });

    it('can GET decisions on A (200)', async () => {
      const res = await get(`/api/projects/${projectA}/decisions`, authAdmin);
      expect(res.status).toBe(200);
    });
  });

  describe('effective owner on project B', () => {
    it('can GET features on B (200)', async () => {
      const res = await get(`/api/projects/${projectB}/features`, authAdmin);
      expect(res.status).toBe(200);
    });

    it('can GET ideas on B (200)', async () => {
      const res = await get(`/api/projects/${projectB}/ideas`, authAdmin);
      expect(res.status).toBe(200);
    });

    it('can GET decisions on B (200)', async () => {
      const res = await get(`/api/projects/${projectB}/decisions`, authAdmin);
      expect(res.status).toBe(200);
    });
  });

  describe('URL-project-bound: super-admin on A path with B body refs → 404', () => {
    it('super-admin PATCH feature on A with objectiveId from B → 404', async () => {
      const res = await patch(
        `/api/projects/${projectA}/features/${featureIdA}`,
        { objectiveId: objectiveIdB },
        authAdmin,
      );
      expect(res.status).toBe(404);
    });

    it('super-admin PATCH feature on A with releaseId from B → 404', async () => {
      const res = await patch(
        `/api/projects/${projectA}/features/${featureIdA}`,
        { releaseId: releaseIdB },
        authAdmin,
      );
      expect(res.status).toBe(404);
    });

    it('super-admin PUT deps on A with B blocker → 404', async () => {
      const res = await app.request(`/api/projects/${projectA}/features/${featureIdA}/dependencies`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...hdrs(authAdmin) },
        body: JSON.stringify({ blockerIds: [featureIdB] }),
      });
      expect(res.status).toBe(404);
    });

    it('super-admin POST decision on A with featureId from B → 404', async () => {
      const res = await post(
        `/api/projects/${projectA}/decisions`,
        { title: 'Admin decision', decisionMd: 'x', featureId: featureIdB },
        authAdmin,
      );
      expect(res.status).toBe(404);
    });

    it('super-admin POST plan on A with copyFrom = B plan → 404', async () => {
      const res = await post(
        `/api/projects/${projectA}/plans`,
        { name: 'Admin plan', copyFrom: planIdB },
        authAdmin,
      );
      expect(res.status).toBe(404);
    });

    it('super-admin POST document on A with featureId from B → 404', async () => {
      const res = await post(
        `/api/projects/${projectA}/documents`,
        { featureId: featureIdB, type: 'prd', title: 'Stolen' },
        authAdmin,
      );
      expect(res.status).toBe(404);
    });

    it('super-admin PUT releases features on A with B featureId → 404', async () => {
      const res = await app.request(`/api/projects/${projectA}/releases/${releaseIdA}/features`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...hdrs(authAdmin) },
        body: JSON.stringify({ featureIds: [featureIdB] }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('path-id IDOR even as super-admin', () => {
    it('super-admin accessing B resource via A path → 404', async () => {
      // Super-admin on A's URL, trying to GET B's feature by B's id
      const res = await get(`/api/projects/${projectA}/features/${featureIdB}`, authAdmin);
      expect(res.status).toBe(404);
    });

    it('super-admin accessing B objective via A path → 404', async () => {
      const res = await get(`/api/projects/${projectA}/objectives/${objectiveIdB}`, authAdmin);
      expect(res.status).toBe(404);
    });

    it('super-admin accessing B decision via A path → 404', async () => {
      const res = await del(`/api/projects/${projectA}/decisions/${decisionIdB}`, authAdmin);
      expect(res.status).toBe(404);
    });
  });
});
