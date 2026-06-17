import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { eq } from 'drizzle-orm';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';

const { app } = await import('../app');
const { db } = await import('../db');
const { products, features, users, activity, templates } = await import('@productmap/db');
const { setAiModelFactory } = await import('../lib/ai');

const AWS_ENV = ['AWS_REGION', 'AWS_PROFILE', 'AWS_ACCESS_KEY_ID', 'BEDROCK_MODEL_ID'] as const;

function clearAwsEnv() {
  for (const key of AWS_ENV) delete process.env[key];
}

let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  clearAwsEnv();
  await truncateAll();
  await db.execute('truncate table templates cascade' as never);
  const actor = await createTestUser({ role: 'admin' });
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
});

afterEach(() => {
  setAiModelFactory(null);
  clearAwsEnv();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedFeature() {
  const [product] = await db
    .insert(products)
    .values({ name: 'ProductMap', vision: 'v', aboutMd: '' })
    .returning();
  const [feature] = await db
    .insert(features)
    .values({ productId: product.id, title: 'Rich markdown editor', horizon: 'now' })
    .returning();
  return feature;
}

const PRD_HINTS = 'Focus on user problems, success metrics, and crisp scope cuts.';
const PRD_BODY = '# {{title}}\n\n## Overview\n\n## Goals\n\n## Requirements';

async function seedTemplate(
  overrides: Partial<typeof templates.$inferInsert> = {},
): Promise<typeof templates.$inferSelect> {
  const [row] = await db
    .insert(templates)
    .values({
      type: 'prd',
      name: 'PRD',
      bodyJson: { type: 'doc', content: [] },
      bodyMd: PRD_BODY,
      promptHints: PRD_HINTS,
      isDefault: true,
      ...overrides,
    })
    .returning();
  return row;
}

interface Captured {
  system?: string;
  user?: string;
}

function makeMockModel(captured: Captured) {
  const deltas = ['# Rich markdown editor\n\n', '## Overview\n\nSome generated text.'];
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
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

describe('GET /api/ai/status', () => {
  it('returns enabled:false when no AWS credentials are configured', async () => {
    const res = await app.request('/api/ai/status', { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
  });

  it.each([
    ['AWS_REGION', 'us-east-1'],
    ['AWS_PROFILE', 'productmap'],
    ['AWS_ACCESS_KEY_ID', 'AKIATEST'],
  ])('returns enabled:true when %s is set', async (key, value) => {
    process.env[key] = value;
    const res = await app.request('/api/ai/status', { headers: auth });
    expect(await res.json()).toEqual({ enabled: true });
  });
});

describe('POST /api/ai/generate-doc', () => {
  it('503 when AI disabled', async () => {
    const feature = await seedFeature();
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ docType: 'prd', featureId: feature.id, brief: 'A great editor' }),
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('ai_disabled');
  });

  it('400 on invalid body', async () => {
    enableAi();
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ docType: 'nope', featureId: 'not-a-uuid', brief: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 on unknown feature', async () => {
    enableAi();
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({
        docType: 'prd',
        featureId: '00000000-0000-4000-8000-000000000000',
        brief: 'x',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('404 on unknown templateId', async () => {
    enableAi();
    const feature = await seedFeature();
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({
        docType: 'prd',
        featureId: feature.id,
        brief: 'x',
        templateId: '00000000-0000-4000-8000-000000000000',
      }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('template_not_found');
  });

  it('streams SSE chunk events then done, prompt assembled from the default DB template', async () => {
    const captured = enableAi();
    await seedTemplate();
    const feature = await seedFeature();
    const brief = 'An editor PMs will actually enjoy using';
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ docType: 'prd', featureId: feature.id, brief }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    const chunkEvents = text.match(/event: chunk/g) ?? [];
    expect(chunkEvents.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('event: done');
    // done comes after the last chunk
    expect(text.lastIndexOf('event: chunk')).toBeLessThan(text.indexOf('event: done'));
    // chunk data is JSON {text}
    const firstData = /event: chunk\ndata: (.*)\n/.exec(text)?.[1];
    expect(JSON.parse(firstData!)).toEqual({ text: '# Rich markdown editor\n\n' });

    // prompt assertions — DB template prompt_hints + skeleton (AC7)
    expect(captured.system).toContain('clean markdown');
    expect(captured.user).toContain(PRD_HINTS);
    expect(captured.user).toContain(PRD_BODY);
    expect(captured.user).toContain(brief);
    expect(captured.user).toContain('Rich markdown editor');
  });

  it('uses edited prompt_hints from the DB on the next generation (AC7)', async () => {
    const captured = enableAi();
    const tpl = await seedTemplate();
    const feature = await seedFeature();
    const editedHints = 'Always include an Open Questions section with at least three questions.';
    await db.update(templates).set({ promptHints: editedHints }).where(eq(templates.id, tpl.id));

    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ docType: 'prd', featureId: feature.id, brief: 'x' }),
    });
    expect(res.status).toBe(200);
    await res.text();
    expect(captured.user).toContain(editedHints);
    expect(captured.user).not.toContain(PRD_HINTS);
  });

  it('explicit templateId wins over the default template', async () => {
    const captured = enableAi();
    await seedTemplate(); // default PRD
    const custom = await seedTemplate({
      name: 'Lightweight PRD',
      isDefault: false,
      promptHints: 'Keep it under one page.',
      bodyMd: '# {{title}}\n\n## TL;DR',
    });
    const feature = await seedFeature();

    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({
        docType: 'prd',
        featureId: feature.id,
        brief: 'x',
        templateId: custom.id,
      }),
    });
    expect(res.status).toBe(200);
    await res.text();
    expect(captured.user).toContain('Keep it under one page.');
    expect(captured.user).toContain('## TL;DR');
    expect(captured.user).not.toContain(PRD_HINTS);
  });
});

describe('POST /api/ai/digest', () => {
  it('503 when AI disabled', async () => {
    const res = await app.request('/api/ai/digest', { method: 'POST', headers: auth });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('ai_disabled');
  });

  it('streams SSE chunks then done, prompting only with last-7-days activity', async () => {
    const captured = enableAi();
    const feature = await seedFeature();
    const [actor] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    await db.insert(activity).values([
      {
        featureId: feature.id,
        actorId: actor.id,
        kind: 'horizon_changed',
        payload: { from: 'later', to: 'now' },
        createdAt: daysAgo(2),
      },
      {
        featureId: feature.id,
        actorId: actor.id,
        kind: 'status_changed',
        payload: { from: 'idea', to: 'planned' },
        createdAt: daysAgo(30), // outside the 7-day window — must not appear
      },
    ]);

    const res = await app.request('/api/ai/digest', { method: 'POST', headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect((text.match(/event: chunk/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('event: done');

    expect(captured.system).toContain('digest');
    expect(captured.user).toContain('horizon_changed');
    expect(captured.user).toContain('Rich markdown editor');
    expect(captured.user).toContain('Corban');
    expect(captured.user).not.toContain('status_changed');
  });
});
