// Integration tests for documents routes + markdown export (Task 2B / B4).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects, features, users, activity, featureCollaborators, templates, ideas, releases, documents } from '@productmap/db';
import { asc, eq } from 'drizzle-orm';
import AdmZip from 'adm-zip';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

let projectId: string;
let featureId: string;
let userId: string;
let defaultTemplateId: string;
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
  const [product] = await db
    .insert(projects)
    .values({ name: 'ProductMap', vision: 'v', aboutMd: '' })
    .returning();
  projectId = product.id;
  const [feature] = await db
    .insert(features)
    .values({ projectId, title: 'Rich Markdown Editor', horizon: 'now' })
    .returning();
  featureId = feature.id;
  // Default PRD template in the DB — doc creation resolves templates from here.
  const [tpl] = await db
    .insert(templates)
    .values({
      type: 'prd',
      name: 'Product requirements (PRD)',
      description: 'Built-in PRD skeleton',
      bodyJson: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '{{title}}' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'What is this and why now?' }] },
        ],
      },
      bodyMd: '# {{title}}\n\n## Overview\n\nWhat is this and why now?',
      promptHints: 'Write a crisp PRD.',
      isDefault: true,
    })
    .returning();
  defaultTemplateId = tpl.id;
});

async function activityRows() {
  return db
    .select()
    .from(activity)
    .where(eq(activity.featureId, featureId))
    .orderBy(asc(activity.createdAt));
}

async function createDoc(overrides: Record<string, unknown> = {}) {
  const res = await app.request(`/api/projects/${projectId}/documents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
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

describe('POST /api/projects/:projectId/documents', () => {
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

  it('uses an explicit templateId over the type default', async () => {
    const [custom] = await db
      .insert(templates)
      .values({
        type: 'prd',
        name: 'Lightweight PRD',
        bodyJson: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '{{title}}' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Lightweight skeleton body.' }] },
          ],
        },
        bodyMd: '# {{title}}\n\nLightweight skeleton body.',
        isDefault: false,
      })
      .returning();
    const res = await createDoc({ templateId: custom.id });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.contentMd).toContain('Lightweight skeleton body.');
    expect(body.contentMd).toContain('Editor PRD');
    expect(body.contentMd).not.toContain('{{title}}');
    expect(JSON.stringify(body.contentJson)).toContain('Lightweight skeleton body.');
    expect(JSON.stringify(body.contentJson)).not.toContain('{{title}}');
  });

  it('falls back to the DB default template for the type when no templateId is given', async () => {
    const res = await createDoc();
    const body = await res.json();
    expect(body.contentMd).toBe('# Editor PRD\n\n## Overview\n\nWhat is this and why now?');
  });

  it('skips archived default templates (creates blank)', async () => {
    // Force-archive the default directly (API forbids it; resolution must still be safe).
    await db.update(templates).set({ archivedAt: new Date() }).where(eq(templates.id, defaultTemplateId));
    const res = await createDoc();
    const body = await res.json();
    expect(body.contentMd).toBe('');
  });

  it('404 for unknown templateId', async () => {
    const res = await createDoc({ templateId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
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
    const res = await app.request(`/api/projects/${projectId}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
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

  // --- cross-project: featureId from project B → 404 ---
  it('POST {featureId: <project B feature>} → 404 (body-id IDOR)', async () => {
    const userB = await createTestUser({ role: 'member', email: 'b@test.co' });
    const projB = await createTestProject('Project B');
    await addMembership(userB.id, projB.id, 'editor');
    const [featureB] = await db.insert(features).values({ projectId: projB.id, title: 'B Feature', horizon: 'now' }).returning();

    const memberA = await createTestUser({ role: 'member', email: 'memberA@test.co' });
    await addMembership(memberA.id, projectId, 'editor');
    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };

    const res = await app.request(`/api/projects/${projectId}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...memberAAuth },
      body: JSON.stringify({ featureId: featureB.id, type: 'prd', title: 'Attack doc', fromTemplate: false }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/projects/:projectId/documents', () => {
  it('lists document metas filtered by featureId', async () => {
    await createDoc();
    await createDoc({ type: 'tech_spec', title: 'Editor tech spec' });
    const res = await app.request(`/api/projects/${projectId}/documents?featureId=${featureId}`, { headers: auth });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(2);
    expect(list[0].contentJson).toBeUndefined();
    expect(list[0].contentMd).toBeUndefined();
  });

  it('?all=true returns DocumentListItems with featureTitle, featureHorizon and wordCount', async () => {
    await createDoc(); // templated PRD → non-trivial word count
    const res = await app.request(`/api/projects/${projectId}/documents?all=true`, { headers: auth });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(1);
    const item = list[0];
    expect(item.featureTitle).toBe('Rich Markdown Editor');
    expect(item.featureHorizon).toBe('now');
    expect(item.wordCount).toBeGreaterThan(0);
    expect(item.contentJson).toBeUndefined();
    expect(item.contentMd).toBeUndefined();
    expect(item.ownerLabel).toEqual({ kind: 'feature', id: featureId, title: 'Rich Markdown Editor' });
  });

  it('?all=true includes idea-owned docs with an idea ownerLabel', async () => {
    const [idea] = await db.insert(ideas).values({ projectId, title: 'SSO via OIDC', bodyMd: '' }).returning();
    const [doc] = await db
      .insert(documents)
      .values({
        projectId,
        ideaId: idea.id,
        type: 'idea_pitch',
        title: 'SSO via OIDC — Idea pitch',
        contentMd: 'one two three',
      })
      .returning();
    const list = await (await app.request(`/api/projects/${projectId}/documents?all=true`, { headers: auth })).json();
    const item = list.find((d: { id: string }) => d.id === doc.id);
    expect(item).toBeDefined();
    expect(item.ownerLabel).toEqual({ kind: 'idea', id: idea.id, title: 'SSO via OIDC' });
    expect(item.featureTitle).toBe('');
    expect(item.featureHorizon).toBeNull();
    expect(item.wordCount).toBe(3);
  });

  it('?all=true includes release_notes docs with a release ownerLabel', async () => {
    const [doc] = await db
      .insert(documents)
      .values({ projectId, type: 'release_notes', title: 'v0.3 — Release notes', contentMd: 'shipped things' })
      .returning();
    const [release] = await db
      .insert(releases)
      .values({ projectId, name: 'v0.3', notesDocId: doc.id })
      .returning();
    const list = await (await app.request(`/api/projects/${projectId}/documents?all=true`, { headers: auth })).json();
    const item = list.find((d: { id: string }) => d.id === doc.id);
    expect(item).toBeDefined();
    expect(item.ownerLabel).toEqual({ kind: 'release', id: release.id, title: 'v0.3' });
    expect(item.featureTitle).toBe('');
    expect(item.wordCount).toBe(2);
  });

  it('?all=true labels a promoted pitch (feature_id + idea_id) as feature-owned', async () => {
    const [idea] = await db.insert(ideas).values({ projectId, title: 'Promoted idea', bodyMd: '' }).returning();
    const [doc] = await db
      .insert(documents)
      .values({
        projectId,
        featureId,
        ideaId: idea.id,
        type: 'idea_pitch',
        title: 'Promoted idea — Idea pitch',
        contentMd: '',
      })
      .returning();
    const list = await (await app.request(`/api/projects/${projectId}/documents?all=true`, { headers: auth })).json();
    const item = list.find((d: { id: string }) => d.id === doc.id);
    expect(item.ownerLabel).toEqual({ kind: 'feature', id: featureId, title: 'Rich Markdown Editor' });
    expect(item.ideaId).toBe(idea.id);
  });

  it('?all=true wordCount counts whitespace-separated words of contentMd', async () => {
    const doc = await (await createDoc({ fromTemplate: false })).json();
    const full = await (await app.request(`/api/projects/${projectId}/documents/${doc.id}`, { headers: auth })).json();
    expect(full.contentMd).toBe('');
    const res = await app.request(`/api/projects/${projectId}/documents?all=true`, { headers: auth });
    const [item] = await res.json();
    expect(item.wordCount).toBe(0);
  });

  // --- cross-project: ?all list must exclude project B's docs ---
  it('?all=true excludes docs from project B (list isolation)', async () => {
    // create a doc in A
    await createDoc();
    // create a project B with its own doc
    const projB = await createTestProject('Project B');
    const [featureB] = await db.insert(features).values({ projectId: projB.id, title: 'B Feature', horizon: 'now' }).returning();
    await db.insert(documents).values({ projectId: projB.id, featureId: featureB.id, type: 'prd', title: 'B PRD', contentMd: 'b content' });

    const res = await app.request(`/api/projects/${projectId}/documents?all=true`, { headers: auth });
    const list = await res.json();
    const bDoc = list.find((d: { title: string }) => d.title === 'B PRD');
    expect(bDoc).toBeUndefined();
    expect(list.some((d: { title: string }) => d.title === 'Editor PRD')).toBe(true);
  });
});

describe('PATCH /api/projects/:projectId/documents/:id', () => {
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
    const patch = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ contentJson: typed }),
    });
    expect(patch.status).toBe(200);
    const get = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, { headers: auth });
    expect(get.status).toBe(200);
    const full = await get.json();
    expect(full.contentMd).toContain('hello typed text');
  });

  it('status transitions draft -> in_review -> final', async () => {
    const doc = await (await createDoc()).json();
    expect(doc.status).toBe('draft');
    const r1 = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ status: 'in_review' }),
    });
    expect(r1.status).toBe(200);
    expect((await r1.json()).status).toBe('in_review');
    const r2 = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ status: 'final' }),
    });
    expect((await r2.json()).status).toBe('final');
  });

  it('cover PATCH sets and clears the gradient cover', async () => {
    const doc = await (await createDoc()).json();
    expect(doc.cover).toBeNull();
    const r1 = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ cover: 'dawn' }),
    });
    expect(r1.status).toBe(200);
    expect((await r1.json()).cover).toBe('dawn');
    // persists on follow-up GET
    const get = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, { headers: auth });
    expect((await get.json()).cover).toBe('dawn');
    // null clears it
    const r2 = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ cover: null }),
    });
    expect((await r2.json()).cover).toBeNull();
  });

  it('records doc_status_changed and doc_renamed activity with {from,to} payloads', async () => {
    const doc = await (await createDoc()).json();
    await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ status: 'in_review', title: 'Editor PRD v2' }),
    });
    const acts = await activityRows();
    const byKind = new Map(acts.map((a) => [a.kind, a]));
    expect(byKind.get('doc_status_changed')?.payload).toEqual({ from: 'draft', to: 'in_review' });
    expect(byKind.get('doc_renamed')?.payload).toEqual({ from: 'Editor PRD', to: 'Editor PRD v2' });
    // doc_created from the POST plus the two PATCH entries
    expect(acts).toHaveLength(3);
  });

  it('sets updatedBy from auth cookie and content-only saves record no activity', async () => {
    const doc = await (await createDoc({ fromTemplate: false })).json();
    const other = await createTestUser({ role: 'member', name: 'Ada', email: 'ada@test.co', color: '#3c6b46' });
    // Editor membership required for PATCH (method gate)
    await addMembership(other.id, projectId, 'editor');
    const otherCookie = await authCookie(other);
    const otherAuth = { cookie: otherCookie, origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...otherAuth },
      body: JSON.stringify({ contentJson: { type: 'doc', content: [] } }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).updatedBy).toBe(other.id);
    const acts = await activityRows();
    expect(acts.map((a) => a.kind)).toEqual(['doc_created']); // only from POST
  });

  it('404 for unknown id', async () => {
    const res = await app.request(`/api/projects/${projectId}/documents/00000000-0000-0000-0000-000000000000`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:projectId/documents/:id', () => {
  it('204 then GET 404', async () => {
    const doc = await (await createDoc()).json();
    const del = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, { method: 'DELETE', headers: auth });
    expect(del.status).toBe(204);
    const get = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, { headers: auth });
    expect(get.status).toBe(404);
  });
});

describe('GET /api/projects/:projectId/documents/:id/export.md', () => {
  it('returns markdown attachment whose body equals contentMd', async () => {
    const doc = await (await createDoc()).json();
    const res = await app.request(`/api/projects/${projectId}/documents/${doc.id}/export.md`, { headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const text = await res.text();
    expect(text).toBe(doc.contentMd);
  });
});

describe('GET /api/projects/:projectId/export.zip', () => {
  it('returns a zip with <feature-slug>/<doc-slug>.md entries', async () => {
    const doc = await (await createDoc()).json();
    const res = await app.request(`/api/projects/${projectId}/export.zip`, { headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('zip');
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('rich-markdown-editor/editor-prd.md');
    const entry = zip.getEntry('rich-markdown-editor/editor-prd.md');
    expect(entry!.getData().toString('utf8')).toBe(doc.contentMd);
  });

  // --- cross-project: export.zip must exclude project B's docs/features ---
  it('export.zip excludes project B docs and features', async () => {
    // doc in A
    await createDoc();
    // project B with its own feature + doc
    const projB = await createTestProject('Project B');
    const [featureB] = await db.insert(features).values({ projectId: projB.id, title: 'B Exclusive Feature', horizon: 'now' }).returning();
    await db.insert(documents).values({ projectId: projB.id, featureId: featureB.id, type: 'prd', title: 'B Only Doc', contentMd: 'secret b content' });

    const res = await app.request(`/api/projects/${projectId}/export.zip`, { headers: auth });
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const names = zip.getEntries().map((e) => e.entryName);
    // B's feature-slug should not appear
    expect(names.some((n) => n.includes('b-exclusive-feature'))).toBe(false);
    expect(names.some((n) => n.includes('b-only-doc'))).toBe(false);
    // A's doc should be present
    expect(names).toContain('rich-markdown-editor/editor-prd.md');
  });
});

// --- Cross-project security tests (path-id IDOR + viewer write) ---

describe('cross-project IDOR + role enforcement', () => {
  it('GET /:id → 404 when doc belongs to project B (path-id IDOR)', async () => {
    const memberA = await createTestUser({ role: 'member', email: 'memberA2@test.co' });
    const projB = await createTestProject('Project B');
    await addMembership(memberA.id, projectId, 'editor');
    const [featureB] = await db.insert(features).values({ projectId: projB.id, title: 'B Feature', horizon: 'now' }).returning();
    const [docB] = await db.insert(documents).values({ projectId: projB.id, featureId: featureB.id, type: 'prd', title: 'B Doc', contentMd: '' }).returning();

    const memberAAuth = { cookie: await authCookie(memberA), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`/api/projects/${projectId}/documents/${docB.id}`, { headers: memberAAuth });
    expect(res.status).toBe(404);
  });

  it('viewer write → 403 (POST, PATCH, DELETE)', async () => {
    const viewer = await createTestUser({ role: 'member', email: 'viewer@test.co' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };

    // POST → 403
    const post = await app.request(`/api/projects/${projectId}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...viewerAuth },
      body: JSON.stringify({ featureId, type: 'prd', title: 'nope', fromTemplate: false }),
    });
    expect(post.status).toBe(403);

    // Create a doc as admin to try PATCH/DELETE
    const doc = await (await createDoc()).json();

    const patch = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...viewerAuth },
      body: JSON.stringify({ title: 'hacked' }),
    });
    expect(patch.status).toBe(403);

    const del = await app.request(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: 'DELETE',
      headers: viewerAuth,
    });
    expect(del.status).toBe(403);
  });
});
