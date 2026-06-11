import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from '@productmap/templates';

process.env.DATABASE_URL = 'postgres://localhost:5432/productmap_test';

const { app } = await import('../app');
const { db, pool } = await import('../db');
const { products, features, users, activity } = await import('@productmap/db');
const { setAiClientFactory } = await import('../lib/ai');
type AiClient = import('../lib/ai').AiClient;

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);

beforeAll(async () => {
  await migrate(db, { migrationsFolder });
});

beforeEach(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await db.execute('truncate table documents, features, products cascade' as never);
});

afterEach(() => {
  setAiClientFactory(null);
  delete process.env.ANTHROPIC_API_KEY;
});

afterAll(async () => {
  await pool.end();
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

function makeMockClient(captured: { params?: Record<string, unknown> }): AiClient {
  return {
    messages: {
      stream(params: Record<string, unknown>) {
        captured.params = params;
        return (async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: '# Rich markdown editor\n\n' },
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: '## Overview\n\nSome generated text.' },
          };
        })();
      },
    },
  } as unknown as AiClient;
}

describe('GET /api/ai/status', () => {
  it('returns enabled:false when ANTHROPIC_API_KEY unset', async () => {
    const res = await app.request('/api/ai/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
  });

  it('returns enabled:true when ANTHROPIC_API_KEY set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const res = await app.request('/api/ai/status');
    expect(await res.json()).toEqual({ enabled: true });
  });
});

describe('POST /api/ai/generate-doc', () => {
  it('503 when AI disabled', async () => {
    const feature = await seedFeature();
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docType: 'prd', featureId: feature.id, brief: 'A great editor' }),
    });
    expect(res.status).toBe(503);
  });

  it('400 on invalid body', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    setAiClientFactory(() => makeMockClient({}));
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docType: 'nope', featureId: 'not-a-uuid', brief: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 on unknown feature', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    setAiClientFactory(() => makeMockClient({}));
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        docType: 'prd',
        featureId: '00000000-0000-4000-8000-000000000000',
        brief: 'x',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('streams SSE chunk events then done, with full prompt passed to client', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const captured: { params?: Record<string, unknown> } = {};
    setAiClientFactory(() => makeMockClient(captured));

    const feature = await seedFeature();
    const brief = 'An editor PMs will actually enjoy using';
    const res = await app.request('/api/ai/generate-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

    // prompt assertions
    const params = captured.params!;
    expect(params.model).toBe('claude-sonnet-4-6');
    expect(params.max_tokens).toBe(4000);
    expect(params.system).toContain('clean markdown');
    const messages = params.messages as Array<{ role: string; content: string }>;
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain(TEMPLATES.prd.promptHints);
    expect(user).toContain(TEMPLATES.prd.markdownBody);
    expect(user).toContain(brief);
    expect(user).toContain('Rich markdown editor');
  });
});

describe('POST /api/ai/digest', () => {
  it('503 when AI disabled', async () => {
    const res = await app.request('/api/ai/digest', { method: 'POST' });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('ai_disabled');
  });

  it('streams SSE chunks then done, prompting only with last-7-days activity', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const captured: { params?: Record<string, unknown> } = {};
    setAiClientFactory(() => makeMockClient(captured));

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

    const res = await app.request('/api/ai/digest', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect((text.match(/event: chunk/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('event: done');

    const params = captured.params!;
    expect(params.model).toBe('claude-sonnet-4-6');
    expect(params.system).toContain('digest');
    const user = (params.messages as Array<{ role: string; content: string }>).find(
      (m) => m.role === 'user',
    )!.content;
    expect(user).toContain('horizon_changed');
    expect(user).toContain('Rich markdown editor');
    expect(user).toContain('Corban');
    expect(user).not.toContain('status_changed');
  });
});
