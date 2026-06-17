import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';

const { app } = await import('../app');
const { db } = await import('../db');
const { projects, features, documents, comments, users } = await import('@productmap/db');
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

interface Captured {
  system?: string;
  user?: string;
}

function makeMockModel(captured: Captured, deltas: string[]) {
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

function enableAi(deltas = ['## Problem clarity\n\n', 'Looks sharp.']) {
  const captured: Captured = {};
  process.env.AWS_REGION = 'us-east-1';
  setAiModelFactory(() => makeMockModel(captured, deltas));
  return captured;
}

async function seedProduct() {
  const [product] = await db
    .insert(projects)
    .values({ name: 'ProductMap', vision: 'v', aboutMd: '' })
    .returning();
  return product;
}

async function seedFeature(projectId: string, overrides: Record<string, unknown> = {}) {
  const [feature] = await db
    .insert(features)
    .values({ projectId, title: 'Rich markdown editor', horizon: 'now', ...overrides })
    .returning();
  return feature;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('POST /api/ai/review-doc', () => {
  it('503 when AI disabled', async () => {
    const res = await app.request('/api/ai/review-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ documentId: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('ai_disabled');
  });

  it('400 on invalid body', async () => {
    enableAi();
    const res = await app.request('/api/ai/review-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ documentId: 'not-a-uuid' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 on unknown document', async () => {
    enableAi();
    const res = await app.request('/api/ai/review-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ documentId: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(res.status).toBe(404);
  });

  it('streams SSE chunks then done; rubric prompt carries numbered doc content', async () => {
    const captured = enableAi();
    const product = await seedProduct();
    const feature = await seedFeature(product.id);
    const [doc] = await db
      .insert(documents)
      .values({
        featureId: feature.id,
        type: 'prd',
        title: 'Editor PRD',
        contentMd: '# Editor PRD\n\nWe want a nicer editor.\n\n## Goals\n\nFaster drafting.',
      })
      .returning();

    const res = await app.request('/api/ai/review-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ documentId: doc.id }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect((text.match(/event: chunk/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('event: done');
    expect(text.lastIndexOf('event: chunk')).toBeLessThan(text.indexOf('event: done'));
    const firstData = /event: chunk\ndata: (.*)\n/.exec(text)?.[1];
    expect(JSON.parse(firstData!)).toEqual({ text: '## Problem clarity\n\n' });

    // rubric in the system prompt
    for (const dimension of [
      'Problem clarity',
      'Measurable metrics',
      'Testable requirements',
      'Non-goals',
      'Risks',
    ]) {
      expect(captured.system).toContain(dimension);
    }
    // doc content with line numbers + identity in the user prompt
    expect(captured.user).toContain('Editor PRD');
    expect(captured.user).toContain('Rich markdown editor');
    expect(captured.user).toContain('1: # Editor PRD');
    expect(captured.user).toContain('5: ## Goals');
  });
});

describe('POST /api/ai/chat', () => {
  it('503 when AI disabled', async () => {
    const res = await app.request('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ question: 'What is shipping next?' }),
    });
    expect(res.status).toBe(503);
  });

  it('400 on empty question', async () => {
    enableAi();
    const res = await app.request('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ question: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('ranks full-text matches into the system context and streams SSE', async () => {
    const captured = enableAi(['Per the **Telemetry PRD**, ', 'exports run nightly.']);
    const product = await seedProduct();
    const feature = await seedFeature(product.id, { title: 'Telemetry pipeline', status: 'planned' });
    await db.insert(documents).values([
      {
        featureId: feature.id,
        type: 'prd',
        title: 'Telemetry PRD',
        contentMd:
          'Telemetry pipeline design. The telemetry pipeline batches telemetry events; the pipeline exports telemetry nightly. Telemetry pipeline retries on failure.',
      },
      {
        featureId: feature.id,
        type: 'tech_spec',
        title: 'Editor spec',
        contentMd:
          'The editor uses Tiptap with custom extensions. One day the telemetry pipeline may feed editor analytics, but the bulk of this spec covers toolbar layout, slash commands, tables, images and keyboard shortcuts in great detail.',
      },
      {
        featureId: feature.id,
        type: 'brd',
        title: 'Billing BRD',
        contentMd: 'Pricing tiers, invoicing cadence and tax handling for the billing system.',
      },
    ]);

    const res = await app.request('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ question: 'telemetry pipeline' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: chunk');
    expect(text).toContain('event: done');

    const system = captured.system!;
    // both matching docs retrieved, non-matching doc excluded
    expect(system).toContain('Telemetry PRD');
    expect(system).toContain('Editor spec');
    expect(system).not.toContain('Billing BRD');
    // ranked: heavy match before light match
    expect(system.indexOf('Telemetry PRD')).toBeLessThan(system.indexOf('Editor spec'));
    // feature summary present
    expect(system).toContain('Telemetry pipeline');
    expect(system).toContain('planned');
    // question goes in the user prompt
    expect(captured.user).toContain('telemetry pipeline');
  });

  it('caps retrieval at the top 8 documents', async () => {
    const captured = enableAi();
    const product = await seedProduct();
    const feature = await seedFeature(product.id);
    await db.insert(documents).values(
      Array.from({ length: 10 }, (_, i) => ({
        featureId: feature.id,
        type: 'prd' as const,
        title: `K-doc-${String(i + 1).padStart(2, '0')}`,
        contentMd: `${'kraken sighting. '.repeat(i + 1)}end of report.`,
      })),
    );

    const res = await app.request('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ question: 'kraken' }),
    });
    expect(res.status).toBe(200);
    await res.text();

    const system = captured.system!;
    expect(system).toContain('K-doc-10');
    expect(system).toContain('K-doc-03');
    expect(system).not.toContain('K-doc-02');
    expect(system).not.toContain('K-doc-01');
  });
});

describe('GET /api/copilot/nudges', () => {
  it('returns the four derived nudge kinds and excludes healthy rows', async () => {
    const product = await seedProduct();
    const [author] = await db.insert(users).values({ name: 'Mara', color: '#a3b18a' }).returning();

    // dateless_now hit + control (dated now-feature, dateless later-feature)
    const dateless = await seedFeature(product.id, { title: 'Dateless now feature' });
    const dated = await seedFeature(product.id, {
      title: 'Dated now feature',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    await seedFeature(product.id, { title: 'Later feature', horizon: 'later' });

    // oversized hit (l-size in now, no docs) + controls
    const oversized = await seedFeature(product.id, {
      title: 'Oversized feature',
      size: 'l',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    const largeWithDoc = await seedFeature(product.id, {
      title: 'Large but documented',
      size: 'l',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    await db.insert(documents).values({
      featureId: largeWithDoc.id,
      type: 'prd',
      title: 'Covered',
      contentMd: 'covered',
    });
    await seedFeature(product.id, {
      title: 'Medium now feature',
      size: 'm',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    // stale_draft hit (>14d) + controls (fresh draft, old final)
    const [staleDraft] = await db
      .insert(documents)
      .values({
        featureId: dated.id,
        type: 'prd',
        title: 'Stale draft PRD',
        status: 'draft',
        updatedAt: daysAgo(20),
      })
      .returning();
    await db.insert(documents).values([
      { featureId: dated.id, type: 'brd', title: 'Fresh draft', status: 'draft' },
      {
        featureId: dated.id,
        type: 'tech_spec',
        title: 'Old final',
        status: 'final',
        updatedAt: daysAgo(30),
      },
    ]);

    // stale_thread hits (feature + doc threads >7d) + controls
    const [staleFeatureComment] = await db
      .insert(comments)
      .values({
        authorId: author.id,
        featureId: dateless.id,
        body: 'Is this still planned?',
        createdAt: daysAgo(10),
      })
      .returning();
    const [staleDocComment] = await db
      .insert(comments)
      .values({
        authorId: author.id,
        documentId: staleDraft.id,
        body: 'Section 2 is unclear',
        createdAt: daysAgo(9),
      })
      .returning();
    await db.insert(comments).values([
      // recent root comment — excluded
      { authorId: author.id, featureId: dateless.id, body: 'fresh', createdAt: daysAgo(1) },
      // old but resolved — excluded
      {
        authorId: author.id,
        featureId: dateless.id,
        body: 'resolved',
        createdAt: daysAgo(12),
        resolvedAt: daysAgo(11),
        resolvedBy: author.id,
      },
      // old reply (non-root) — excluded
      {
        authorId: author.id,
        featureId: dateless.id,
        parentId: staleFeatureComment.id,
        body: 'reply',
        createdAt: daysAgo(9),
      },
    ]);

    const res = await app.request('/api/copilot/nudges', { headers: auth });
    expect(res.status).toBe(200);
    const nudges = await res.json();

    const byKind = (kind: string) => nudges.filter((n: { kind: string }) => n.kind === kind);

    expect(byKind('stale_draft')).toEqual([
      expect.objectContaining({
        kind: 'stale_draft',
        documentId: staleDraft.id,
        featureId: dated.id,
        title: 'Stale draft PRD',
      }),
    ]);

    expect(byKind('dateless_now')).toEqual([
      expect.objectContaining({ featureId: dateless.id, title: 'Dateless now feature' }),
    ]);

    expect(byKind('oversized')).toEqual([
      expect.objectContaining({ featureId: oversized.id, title: 'Oversized feature' }),
    ]);

    const staleThreads = byKind('stale_thread');
    expect(staleThreads).toHaveLength(2);
    expect(staleThreads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commentId: staleFeatureComment.id,
          featureId: dateless.id,
          documentId: null,
          title: 'Dateless now feature',
        }),
        expect.objectContaining({
          commentId: staleDocComment.id,
          featureId: null,
          documentId: staleDraft.id,
          title: 'Stale draft PRD',
        }),
      ]),
    );
  });

  it('works with AI disabled and returns [] for an empty workspace', async () => {
    const res = await app.request('/api/copilot/nudges', { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
