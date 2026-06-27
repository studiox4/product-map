import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { asc, eq } from 'drizzle-orm';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie, createTestProject, addMembership } from '../test/helpers';

const { app } = await import('../app');
const { db } = await import('../db');
const { features, activity, documents, ideas, templates } = await import(
  '@productmap/db'
);
const { setAiModelFactory } = await import('../lib/ai');

const AWS_ENV = ['AWS_REGION', 'AWS_PROFILE', 'AWS_ACCESS_KEY_ID', 'BEDROCK_MODEL_ID'] as const;

function clearAwsEnv() {
  for (const key of AWS_ENV) delete process.env[key];
}

let userId: string;
let projectId: string;
let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  clearAwsEnv();
  await truncateAll();
  const project = await createTestProject('ProductMap');
  projectId = project.id;
  // Actor IS the Corban user — attribution checks compare against userId
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  userId = actor.id;
  await addMembership(userId, projectId, 'editor');
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
});

afterEach(() => {
  setAiModelFactory(null);
  clearAwsEnv();
});

afterAll(async () => {
  await closeTestDb();
});

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

async function createIdea(overrides: Record<string, unknown> = {}) {
  const res = await app.request(
    `/api/projects/${projectId}/ideas`,
    json({ title: 'Bulk CSV import', bodyMd: 'Customers keep asking.', source: 'sales call', ...overrides }),
  );
  expect(res.status).toBe(201);
  return res.json();
}

interface Captured {
  user?: string;
}

function makeMockModel(captured: Captured) {
  const deltas = ['# Bulk CSV import\n\n', '## Success metric\n\nGenerated brief body.'];
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      captured.user = prompt
        .filter((m) => m.role === 'user')
        .flatMap((m) =>
          (m.content as Array<{ type: string; text?: string }>)
            .filter((p) => p.type === 'text')
            .map((p) => p.text ?? ''),
        )
        .join('\n');
      const chunks: LanguageModelV3StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '1' },
        ...deltas.map(
          (delta): LanguageModelV3StreamPart => ({ type: 'text-delta', id: '1', delta }),
        ),
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
        },
      ];
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
}

function enableAi(captured: Captured = {}) {
  process.env.AWS_REGION = 'us-east-1';
  setAiModelFactory(() => makeMockModel(captured));
  return captured;
}

const BRIEF_HINTS = 'Lead with the customer problem; include a measurable success metric.';

const PITCH_BODY =
  '# {{title}}\n\n## Problem\n\n## Who’s asking (evidence)\n\n## Proposed direction\n\n## Why now\n\n## Open questions\n\n## Effort gut-check';

async function seedPitchTemplate() {
  await db.insert(templates).values({
    type: 'idea_pitch',
    name: 'Idea pitch',
    bodyJson: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '{{title}}' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Problem' }] },
      ],
    },
    bodyMd: PITCH_BODY,
    isDefault: true,
  });
}

async function seedBriefTemplate() {
  await db.insert(templates).values({
    type: 'feature_brief',
    name: 'Feature brief',
    bodyJson: { type: 'doc', content: [] },
    bodyMd: '# {{title}}\n\n## Problem\n\n## Success metric',
    promptHints: BRIEF_HINTS,
    isDefault: true,
  });
}

describe('idea lifecycle (create → list → update)', () => {
  it('creates an idea with 201 and defaults', async () => {
    const idea = await createIdea();
    expect(idea.title).toBe('Bulk CSV import');
    expect(idea.bodyMd).toBe('Customers keep asking.');
    expect(idea.source).toBe('sales call');
    expect(idea.status).toBe('inbox');
    expect(idea.promotedFeatureId).toBeNull();
    expect(idea.createdBy).toBe(userId);
  });

  it('rejects an empty title with 400', async () => {
    const res = await app.request(`/api/projects/${projectId}/ideas`, json({ title: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('lists ideas with vote summaries and filters by status', async () => {
    const idea = await createIdea();
    await createIdea({ title: 'Dark mode', source: 'support' });
    await app.request(`/api/projects/${projectId}/ideas/${idea.id}`, json({ status: 'triaged' }, 'PATCH'));

    const all = await (await app.request(`/api/projects/${projectId}/ideas`, { headers: auth })).json();
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ score: 0, boosts: 0, cools: 0, myVote: 0 });

    const triaged = await (await app.request(`/api/projects/${projectId}/ideas?status=triaged`, { headers: auth })).json();
    expect(triaged).toHaveLength(1);
    expect(triaged[0].id).toBe(idea.id);
  });

  it('rejects an unknown status filter with 400', async () => {
    const res = await app.request(`/api/projects/${projectId}/ideas?status=bogus`, { headers: auth });
    expect(res.status).toBe(400);
  });

  it('updates title/body/source/status via PATCH', async () => {
    const idea = await createIdea();
    const res = await app.request(
      `/api/projects/${projectId}/ideas/${idea.id}`,
      json({ title: 'CSV import v2', bodyMd: 'Updated.', status: 'triaged' }, 'PATCH'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('CSV import v2');
    expect(body.bodyMd).toBe('Updated.');
    expect(body.status).toBe('triaged');
  });

  it('404s PATCH on a missing idea', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/ideas/00000000-0000-0000-0000-000000000000`,
      json({ title: 'x' }, 'PATCH'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes an idea with 204', async () => {
    const idea = await createIdea();
    const res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}`, { method: 'DELETE', headers: auth });
    expect(res.status).toBe(204);
    expect(await (await app.request(`/api/projects/${projectId}/ideas`, { headers: auth })).json()).toHaveLength(0);
  });
});

describe(`PUT /api/projects/:projectId/ideas/:id/vote`, () => {
  it('records, switches, and clears a vote like feature votes', async () => {
    const idea = await createIdea();

    let res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/vote`, json({ value: 1 }, 'PUT'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ score: 1, boosts: 1, cools: 0, myVote: 1 });

    res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/vote`, json({ value: -1 }, 'PUT'));
    expect(await res.json()).toEqual({ score: -1, boosts: 0, cools: 1, myVote: -1 });

    res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/vote`, json({ value: 0 }, 'PUT'));
    expect(await res.json()).toEqual({ score: 0, boosts: 0, cools: 0, myVote: 0 });
  });

  it('reflects my vote in the list for the requesting user', async () => {
    const idea = await createIdea();
    // Vote write and read both use the same auth cookie (Corban)
    await app.request(`/api/projects/${projectId}/ideas/${idea.id}/vote`, json({ value: 1 }, 'PUT'));
    const [row] = await (
      await app.request(`/api/projects/${projectId}/ideas`, { headers: auth })
    ).json();
    expect(row).toMatchObject({ score: 1, boosts: 1, myVote: 1 });
  });

  it('404s on a missing idea', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/ideas/00000000-0000-0000-0000-000000000000/vote`,
      json({ value: 1 }, 'PUT'),
    );
    expect(res.status).toBe(404);
  });

  it('rejects an invalid value with 400', async () => {
    const idea = await createIdea();
    const res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/vote`, json({ value: 5 }, 'PUT'));
    expect(res.status).toBe(400);
  });
});

describe(`POST /api/projects/:projectId/ideas/:id/promote`, () => {
  it('creates a feature from the idea, marks it promoted, and logs idea_promoted', async () => {
    const idea = await createIdea();
    const res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/promote`, json({ horizon: 'later' }));
    expect(res.status).toBe(201);
    const feature = await res.json();
    expect(feature.title).toBe('Bulk CSV import');
    expect(feature.horizon).toBe('later');
    expect(feature.descriptionMd).toBe('Customers keep asking.');
    expect(feature.status).toBe('idea');

    const [row] = await db.select().from(ideas).where(eq(ideas.id, idea.id));
    expect(row.status).toBe('promoted');
    expect(row.promotedFeatureId).toBe(feature.id);

    const acts = await db
      .select()
      .from(activity)
      .where(eq(activity.featureId, feature.id))
      .orderBy(asc(activity.createdAt));
    expect(acts.map((a) => a.kind)).toContain('idea_promoted');
    const promoted = acts.find((a) => a.kind === 'idea_promoted');
    expect(promoted?.actorId).toBe(userId);
    expect(promoted?.payload).toMatchObject({ ideaId: idea.id, to: 'Bulk CSV import' });

    // no AI brief requested → no documents
    expect(await db.select().from(documents).where(eq(documents.featureId, feature.id))).toHaveLength(0);
  });

  it('400s when the idea is already promoted (idempotency guard)', async () => {
    const idea = await createIdea();
    const first = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/promote`, json({ horizon: 'now' }));
    expect(first.status).toBe(201);
    const second = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/promote`, json({ horizon: 'now' }));
    expect(second.status).toBe(400);
    expect((await second.json()).error).toBe('already_promoted');
    expect(await db.select().from(features)).toHaveLength(1);
  });

  it('404s on a missing idea', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/ideas/00000000-0000-0000-0000-000000000000/promote`,
      json({ horizon: 'now' }),
    );
    expect(res.status).toBe(404);
  });

  it('withAiBrief creates a feature_brief doc via the DB template (mocked model)', async () => {
    const captured = enableAi();
    await seedBriefTemplate();
    const idea = await createIdea();
    const res = await app.request(
      `/api/projects/${projectId}/ideas/${idea.id}/promote`,
      json({ horizon: 'later', withAiBrief: true }),
    );
    expect(res.status).toBe(201);
    const feature = await res.json();

    const docs = await db.select().from(documents).where(eq(documents.featureId, feature.id));
    expect(docs).toHaveLength(1);
    expect(docs[0].type).toBe('feature_brief');
    expect(docs[0].contentMd).toBe('# Bulk CSV import\n\n## Success metric\n\nGenerated brief body.');

    // Prompt is built from the DB template + idea body
    expect(captured.user).toContain(BRIEF_HINTS);
    expect(captured.user).toContain('Customers keep asking.');
    expect(captured.user).toContain('Bulk CSV import');
  });

  it('withAiBrief is silently skipped when AI is disabled', async () => {
    await seedBriefTemplate();
    const idea = await createIdea();
    const res = await app.request(
      `/api/projects/${projectId}/ideas/${idea.id}/promote`,
      json({ horizon: 'later', withAiBrief: true }),
    );
    expect(res.status).toBe(201);
    const feature = await res.json();
    expect(feature.title).toBe('Bulk CSV import');
    expect(await db.select().from(documents).where(eq(documents.featureId, feature.id))).toHaveLength(0);

    const [row] = await db.select().from(ideas).where(eq(ideas.id, idea.id));
    expect(row.status).toBe('promoted');
  });

  it('transfers the pitch doc to the new feature (feature_id set, idea_id retained)', async () => {
    await seedPitchTemplate();
    const idea = await createIdea();
    const pitch = await (await app.request(`/api/projects/${projectId}/ideas/${idea.id}/pitch`, json({}))).json();

    const res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/promote`, json({ horizon: 'next' }));
    expect(res.status).toBe(201);
    const feature = await res.json();

    const [doc] = await db.select().from(documents).where(eq(documents.id, pitch.id));
    expect(doc.featureId).toBe(feature.id);
    expect(doc.ideaId).toBe(idea.id); // provenance kept
    expect(doc.type).toBe('idea_pitch');

    // The doc now shows up under the feature's docs (verified via DB query — route is nested).
    const featureDocs = await db.select().from(documents).where(eq(documents.featureId, feature.id));
    expect(featureDocs.map((d: { id: string }) => d.id)).toContain(pitch.id);
  });
});

describe('idea creator + pitchDoc joins (GET list/detail)', () => {
  it('list rows carry creator {id,name,color} and pitchDoc null when unpitched', async () => {
    await createIdea();
    const [row] = await (await app.request(`/api/projects/${projectId}/ideas`, { headers: auth })).json();
    expect(row.creator).toEqual({ id: userId, name: 'Corban', color: '#2b557e' });
    expect(row.pitchDoc).toBeNull();
  });

  it('list + detail include pitchDoc {id,title,status} once a pitch exists', async () => {
    await seedPitchTemplate();
    const idea = await createIdea();
    const pitch = await (await app.request(`/api/projects/${projectId}/ideas/${idea.id}/pitch`, json({}))).json();

    const [row] = await (await app.request(`/api/projects/${projectId}/ideas`, { headers: auth })).json();
    expect(row.pitchDoc).toEqual({ id: pitch.id, title: pitch.title, status: 'draft' });

    const detail = await (await app.request(`/api/projects/${projectId}/ideas/${idea.id}`, { headers: auth })).json();
    expect(detail.creator).toEqual({ id: userId, name: 'Corban', color: '#2b557e' });
    expect(detail.pitchDoc).toEqual({ id: pitch.id, title: pitch.title, status: 'draft' });
  });
});

describe('PATCH /api/projects/:projectId/ideas/:id — idea_edited activity', () => {
  it('records idea_edited on the promoted feature feed with changed fields', async () => {
    const idea = await createIdea();
    const feature = await (
      await app.request(`/api/projects/${projectId}/ideas/${idea.id}/promote`, json({ horizon: 'now' }))
    ).json();

    const res = await app.request(
      `/api/projects/${projectId}/ideas/${idea.id}`,
      json({ title: 'CSV import v2', source: 'churn review' }, 'PATCH'),
    );
    expect(res.status).toBe(200);

    const acts = await db
      .select()
      .from(activity)
      .where(eq(activity.featureId, feature.id))
      .orderBy(asc(activity.createdAt));
    const edited = acts.find((a) => a.kind === 'idea_edited');
    expect(edited).toBeDefined();
    expect(edited?.actorId).toBe(userId);
    expect(edited?.payload).toMatchObject({
      ideaId: idea.id,
      to: 'CSV import v2',
      fields: ['title', 'source'],
    });
  });

  it('skips idea_edited for unpromoted ideas (activity is feature-scoped)', async () => {
    const idea = await createIdea();
    await app.request(`/api/projects/${projectId}/ideas/${idea.id}`, json({ title: 'Renamed' }, 'PATCH'));
    const acts = await db.select().from(activity);
    expect(acts.filter((a) => a.kind === 'idea_edited')).toHaveLength(0);
  });
});

describe('POST /api/projects/:projectId/ideas/:id/pitch', () => {
  it('creates an idea_pitch doc from the default template with {{title}} substituted', async () => {
    await seedPitchTemplate();
    const idea = await createIdea();
    const res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/pitch`, json({}));
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc.type).toBe('idea_pitch');
    expect(doc.ideaId).toBe(idea.id);
    expect(doc.featureId).toBeNull();
    expect(doc.title).toBe('Bulk CSV import — Idea pitch');
    expect(doc.status).toBe('draft');
    expect(doc.contentMd).toContain('# Bulk CSV import');
    expect(doc.contentMd).toContain('## Problem');
    expect(doc.contentMd).toContain('## Effort gut-check');
    expect(JSON.stringify(doc.contentJson)).toContain('Bulk CSV import');
    expect(doc.createdBy).toBe(userId);
  });

  it('409s when a pitch already exists', async () => {
    await seedPitchTemplate();
    const idea = await createIdea();
    const first = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/pitch`, json({}));
    expect(first.status).toBe(201);
    const second = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/pitch`, json({}));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe('pitch_exists');
    expect(await db.select().from(documents)).toHaveLength(1);
  });

  it('404s on a missing idea', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/ideas/00000000-0000-0000-0000-000000000000/pitch`,
      json({}),
    );
    expect(res.status).toBe(404);
  });

  it('creates a blank pitch when no default template exists', async () => {
    const idea = await createIdea();
    const res = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/pitch`, json({}));
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc.contentMd).toBe('');
    expect(doc.type).toBe('idea_pitch');
  });
});

describe('pending-idea exclusion (moderation guard)', () => {
  it('excludes pending ideas from the default list but returns them under ?status=pending', async () => {
    // Insert a held public submission directly.
    const [held] = await db
      .insert(ideas)
      .values({ projectId, title: 'Held idea', source: 'public', status: 'pending' })
      .returning();

    const def = await app.request(`/api/projects/${projectId}/ideas`, { headers: auth });
    const defList = await def.json();
    expect((defList as Array<{ id: string }>).map((r) => r.id)).not.toContain(held.id);

    const pend = await app.request(`/api/projects/${projectId}/ideas?status=pending`, { headers: auth });
    const pendList = await pend.json();
    expect((pendList as Array<{ id: string }>).map((r) => r.id)).toEqual([held.id]);
  });
});

describe('cross-project isolation (IDOR + list + viewer gate)', () => {
  it('GET/PATCH/DELETE on B idea via A path → 404 (IDOR)', async () => {
    // Project B + editor B
    const projectB = await createTestProject('Project B');
    const userB = await createTestUser({ role: 'member', name: 'User B', email: 'b@test.co' });
    await addMembership(userB.id, projectB.id, 'editor');
    const authB = { cookie: await authCookie(userB), origin: 'http://localhost', host: 'localhost' };

    // Create idea in B
    const resCreate = await app.request(
      `/api/projects/${projectB.id}/ideas`,
      { method: 'POST', headers: { 'content-type': 'application/json', ...authB }, body: JSON.stringify({ title: 'B idea' }) },
    );
    expect(resCreate.status).toBe(201);
    const ideaB = await resCreate.json();

    // Try to access B's idea via A's project path (actor = editor in A)
    const getRes = await app.request(`/api/projects/${projectId}/ideas/${ideaB.id}`, { headers: auth });
    expect(getRes.status).toBe(404);

    const patchRes = await app.request(
      `/api/projects/${projectId}/ideas/${ideaB.id}`,
      json({ title: 'hijacked' }, 'PATCH'),
    );
    expect(patchRes.status).toBe(404);

    const deleteRes = await app.request(`/api/projects/${projectId}/ideas/${ideaB.id}`, { method: 'DELETE', headers: auth });
    expect(deleteRes.status).toBe(404);
  });

  it("list isolation: B's ideas absent from A's list", async () => {
    const projectB = await createTestProject('Project B');
    const userB = await createTestUser({ role: 'member', name: 'User B2', email: 'b2@test.co' });
    await addMembership(userB.id, projectB.id, 'editor');
    const authB = { cookie: await authCookie(userB), origin: 'http://localhost', host: 'localhost' };

    // Create idea in A and B
    await createIdea({ title: 'A idea' });
    await app.request(
      `/api/projects/${projectB.id}/ideas`,
      { method: 'POST', headers: { 'content-type': 'application/json', ...authB }, body: JSON.stringify({ title: 'B idea' }) },
    );

    // A's list should only have A's idea
    const listA = await (await app.request(`/api/projects/${projectId}/ideas`, { headers: auth })).json();
    expect(listA).toHaveLength(1);
    expect(listA[0].title).toBe('A idea');
  });

  it('viewer write attempts → 403 (POST, PATCH, DELETE, vote, promote, pitch)', async () => {
    const viewer = await createTestUser({ role: 'member', name: 'Viewer', email: 'viewer@test.co' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };
    const viewerJson = (body: unknown, method = 'POST') => ({
      method,
      headers: { 'content-type': 'application/json', ...viewerAuth },
      body: JSON.stringify(body),
    });

    // POST new idea
    const postRes = await app.request(`/api/projects/${projectId}/ideas`, viewerJson({ title: 'sneaky' }));
    expect(postRes.status).toBe(403);

    // Need a real idea (created by editor) for the rest
    const idea = await createIdea();

    // PATCH
    const patchRes = await app.request(`/api/projects/${projectId}/ideas/${idea.id}`, viewerJson({ title: 'x' }, 'PATCH'));
    expect(patchRes.status).toBe(403);

    // DELETE
    const deleteRes = await app.request(`/api/projects/${projectId}/ideas/${idea.id}`, { method: 'DELETE', headers: viewerAuth });
    expect(deleteRes.status).toBe(403);

    // PUT vote
    const voteRes = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/vote`, viewerJson({ value: 1 }, 'PUT'));
    expect(voteRes.status).toBe(403);

    // POST promote
    const promoteRes = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/promote`, viewerJson({ horizon: 'now' }));
    expect(promoteRes.status).toBe(403);

    // POST pitch
    const pitchRes = await app.request(`/api/projects/${projectId}/ideas/${idea.id}/pitch`, viewerJson({}));
    expect(pitchRes.status).toBe(403);
  });
});
