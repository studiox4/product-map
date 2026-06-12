import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { products, features, users, documents, releases, activity, templates } from '@productmap/db';
import { markdownToTiptap } from '../lib/markdown';
import { asc, eq } from 'drizzle-orm';

let productId: string;
let userId: string;
let releaseId: string;
let featureA: string;
let featureB: string;

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const [p] = await db.insert(products).values({ name: 'ProductMap', vision: 'v', aboutMd: '' }).returning();
  productId = p.id;
  const [u] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
  userId = u.id;
  const [r] = await db
    .insert(releases)
    .values({ name: 'v0.2 — Team ready', targetDate: '2026-07-01' })
    .returning();
  releaseId = r.id;
  const [a] = await db
    .insert(features)
    .values({ productId, title: 'Comments & review', horizon: 'now', releaseId, sortOrder: 0 })
    .returning();
  featureA = a.id;
  const [b] = await db
    .insert(features)
    .values({ productId, title: 'Voting', horizon: 'now', releaseId, sortOrder: 1 })
    .returning();
  featureB = b.id;
});

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('releases CRUD', () => {
  it('lists releases with featureCount', async () => {
    const res = await app.request('/api/releases');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: releaseId, name: 'v0.2 — Team ready', status: 'planned', featureCount: 2 });
  });

  it('creates a release with 201', async () => {
    const res = await app.request('/api/releases', json('POST', { name: 'v0.3', targetDate: '2026-09-01' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ name: 'v0.3', targetDate: '2026-09-01', status: 'planned', shippedAt: null });
  });

  it('400s on invalid create body', async () => {
    const res = await app.request('/api/releases', json('POST', { name: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('gets a release with its features', async () => {
    const res = await app.request(`/api/releases/${releaseId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('v0.2 — Team ready');
    expect(body.features.map((f: { id: string }) => f.id)).toEqual([featureA, featureB]);
  });

  // dream-tier-2: notes_md became a full release_notes doc (notes_doc_id), so
  // PATCH covers name/targetDate here; status transitions land with the
  // releases agent.
  it('patches a release', async () => {
    const res = await app.request(`/api/releases/${releaseId}`, json('PATCH', { name: 'v0.2.1', targetDate: '2026-08-01' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'v0.2.1', targetDate: '2026-08-01' });
  });

  it('deletes a release and nulls feature linkage', async () => {
    const res = await app.request(`/api/releases/${releaseId}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    const [f] = await db.select().from(features).where(eq(features.id, featureA));
    expect(f.releaseId).toBeNull();
  });

  it('404s on unknown release for get/patch/delete', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await app.request(`/api/releases/${missing}`)).status).toBe(404);
    expect((await app.request(`/api/releases/${missing}`, json('PATCH', { name: 'x' }))).status).toBe(404);
    expect((await app.request(`/api/releases/${missing}`, { method: 'DELETE' })).status).toBe(404);
  });
});

// dream-tier-2: status moves both ways via PATCH; activity kind is now
// release_status_changed (from,to) — the old release_shipped expectations here
// were updated intentionally per the dream-tier-2 spec.
describe('PATCH /api/releases/:id status transitions', () => {
  it('planned→shipped sets shippedAt and records release_status_changed on each feature', async () => {
    const res = await app.request(`/api/releases/${releaseId}`, json('PATCH', { status: 'shipped' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('shipped');
    expect(body.shippedAt).not.toBeNull();

    const acts = await db.select().from(activity).orderBy(asc(activity.createdAt));
    expect(acts).toHaveLength(2);
    expect(acts.map((a) => a.featureId).sort()).toEqual([featureA, featureB].sort());
    for (const act of acts) {
      expect(act.kind).toBe('release_status_changed');
      expect(act.actorId).toBe(userId);
      expect(act.payload).toMatchObject({
        releaseId,
        releaseName: 'v0.2 — Team ready',
        from: 'planned',
        to: 'shipped',
      });
    }
  });

  it('round-trips: shipped→planned clears shippedAt and records the reverse transition', async () => {
    await app.request(`/api/releases/${releaseId}`, json('PATCH', { status: 'shipped' }));
    const res = await app.request(`/api/releases/${releaseId}`, json('PATCH', { status: 'planned' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('planned');
    expect(body.shippedAt).toBeNull();

    const acts = await db.select().from(activity).orderBy(asc(activity.createdAt));
    expect(acts).toHaveLength(4);
    const reverse = acts.slice(2);
    for (const act of reverse) {
      expect(act.kind).toBe('release_status_changed');
      expect(act.payload).toMatchObject({ from: 'shipped', to: 'planned' });
    }
  });

  it('same-status PATCH is a no-op for shippedAt and activity', async () => {
    await app.request(`/api/releases/${releaseId}`, json('PATCH', { status: 'shipped' }));
    const [before] = await db.select().from(releases).where(eq(releases.id, releaseId));
    const res = await app.request(`/api/releases/${releaseId}`, json('PATCH', { status: 'shipped' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('shipped');
    expect(new Date(body.shippedAt).getTime()).toBe(before.shippedAt!.getTime());
    expect(await db.select().from(activity)).toHaveLength(2);
  });

  it('renaming alongside a status change applies both', async () => {
    const res = await app.request(`/api/releases/${releaseId}`, json('PATCH', { name: 'v0.2 GA', status: 'shipped' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'v0.2 GA', status: 'shipped' });
    const acts = await db.select().from(activity);
    expect(acts[0]!.payload).toMatchObject({ releaseName: 'v0.2 GA' });
  });
});

describe('POST /api/releases/:id/ship (alias of PATCH status)', () => {
  it('ships the release and records release_status_changed activity on each feature', async () => {
    const res = await app.request(`/api/releases/${releaseId}/ship`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('shipped');
    expect(body.shippedAt).not.toBeNull();

    const acts = await db.select().from(activity).orderBy(asc(activity.createdAt));
    expect(acts).toHaveLength(2);
    expect(acts.map((a) => a.featureId).sort()).toEqual([featureA, featureB].sort());
    for (const act of acts) {
      expect(act.kind).toBe('release_status_changed');
      expect(act.actorId).toBe(userId);
      expect(act.payload).toMatchObject({ releaseId, releaseName: 'v0.2 — Team ready', from: 'planned', to: 'shipped' });
    }
  });

  it('is idempotent: shipping twice logs no duplicate activity', async () => {
    await app.request(`/api/releases/${releaseId}/ship`, { method: 'POST' });
    const res = await app.request(`/api/releases/${releaseId}/ship`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('shipped');
    const acts = await db.select().from(activity);
    expect(acts).toHaveLength(2);
  });

  it('404s on unknown release', async () => {
    const res = await app.request('/api/releases/00000000-0000-4000-8000-000000000000/ship', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/releases/:id/notes-doc', () => {
  beforeEach(async () => {
    await db.insert(templates).values({
      type: 'release_notes',
      name: 'Release notes',
      bodyMd: '# {{title}}\n\n## Highlights\n\n## What’s new\n\n## Improvements\n\n## Fixes\n\n## Thanks',
      bodyJson: markdownToTiptap('# {{title}}\n\n## Highlights\n\n## What’s new\n\n## Improvements\n\n## Fixes\n\n## Thanks'),
      isDefault: true,
    });
  });

  it('creates a release_notes doc from the default template and links notesDocId', async () => {
    const res = await app.request(`/api/releases/${releaseId}/notes-doc`, { method: 'POST' });
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc).toMatchObject({
      type: 'release_notes',
      title: 'v0.2 — Team ready',
      featureId: null,
      ideaId: null,
      status: 'draft',
    });
    expect(doc.contentMd).toContain('# v0.2 — Team ready');
    expect(doc.contentMd).toContain('## Highlights');
    expect(doc.contentJson.content.length).toBeGreaterThan(0);

    const [release] = await db.select().from(releases).where(eq(releases.id, releaseId));
    expect(release.notesDocId).toBe(doc.id);
  });

  it('returns the existing doc (200) when one is already linked', async () => {
    const first = await (await app.request(`/api/releases/${releaseId}/notes-doc`, { method: 'POST' })).json();
    const res = await app.request(`/api/releases/${releaseId}/notes-doc`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(first.id);
    const docs = await db.select().from(documents);
    expect(docs).toHaveLength(1);
  });

  it('creates a blank doc when no default template exists', async () => {
    await db.delete(templates);
    const res = await app.request(`/api/releases/${releaseId}/notes-doc`, { method: 'POST' });
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc.contentMd).toBe('');
    expect(doc.contentJson).toEqual({ type: 'doc', content: [] });
  });

  it('404s on unknown release', async () => {
    const res = await app.request('/api/releases/00000000-0000-4000-8000-000000000000/notes-doc', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/releases/:id/generate-notes', () => {
  beforeEach(async () => {
    await db.insert(documents).values([
      {
        featureId: featureA,
        type: 'prd',
        title: 'Comments PRD',
        status: 'final',
        contentMd: 'Threaded comments on features and docs.\n\nSecond paragraph that must not appear.',
      },
      {
        featureId: featureA,
        type: 'brd',
        title: 'Draft note',
        status: 'draft',
        contentMd: 'Draft content must be excluded.',
      },
      {
        featureId: featureB,
        type: 'prd',
        title: 'Voting PRD',
        status: 'final',
        contentMd: 'Up/down votes with per-user toggles.',
      },
    ]);
  });

  it('overwrites the notes doc with markdown assembled from member features + final docs', async () => {
    const created = await (await app.request(`/api/releases/${releaseId}/notes-doc`, { method: 'POST' })).json();
    const res = await app.request(`/api/releases/${releaseId}/generate-notes`, { method: 'POST' });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.id).toBe(created.id);
    expect(doc.contentMd).toContain('## Comments & review\n\nThreaded comments on features and docs.');
    expect(doc.contentMd).toContain('## Voting\n\nUp/down votes with per-user toggles.');
    expect(doc.contentMd).not.toContain('Second paragraph that must not appear');
    expect(doc.contentMd).not.toContain('Draft content must be excluded');
    // feature order follows sortOrder
    expect(doc.contentMd.indexOf('## Comments & review')).toBeLessThan(doc.contentMd.indexOf('## Voting'));
    // contentJson went through the markdown→tiptap pipeline (headings present)
    const headings = (doc.contentJson.content as { type: string }[]).filter((n) => n.type === 'heading');
    expect(headings.length).toBeGreaterThanOrEqual(2);
    // persisted, not just returned
    const [row] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(row.contentMd).toBe(doc.contentMd);
  });

  it('creates the notes doc first when none exists', async () => {
    const res = await app.request(`/api/releases/${releaseId}/generate-notes`, { method: 'POST' });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.type).toBe('release_notes');
    expect(doc.contentMd).toContain('## Comments & review');
    const [release] = await db.select().from(releases).where(eq(releases.id, releaseId));
    expect(release.notesDocId).toBe(doc.id);
  });

  it('404s on unknown release', async () => {
    const res = await app.request('/api/releases/00000000-0000-4000-8000-000000000000/generate-notes', {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/releases/:id/features (replace-set membership)', () => {
  let featureC: string;
  let otherReleaseId: string;

  beforeEach(async () => {
    const [r2] = await db.insert(releases).values({ name: 'v0.3' }).returning();
    otherReleaseId = r2.id;
    const [cRow] = await db
      .insert(features)
      .values({ productId, title: 'Templates', horizon: 'next', releaseId: otherReleaseId, sortOrder: 2 })
      .returning();
    featureC = cRow.id;
  });

  it('replaces the member set: removed features are cleared, new ones assigned', async () => {
    const res = await app.request(`/api/releases/${releaseId}/features`, json('PUT', { featureIds: [featureA] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.features.map((f: { id: string }) => f.id)).toEqual([featureA]);
    const [b] = await db.select().from(features).where(eq(features.id, featureB));
    expect(b.releaseId).toBeNull();
  });

  it('steals a feature already assigned to another release', async () => {
    const res = await app.request(
      `/api/releases/${releaseId}/features`,
      json('PUT', { featureIds: [featureA, featureB, featureC] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.features.map((f: { id: string }) => f.id)).toEqual([featureA, featureB, featureC]);
    const [c2] = await db.select().from(features).where(eq(features.id, featureC));
    expect(c2.releaseId).toBe(releaseId);
    // the other release no longer owns it
    const other = await db.select().from(features).where(eq(features.releaseId, otherReleaseId));
    expect(other).toHaveLength(0);
  });

  it('empty list clears all membership', async () => {
    const res = await app.request(`/api/releases/${releaseId}/features`, json('PUT', { featureIds: [] }));
    expect(res.status).toBe(200);
    expect((await res.json()).features).toEqual([]);
    const members = await db.select().from(features).where(eq(features.releaseId, releaseId));
    expect(members).toHaveLength(0);
  });

  it('404s when a feature id does not exist', async () => {
    const res = await app.request(
      `/api/releases/${releaseId}/features`,
      json('PUT', { featureIds: ['00000000-0000-4000-8000-000000000000'] }),
    );
    expect(res.status).toBe(404);
    // membership untouched on failure
    const members = await db.select().from(features).where(eq(features.releaseId, releaseId));
    expect(members).toHaveLength(2);
  });

  it('404s on unknown release and 400s on invalid body', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect(
      (await app.request(`/api/releases/${missing}/features`, json('PUT', { featureIds: [] }))).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/releases/${releaseId}/features`, json('PUT', { featureIds: ['nope'] }))).status,
    ).toBe(400);
  });
});

describe('GET /api/releases/:id/notes.md', () => {
  it('assembles ## sections from feature titles with final-doc first paragraphs', async () => {
    await db.insert(documents).values([
      {
        featureId: featureA,
        type: 'prd',
        title: 'Comments PRD',
        status: 'final',
        contentMd: 'Threaded comments on features and docs.\n\nSecond paragraph that must not appear.',
      },
      {
        featureId: featureA,
        type: 'brd',
        title: 'Draft note',
        status: 'draft',
        contentMd: 'Draft content must be excluded.',
      },
      {
        featureId: featureB,
        type: 'prd',
        title: 'Voting PRD',
        status: 'final',
        contentMd: '\n\nUp/down votes with per-user toggles.\n\nMore detail.',
      },
    ]);
    const res = await app.request(`/api/releases/${releaseId}/notes.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const md = await res.text();
    expect(md).toContain('# v0.2 — Team ready');
    expect(md).toContain('## Comments & review\n\nThreaded comments on features and docs.');
    expect(md).toContain('## Voting\n\nUp/down votes with per-user toggles.');
    expect(md).not.toContain('Second paragraph that must not appear');
    expect(md).not.toContain('Draft content must be excluded');
    // feature order follows sortOrder
    expect(md.indexOf('## Comments & review')).toBeLessThan(md.indexOf('## Voting'));
  });

  it('renders a heading-only section for features without final docs', async () => {
    const res = await app.request(`/api/releases/${releaseId}/notes.md`);
    expect(res.status).toBe(200);
    const md = await res.text();
    expect(md).toContain('## Comments & review');
    expect(md).toContain('## Voting');
  });

  it('404s on unknown release', async () => {
    const res = await app.request('/api/releases/00000000-0000-4000-8000-000000000000/notes.md');
    expect(res.status).toBe(404);
  });
});
