import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { asc, eq } from 'drizzle-orm';
import {
  setupTestDb,
  truncateAll,
  closeTestDb,
  createTestUser,
  createTestProject,
  addMembership,
  authCookie,
} from '../test/helpers';

const { app } = await import('../app');
const { db } = await import('../db');
const { projects, features, users, comments, decisions, activity } = await import('@productmap/db');
const { setAiModelFactory } = await import('../lib/ai');

let projectId: string;
let userId: string;
let otherId: string;
let featureId: string;
let auth: Record<string, string> = {};

// Project B (cross-project isolation)
let projectIdB: string;
let featureIdB: string;
let commentIdB: string;

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const AWS_ENV = ['AWS_REGION', 'AWS_PROFILE', 'AWS_ACCESS_KEY_ID', 'BEDROCK_MODEL_ID'] as const;

function clearAwsEnv() {
  for (const key of AWS_ENV) delete process.env[key];
}

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  clearAwsEnv();
  await truncateAll();
  // Actor IS the Corban user — attribution checks compare against userId
  const actor = await createTestUser({ role: 'admin', name: 'Corban', email: 'corban@test.co' });
  userId = actor.id;
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
  const [p] = await db.insert(projects).values({ name: 'ProductMap', vision: 'v', aboutMd: '' }).returning();
  projectId = p.id;
  const [o] = await db.insert(users).values({ name: 'Ada', color: '#3c6b46' }).returning();
  otherId = o.id;
  const [f] = await db.insert(features).values({ projectId, title: 'Gantt roadmap', horizon: 'next' }).returning();
  featureId = f.id;

  // Set up project B for cross-project isolation tests
  const [pB] = await db.insert(projects).values({ name: 'Project B', vision: '', aboutMd: '' }).returning();
  projectIdB = pB.id;
  const [fB] = await db
    .insert(features)
    .values({ projectId: projectIdB, title: 'Feature in B', horizon: 'now' })
    .returning();
  featureIdB = fB.id;
  // Insert a comment on project B's feature (needs authorId)
  const [cB] = await db
    .insert(comments)
    .values({ authorId: userId, featureId: featureIdB, body: 'Comment in B' })
    .returning();
  commentIdB = cB.id;
});

afterEach(() => {
  setAiModelFactory(null);
  clearAwsEnv();
});

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

async function activityRows(fid: string) {
  return db.select().from(activity).where(eq(activity.featureId, fid)).orderBy(asc(activity.createdAt));
}

const BASE = (pid = projectId) => `/api/projects/${pid}`;

describe('POST /api/projects/:projectId/decisions', () => {
  it('creates a feature decision with 201, decided-by join and decision_logged activity (AC3)', async () => {
    const res = await app.request(
      `${BASE()}/decisions`,
      post({ featureId, title: 'Week view ships first', decisionMd: 'We ship week view first.' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      featureId,
      title: 'Week view ships first',
      decisionMd: 'We ship week view first.',
      alternativesMd: '',
      sourceCommentId: null,
      decidedBy: userId,
      decidedByName: 'Corban',
      decidedByColor: '#2b557e',
    });
    expect(body.decidedAt).toBeTruthy();

    const acts = await activityRows(featureId);
    expect(acts).toHaveLength(1);
    expect(acts[0].kind).toBe('decision_logged');
    expect(acts[0].actorId).toBe(userId);
    expect(acts[0].payload).toMatchObject({ decisionId: body.id, title: 'Week view ships first' });
  });

  it('creates a feature-less decision without activity', async () => {
    const res = await app.request(
      `${BASE()}/decisions`,
      post({ title: 'Postgres over Mongo', decisionMd: 'Relational fits.', alternativesMd: '- Mongo' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ featureId: null, alternativesMd: '- Mongo' });
    const acts = await db.select().from(activity);
    expect(acts).toHaveLength(0);
  });

  it('stores sourceCommentId when given', async () => {
    const [comment] = await db
      .insert(comments)
      .values({ authorId: userId, featureId, body: 'Decided in thread' })
      .returning();
    const res = await app.request(
      `${BASE()}/decisions`,
      post({ featureId, title: 'T', decisionMd: 'D', sourceCommentId: comment.id }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).sourceCommentId).toBe(comment.id);
  });

  it('404 on unknown featureId or sourceCommentId', async () => {
    const f = await app.request(`${BASE()}/decisions`, post({ featureId: MISSING_ID, title: 'T', decisionMd: 'D' }));
    expect(f.status).toBe(404);
    const [comment] = await db
      .insert(comments)
      .values({ authorId: userId, featureId, body: 'A comment' })
      .returning();
    const s = await app.request(
      `${BASE()}/decisions`,
      post({ featureId, title: 'T', decisionMd: 'D', sourceCommentId: MISSING_ID }),
    );
    expect(s.status).toBe(404);
    // suppress unused var warning
    void comment;
  });

  it('400 on missing title or decisionMd', async () => {
    const res = await app.request(`${BASE()}/decisions`, post({ featureId, decisionMd: 'D' }));
    expect(res.status).toBe(400);
    const res2 = await app.request(`${BASE()}/decisions`, post({ featureId, title: 'T' }));
    expect(res2.status).toBe(400);
  });

  // Cross-project: featureId from project B → 404
  it('404 when featureId belongs to another project', async () => {
    const res = await app.request(
      `${BASE()}/decisions`,
      post({ featureId: featureIdB, title: 'T', decisionMd: 'D' }),
    );
    expect(res.status).toBe(404);
  });

  // Cross-project: sourceCommentId from project B → 404
  it('404 when sourceCommentId belongs to another project', async () => {
    const [localComment] = await db
      .insert(comments)
      .values({ authorId: userId, featureId, body: 'Local comment' })
      .returning();
    const res = await app.request(
      `${BASE()}/decisions`,
      post({ featureId, title: 'T', decisionMd: 'D', sourceCommentId: commentIdB }),
    );
    expect(res.status).toBe(404);
    void localComment;
  });

  // Viewer write → 403
  it('403 when viewer tries to write', async () => {
    const viewer = await createTestUser({ role: 'member', email: 'viewer@test.co' });
    await addMembership(viewer.id, projectId, 'viewer');
    const viewerAuth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };
    const res = await app.request(`${BASE()}/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...viewerAuth },
      body: JSON.stringify({ title: 'T', decisionMd: 'D' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/projects/:projectId/decisions', () => {
  it('lists all decisions newest-first and filters by featureId', async () => {
    const [other] = await db
      .insert(features)
      .values({ projectId, title: 'Realtime collaboration', horizon: 'later' })
      .returning();
    await app.request(`${BASE()}/decisions`, post({ featureId, title: 'First', decisionMd: 'a' }));
    await app.request(`${BASE()}/decisions`, post({ featureId: other.id, title: 'Second', decisionMd: 'b' }));

    const all = await (await app.request(`${BASE()}/decisions`, { headers: auth })).json();
    expect(all).toHaveLength(2);
    expect(all[0].decidedByName).toBe('Corban');

    const filtered = await (
      await app.request(`${BASE()}/decisions?featureId=${featureId}`, { headers: auth })
    ).json();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('First');
  });

  // List isolation: project B's decisions must not appear in project A's list
  it('list isolation — project B decisions do not appear in A list', async () => {
    // Create a decision in project A
    await app.request(`${BASE()}/decisions`, post({ title: 'A decision', decisionMd: 'In A' }));

    // Directly insert a decision in project B (bypass the route to avoid needing B membership)
    await db.insert(decisions).values({
      projectId: projectIdB,
      title: 'B decision',
      decisionMd: 'In B',
      decidedBy: userId,
    });

    const rows = await (await app.request(`${BASE()}/decisions`, { headers: auth })).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('A decision');
  });
});

describe('DELETE /api/projects/:projectId/decisions/:id', () => {
  it('deletes with 204; 404 on unknown', async () => {
    const created = await (
      await app.request(`${BASE()}/decisions`, post({ featureId, title: 'T', decisionMd: 'D' }))
    ).json();
    const res = await app.request(`${BASE()}/decisions/${created.id}`, { method: 'DELETE', headers: auth });
    expect(res.status).toBe(204);
    expect(await db.select().from(decisions).where(eq(decisions.id, created.id))).toHaveLength(0);

    const missing = await app.request(`${BASE()}/decisions/${MISSING_ID}`, { method: 'DELETE', headers: auth });
    expect(missing.status).toBe(404);
  });

  // Cross-project: cannot delete project B's decision via project A
  it('404 when deleting another project decision via A path', async () => {
    const [decB] = await db
      .insert(decisions)
      .values({ projectId: projectIdB, title: 'B dec', decisionMd: 'In B', decidedBy: userId })
      .returning();
    const res = await app.request(`${BASE()}/decisions/${decB.id}`, { method: 'DELETE', headers: auth });
    expect(res.status).toBe(404);
  });
});

// --- POST /api/projects/:projectId/ai/suggest-decision -----------------------------------------

const SUGGESTION = {
  suggested: true,
  title: 'Adopt week-level zoom',
  decisionMd: 'We will ship week-level zoom first.',
  alternativesMd: '- Month-only zoom\n- Configurable zoom',
};

interface Captured {
  system?: string;
  user?: string;
}

function makeMockObjectModel(captured: Captured, json: unknown = SUGGESTION) {
  return new MockLanguageModelV3({
    doGenerate: async ({ prompt }) => {
      captured.system = prompt
        .filter((m) => m.role === 'system')
        .map((m) => m.content as string)
        .join('\n');
      captured.user = prompt
        .filter((m) => m.role === 'user')
        .flatMap((m) =>
          (m.content as Array<{ type: string; text?: string }>)
            .filter((p) => p.type === 'text')
            .map((p) => p.text ?? ''),
        )
        .join('\n');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(json) }],
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 2, text: 2, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

function enableAi(json: unknown = SUGGESTION) {
  const captured: Captured = {};
  process.env.AWS_REGION = 'us-east-1';
  setAiModelFactory(() => makeMockObjectModel(captured, json));
  return captured;
}

async function seedResolvedThread() {
  const [root] = await db
    .insert(comments)
    .values({
      authorId: userId,
      featureId,
      body: 'Should we ship week-level zoom or month-level zoom first?',
      resolvedAt: new Date(),
      resolvedBy: userId,
    })
    .returning();
  const [reply] = await db
    .insert(comments)
    .values({
      authorId: otherId,
      featureId,
      parentId: root.id,
      body: 'Week-level — support tickets overwhelmingly ask for it.',
    })
    .returning();
  return { root, reply };
}

describe('POST /api/projects/:projectId/ai/suggest-decision', () => {
  it('503 when AI disabled', async () => {
    const { root } = await seedResolvedThread();
    const res = await app.request(`${BASE()}/ai/suggest-decision`, post({ commentId: root.id }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('ai_disabled');
  });

  it('400 on invalid body', async () => {
    enableAi();
    const res = await app.request(`${BASE()}/ai/suggest-decision`, post({ commentId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('404 on unknown comment', async () => {
    enableAi();
    const res = await app.request(`${BASE()}/ai/suggest-decision`, post({ commentId: MISSING_ID }));
    expect(res.status).toBe(404);
  });

  it('returns the suggestion and prompts with full thread bodies + authors (AC3)', async () => {
    const captured = enableAi();
    const { root, reply } = await seedResolvedThread();

    const res = await app.request(`${BASE()}/ai/suggest-decision`, post({ commentId: root.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SUGGESTION);

    // AC3: the prompt contains the thread text — every body and author name.
    expect(captured.user).toContain(root.body);
    expect(captured.user).toContain(reply.body);
    expect(captured.user).toContain('Corban');
    expect(captured.user).toContain('Ada');
    expect(captured.system).toContain('decision');
  });

  it('resolves the thread root when given a reply id', async () => {
    const captured = enableAi();
    const { root, reply } = await seedResolvedThread();

    const res = await app.request(`${BASE()}/ai/suggest-decision`, post({ commentId: reply.id }));
    expect(res.status).toBe(200);
    expect(captured.user).toContain(root.body);
    expect(captured.user).toContain(reply.body);
  });

  it('502 when the model returns an unparsable object', async () => {
    enableAi({ nope: true });
    const { root } = await seedResolvedThread();
    const res = await app.request(`${BASE()}/ai/suggest-decision`, post({ commentId: root.id }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('generation_failed');
  });

  // Cross-project: commentId from project B → 404
  it('404 when commentId belongs to another project', async () => {
    enableAi();
    const res = await app.request(`${BASE()}/ai/suggest-decision`, post({ commentId: commentIdB }));
    expect(res.status).toBe(404);
  });
});
