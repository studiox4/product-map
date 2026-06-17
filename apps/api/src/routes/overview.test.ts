import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { OverviewResponse, AttentionItem } from '@productmap/shared';
// Importing helpers first sets DATABASE_URL to the TEST_PG_BASE-aware test URL
// (honors a CI Postgres password) before ../db evaluates its pool below.
import { createTestUser, authCookie, setupTestDb } from '../test/helpers';

const { app } = await import('../app');
const { db, pool } = await import('../db');
const { products, features, documents, users, comments, votes } = await import('@productmap/db');

let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await db.execute('truncate table documents, features, products, users cascade' as never);
  const actor = await createTestUser({ role: 'admin' });
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
});

afterAll(async () => {
  await pool.end();
});

async function seedFixture() {
  const [product] = await db
    .insert(products)
    .values({ name: 'ProductMap', vision: 'A vision', aboutMd: 'About' })
    .returning();

  // dated feature with docs (one draft, one in_review) → only doc attention
  const [editor] = await db
    .insert(features)
    .values({
      productId: product.id,
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
      productId: product.id,
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
      productId: product.id,
      title: 'Realtime collaboration',
      horizon: 'later',
      status: 'idea',
      sortOrder: 1,
    })
    .returning();

  const [draftDoc] = await db
    .insert(documents)
    .values({
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
      featureId: editor.id,
      type: 'tech_spec',
      title: 'Editor tech spec',
      status: 'in_review',
      contentJson: { type: 'doc', content: [] },
      contentMd: '',
    })
    .returning();

  await db.insert(documents).values({
    featureId: gantt.id,
    type: 'feature_brief',
    title: 'Gantt brief',
    status: 'final',
    contentJson: { type: 'doc', content: [] },
    contentMd: '',
  });

  return { product, editor, gantt, collab, draftDoc, reviewDoc };
}

describe('GET /api/overview', () => {
  it('returns product, features with nested docs, and attention items', async () => {
    const { product, editor, gantt, collab, draftDoc, reviewDoc } = await seedFixture();
    const res = await app.request('/api/overview', { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as OverviewResponse;

    expect(body.product).toMatchObject({
      id: product.id,
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
    await seedFixture();
    const res = await app.request('/api/overview', { headers: auth });
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
    const { editor, gantt } = await seedFixture();
    const [corban] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
    // Ada is a real auth user so we can read the overview as her via cookie.
    const ada = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co', color: '#3c6b46' });
    const adaAuth = { cookie: await authCookie(ada), origin: 'http://localhost', host: 'localhost' };
    await db.insert(votes).values([
      { userId: corban.id, featureId: editor.id, value: 1 },
      { userId: ada.id, featureId: editor.id, value: 1 },
      { userId: ada.id, featureId: gantt.id, value: -1 },
    ]);

    const res = await app.request('/api/overview', { headers: adaAuth });
    const body = (await res.json()) as OverviewResponse;
    const editorF = body.features.find((f) => f.id === editor.id)!;
    expect(editorF).toMatchObject({ score: 2, boosts: 2, cools: 0, myVote: 1 });
    const ganttF = body.features.find((f) => f.id === gantt.id)!;
    expect(ganttF).toMatchObject({ score: -1, boosts: 0, cools: 1, myVote: -1 });
    const unvoted = body.features.find((f) => f.id !== editor.id && f.id !== gantt.id)!;
    expect(unvoted).toMatchObject({ score: 0, boosts: 0, cools: 0, myVote: 0 });
  });

  it('adds open_comments attention items first, combining feature and doc threads', async () => {
    const { editor, gantt, draftDoc } = await seedFixture();
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

    const res = await app.request('/api/overview', { headers: auth });
    const body = (await res.json()) as OverviewResponse;
    const openItems = body.attention.filter((a) => a.kind === 'open_comments');
    expect(openItems).toEqual([
      { kind: 'open_comments', featureId: editor.id, title: 'Rich markdown editor', count: 2 },
    ]);
    // open_comments sorts above every other kind
    expect(body.attention[0].kind).toBe('open_comments');
  });

  it('404s when no product exists', async () => {
    const res = await app.request('/api/overview', { headers: auth });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });
});
