import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { OverviewResponse, AttentionItem } from '@productmap/shared';
// Importing helpers first sets DATABASE_URL to the TEST_PG_BASE-aware test URL
// (honors a CI Postgres password) before ../db evaluates its pool below.
import {
  createTestUser,
  createTestProject,
  addMembership,
  authCookie,
  setupTestDb,
  truncateAll,
  closeTestDb,
} from '../test/helpers';

const { app } = await import('../app');
const { db, pool } = await import('../db');
const { projects, features, documents, users, comments, votes } = await import('@productmap/db');

let auth: Record<string, string> = {};
let actor: { id: string; role: 'admin' | 'member'; tokenVersion?: number };

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
  actor = await createTestUser({ role: 'admin' });
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
});

afterAll(async () => {
  await closeTestDb();
});

async function seedFixture() {
  const [project] = await db
    .insert(projects)
    .values({ name: 'ProductMap', vision: 'A vision', aboutMd: 'About' })
    .returning();

  // Super-admin actor needs membership for requireMembership to resolve pid
  await addMembership(actor.id, project.id, 'editor');

  // dated feature with docs (one draft, one in_review) → only doc attention
  const [editor] = await db
    .insert(features)
    .values({
      projectId: project.id,
      title: 'Rich markdown editor',
      horizon: 'now',
      status: 'in_progress',
      startDate: '2026-06-01',
      endDate: '2026-06-20',
      sortOrder: 0,
    })
    .returning();

  // dated feature with a final doc → no attention at all
  const [gantt] = await db
    .insert(features)
    .values({
      projectId: project.id,
      title: 'Gantt roadmap',
      horizon: 'next',
      status: 'planned',
      startDate: '2026-07-01',
      endDate: '2026-07-15',
      sortOrder: 0,
    })
    .returning();

  // dateless + docless feature → missing_dates AND no_docs
  const [collab] = await db
    .insert(features)
    .values({
      projectId: project.id,
      title: 'Realtime collaboration',
      horizon: 'later',
      status: 'idea',
      sortOrder: 1,
    })
    .returning();

  const [draftDoc] = await db
    .insert(documents)
    .values({
      projectId: project.id,
      featureId: editor.id,
      type: 'prd',
      title: 'Editor PRD',
      status: 'draft',
      contentJson: { type: 'doc', content: [] },
      contentMd: '',
    })
    .returning();

  const [reviewDoc] = await db
    .insert(documents)
    .values({
      projectId: project.id,
      featureId: editor.id,
      type: 'tech_spec',
      title: 'Editor tech spec',
      status: 'in_review',
      contentJson: { type: 'doc', content: [] },
      contentMd: '',
    })
    .returning();

  await db.insert(documents).values({
    projectId: project.id,
    featureId: gantt.id,
    type: 'feature_brief',
    title: 'Gantt brief',
    status: 'final',
    contentJson: { type: 'doc', content: [] },
    contentMd: '',
  });

  return { project, editor, gantt, collab, draftDoc, reviewDoc };
}

describe('GET /api/projects/:projectId/overview', () => {
  it('returns product, features with nested docs, and attention items', async () => {
    const { project, editor, gantt, collab, draftDoc, reviewDoc } = await seedFixture();
    const res = await app.request(`/api/projects/${project.id}/overview`, { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as OverviewResponse;

    expect(body.project).toMatchObject({
      id: project.id,
      name: 'ProductMap',
      vision: 'A vision',
      aboutMd: 'About',
    });

    expect(body.features).toHaveLength(3);
    // ordered by horizon now, next, later
    expect(body.features.map((f) => f.id)).toEqual([editor.id, gantt.id, collab.id]);

    const editorFeature = body.features[0];
    expect(editorFeature.documents).toHaveLength(2);
    const docIds = editorFeature.documents.map((d) => d.id).sort();
    expect(docIds).toEqual([draftDoc.id, reviewDoc.id].sort());
    // DocumentMeta only — no content fields
    expect(editorFeature.documents[0]).not.toHaveProperty('contentJson');
    expect(editorFeature.documents[0]).not.toHaveProperty('contentMd');
    expect(body.features[2].documents).toEqual([]);

    const attention = body.attention;
    const kinds = attention.map((a) => a.kind);
    expect(kinds).toContain('draft_doc');
    expect(kinds).toContain('in_review_doc');
    expect(kinds).toContain('missing_dates');
    expect(kinds).toContain('no_docs');

    const draft = attention.find((a) => a.kind === 'draft_doc') as Extract<
      AttentionItem,
      { kind: 'draft_doc' | 'in_review_doc' }
    >;
    expect(draft).toMatchObject({
      documentId: draftDoc.id,
      featureId: editor.id,
      title: 'Editor PRD',
      docType: 'prd',
    });

    const review = attention.find((a) => a.kind === 'in_review_doc') as Extract<
      AttentionItem,
      { kind: 'draft_doc' | 'in_review_doc' }
    >;
    expect(review).toMatchObject({
      documentId: reviewDoc.id,
      featureId: editor.id,
      title: 'Editor tech spec',
      docType: 'tech_spec',
    });

    const missing = attention.find((a) => a.kind === 'missing_dates');
    expect(missing).toMatchObject({ featureId: collab.id, title: 'Realtime collaboration' });
    const noDocs = attention.find((a) => a.kind === 'no_docs');
    expect(noDocs).toMatchObject({ featureId: collab.id, title: 'Realtime collaboration' });

    // final docs and fully-dated, doc-bearing features produce no items
    expect(attention.filter((a) => 'documentId' in a)).toHaveLength(2);
    expect(attention).toHaveLength(4);
  });

  it('has no duplicate attention items and orders doc items before feature items', async () => {
    const { project } = await seedFixture();
    const res = await app.request(`/api/projects/${project.id}/overview`, { headers: auth });
    const body = (await res.json()) as OverviewResponse;

    const keys = body.attention.map((a) =>
      'documentId' in a ? `${a.kind}:${a.documentId}` : `${a.kind}:${a.featureId}`,
    );
    expect(new Set(keys).size).toBe(keys.length);

    const firstFeatureItem = body.attention.findIndex((a) => !('documentId' in a));
    const lastDocItem = body.attention
      .map((a, i) => ('documentId' in a ? i : -1))
      .reduce((m, i) => Math.max(m, i), -1);
    expect(lastDocItem).toBeLessThan(firstFeatureItem);
  });

  it('includes vote summaries on features with per-user myVote', async () => {
    const { project, editor, gantt } = await seedFixture();
    const [corban] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
    // Ada is a real auth user so we can read the overview as her via cookie.
    const ada = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co', color: '#3c6b46' });
    await addMembership(ada.id, project.id, 'viewer');
    const adaAuth = { cookie: await authCookie(ada), origin: 'http://localhost', host: 'localhost' };
    await db.insert(votes).values([
      { userId: corban.id, featureId: editor.id, value: 1 },
      { userId: ada.id, featureId: editor.id, value: 1 },
      { userId: ada.id, featureId: gantt.id, value: -1 },
    ]);

    const res = await app.request(`/api/projects/${project.id}/overview`, { headers: adaAuth });
    const body = (await res.json()) as OverviewResponse;
    const editorF = body.features.find((f) => f.id === editor.id)!;
    expect(editorF).toMatchObject({ score: 2, boosts: 2, cools: 0, myVote: 1 });
    const ganttF = body.features.find((f) => f.id === gantt.id)!;
    expect(ganttF).toMatchObject({ score: -1, boosts: 0, cools: 1, myVote: -1 });
    const unvoted = body.features.find((f) => f.id !== editor.id && f.id !== gantt.id)!;
    expect(unvoted).toMatchObject({ score: 0, boosts: 0, cools: 0, myVote: 0 });
  });

  it('adds open_comments attention items first, combining feature and doc threads', async () => {
    const { project, editor, gantt, draftDoc } = await seedFixture();
    const [corban] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();

    // editor: one unresolved doc root (reply must not count) + one unresolved feature root = 2
    const [docRoot] = await db
      .insert(comments)
      .values({ authorId: corban.id, documentId: draftDoc.id, body: 'doc root' })
      .returning();
    await db.insert(comments).values({
      authorId: corban.id,
      documentId: draftDoc.id,
      parentId: docRoot.id,
      body: 'reply',
    });
    await db.insert(comments).values({ authorId: corban.id, featureId: editor.id, body: 'feature root' });
    // gantt: only a resolved root → no item
    await db.insert(comments).values({
      authorId: corban.id,
      featureId: gantt.id,
      body: 'done',
      resolvedAt: new Date(),
      resolvedBy: corban.id,
    });

    const res = await app.request(`/api/projects/${project.id}/overview`, { headers: auth });
    const body = (await res.json()) as OverviewResponse;
    const openItems = body.attention.filter((a) => a.kind === 'open_comments');
    expect(openItems).toEqual([
      { kind: 'open_comments', featureId: editor.id, title: 'Rich markdown editor', count: 2 },
    ]);
    // open_comments sorts above every other kind
    expect(body.attention[0].kind).toBe('open_comments');
  });

  it('404s when no project exists for pid', async () => {
    // Use a random project ID that does not exist (no membership either → 404 from gate)
    const outsider = await createTestUser({ role: 'member' });
    const outsiderAuth = { cookie: await authCookie(outsider), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request('/api/projects/00000000-0000-0000-0000-000000000000/overview', { headers: outsiderAuth });
    expect(res.status).toBe(404);
  });

  it('overview returns only the pid project features (isolation)', async () => {
    const { project, editor } = await seedFixture();

    // Project B with its own feature
    const actorB = await createTestUser({ role: 'admin' });
    const authB = { cookie: await authCookie(actorB), origin: 'http://localhost', host: 'localhost' };
    const [projectB] = await db
      .insert(projects)
      .values({ name: 'Project B', vision: '', aboutMd: '' })
      .returning();
    await addMembership(actorB.id, projectB.id, 'editor');
    await db.insert(features).values({
      projectId: projectB.id,
      title: 'Feature from B',
      horizon: 'now',
    });

    // Project A overview should not include B's features
    const resA = await app.request(`/api/projects/${project.id}/overview`, { headers: auth });
    expect(resA.status).toBe(200);
    const bodyA = (await resA.json()) as OverviewResponse;
    expect(bodyA.features.every((f) => f.projectId === project.id)).toBe(true);
    expect(bodyA.features.some((f) => f.id === editor.id)).toBe(true);

    // Project B overview should not include A's features
    const resB = await app.request(`/api/projects/${projectB.id}/overview`, { headers: authB });
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as OverviewResponse;
    expect(bodyB.features.every((f) => f.projectId === projectB.id)).toBe(true);
    expect(bodyB.features.some((f) => f.id === editor.id)).toBe(false);
  });

  it('viewer GET returns 200 (read allowed)', async () => {
    const { project } = await seedFixture();
    const viewer = await createTestUser({ role: 'member' });
    await addMembership(viewer.id, project.id, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${project.id}/overview`, { headers: viewerAuth });
    expect(res.status).toBe(200);
  });

  it('non-member GET returns 404', async () => {
    const { project } = await seedFixture();
    const outsider = await createTestUser({ role: 'member' });
    const outsiderAuth = { cookie: await authCookie(outsider), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${project.id}/overview`, { headers: outsiderAuth });
    expect(res.status).toBe(404);
  });
});
