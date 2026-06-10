// Integration tests for documents routes + markdown export (Task 2B).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { products, features, users, activity, featureCollaborators } from '@productmap/db';
import { asc, eq } from 'drizzle-orm';
import AdmZip from 'adm-zip';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

let productId: string;
let featureId: string;
let userId: string;

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const [product] = await db
    .insert(products)
    .values({ name: 'ProductMap', vision: 'v', aboutMd: '' })
    .returning();
  productId = product.id;
  const [feature] = await db
    .insert(features)
    .values({ productId, title: 'Rich Markdown Editor', horizon: 'now' })
    .returning();
  featureId = feature.id;
  const [u] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
  userId = u.id;
});

async function activityRows() {
  return db
    .select()
    .from(activity)
    .where(eq(activity.featureId, featureId))
    .orderBy(asc(activity.createdAt));
}

async function createDoc(overrides: Record<string, unknown> = {}) {
  const res = await app.request('/api/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      featureId,
      type: 'prd',
      title: 'Editor PRD',
      fromTemplate: true,
      ...overrides,
    }),
  });
  return res;
}

describe('POST /api/documents', () => {
  it('fromTemplate:true returns 201 with template content, {{title}} replaced', async () => {
    const res = await createDoc();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.featureId).toBe(featureId);
    expect(body.type).toBe('prd');
    expect(body.status).toBe('draft');
    // contentJson non-empty
    expect(Array.isArray(body.contentJson.content)).toBe(true);
    expect(body.contentJson.content.length).toBeGreaterThan(0);
    const jsonStr = JSON.stringify(body.contentJson);
    expect(jsonStr).toContain('Editor PRD');
    expect(jsonStr).not.toContain('{{title}}');
    // contentMd derived with markdown sections
    expect(body.contentMd).toContain('## ');
    expect(body.contentMd).toContain('Editor PRD');
    expect(body.contentMd).not.toContain('{{title}}');
  });

  it('fromTemplate:false returns an empty doc', async () => {
    const res = await createDoc({ fromTemplate: false });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.contentJson.type).toBe('doc');
    expect(body.contentJson.content ?? []).toHaveLength(0);
    expect(body.contentMd).toBe('');
  });

  it('attributes creation, records doc_created activity and adds collaborator', async () => {
    const body = await (await createDoc()).json();
    expect(body.createdBy).toBe(userId);
    expect(body.updatedBy).toBe(userId);

    const acts = await activityRows();
    expect(acts).toHaveLength(1);
    expect(acts[0].kind).toBe('doc_created');
    expect(acts[0].actorId).toBe(userId);

    const collabs = await db
      .select()
      .from(featureCollaborators)
      .where(eq(featureCollaborators.featureId, featureId));
    expect(collabs.map((c) => c.userId)).toEqual([userId]);
  });

  it('rejects invalid body with 400 validation', async () => {
    const res = await app.request('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureId, type: 'nope', title: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation');
    expect(body.issues).toBeTruthy();
  });

  it('404 for unknown feature', async () => {
    const res = await createDoc({ featureId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('GET /api/documents', () => {
  it('lists document metas filtered by featureId', async () => {
    await createDoc();
    await createDoc({ type: 'tech_spec', title: 'Editor tech spec' });
    const res = await app.request(`/api/documents?featureId=${featureId}`);
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(2);
    expect(list[0].contentJson).toBeUndefined();
    expect(list[0].contentMd).toBeUndefined();
  });

  it('?all=true returns DocumentListItems with featureTitle, featureHorizon and wordCount', async () => {
    await createDoc(); // templated PRD → non-trivial word count
    const res = await app.request('/api/documents?all=true');
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(1);
    const item = list[0];
    expect(item.featureTitle).toBe('Rich Markdown Editor');
    expect(item.featureHorizon).toBe('now');
    expect(item.wordCount).toBeGreaterThan(0);
    expect(item.contentJson).toBeUndefined();
    expect(item.contentMd).toBeUndefined();
  });

  it('?all=true wordCount counts whitespace-separated words of contentMd', async () => {
    const doc = await (await createDoc({ fromTemplate: false })).json();
    const full = await (await app.request(`/api/documents/${doc.id}`)).json();
    expect(full.contentMd).toBe('');
    const res = await app.request('/api/documents?all=true');
    const [item] = await res.json();
    expect(item.wordCount).toBe(0);
  });
});

describe('PATCH /api/documents/:id', () => {
  it('contentJson PATCH derives contentMd server-side (visible on follow-up GET)', async () => {
    const doc = await (await createDoc({ fromTemplate: false })).json();
    const typed = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello typed text' }],
        },
      ],
    };
    const patch = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentJson: typed }),
    });
    expect(patch.status).toBe(200);
    const get = await app.request(`/api/documents/${doc.id}`);
    expect(get.status).toBe(200);
    const full = await get.json();
    expect(full.contentMd).toContain('hello typed text');
  });

  it('status transitions draft -> in_review -> final', async () => {
    const doc = await (await createDoc()).json();
    expect(doc.status).toBe('draft');
    const r1 = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_review' }),
    });
    expect(r1.status).toBe(200);
    expect((await r1.json()).status).toBe('in_review');
    const r2 = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'final' }),
    });
    expect((await r2.json()).status).toBe('final');
  });

  it('records doc_status_changed and doc_renamed activity with {from,to} payloads', async () => {
    const doc = await (await createDoc()).json();
    await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_review', title: 'Editor PRD v2' }),
    });
    const acts = await activityRows();
    const byKind = new Map(acts.map((a) => [a.kind, a]));
    expect(byKind.get('doc_status_changed')?.payload).toEqual({ from: 'draft', to: 'in_review' });
    expect(byKind.get('doc_renamed')?.payload).toEqual({ from: 'Editor PRD', to: 'Editor PRD v2' });
    // doc_created from the POST plus the two PATCH entries
    expect(acts).toHaveLength(3);
  });

  it('sets updatedBy from x-user-id and content-only saves record no activity', async () => {
    const doc = await (await createDoc({ fromTemplate: false })).json();
    const [other] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();
    const res = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-user-id': other.id },
      body: JSON.stringify({ contentJson: { type: 'doc', content: [] } }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).updatedBy).toBe(other.id);
    const acts = await activityRows();
    expect(acts.map((a) => a.kind)).toEqual(['doc_created']); // only from POST
  });

  it('404 for unknown id', async () => {
    const res = await app.request('/api/documents/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/:id', () => {
  it('204 then GET 404', async () => {
    const doc = await (await createDoc()).json();
    const del = await app.request(`/api/documents/${doc.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    const get = await app.request(`/api/documents/${doc.id}`);
    expect(get.status).toBe(404);
  });
});

describe('GET /api/documents/:id/export.md', () => {
  it('returns markdown attachment whose body equals contentMd', async () => {
    const doc = await (await createDoc()).json();
    const res = await app.request(`/api/documents/${doc.id}/export.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const text = await res.text();
    expect(text).toBe(doc.contentMd);
  });
});

describe('GET /api/export.zip', () => {
  it('returns a zip with <feature-slug>/<doc-slug>.md entries', async () => {
    const doc = await (await createDoc()).json();
    const res = await app.request('/api/export.zip');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('zip');
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('rich-markdown-editor/editor-prd.md');
    const entry = zip.getEntry('rich-markdown-editor/editor-prd.md');
    expect(entry!.getData().toString('utf8')).toBe(doc.contentMd);
  });
});
