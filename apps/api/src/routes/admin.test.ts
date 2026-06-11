// Integration tests for POST /api/admin/reset-demo (truncate + reseed; dev only).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { users, products, features, documents, templates, activity } from '@productmap/db';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  process.env.NODE_ENV = 'test';
});

describe('POST /api/admin/reset-demo', () => {
  it('truncates and reseeds the demo workspace, including default templates', async () => {
    // Pre-existing junk that must be wiped.
    await db.insert(users).values({ name: 'Stale', color: '#9a5a3c' });

    const res = await app.request('/api/admin/reset-demo', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const userRows = await db.select().from(users);
    expect(userRows).toHaveLength(1);
    expect(userRows[0].name).toBe('Corban');

    expect(await db.select().from(products)).toHaveLength(1);
    expect(await db.select().from(features)).toHaveLength(8);
    expect(await db.select().from(documents)).toHaveLength(3);
    expect((await db.select().from(activity)).length).toBeGreaterThan(0);

    // 4 built-in templates, one default per doc type, {{title}} preserved.
    const tplRows = await db.select().from(templates);
    expect(tplRows).toHaveLength(4);
    expect(tplRows.every((t) => t.isDefault)).toBe(true);
    expect(new Set(tplRows.map((t) => t.type))).toEqual(
      new Set(['prd', 'brd', 'tech_spec', 'feature_brief']),
    );
    for (const t of tplRows) {
      expect(t.bodyMd).toContain('{{title}}');
      expect(JSON.stringify(t.bodyJson)).toContain('{{title}}');
      expect(t.promptHints.length).toBeGreaterThan(0);
    }
  });

  it('is idempotent — running twice leaves a single seed', async () => {
    await app.request('/api/admin/reset-demo', { method: 'POST' });
    await app.request('/api/admin/reset-demo', { method: 'POST' });
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(templates)).toHaveLength(4);
  });

  it('403 when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await app.request('/api/admin/reset-demo', { method: 'POST' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });
});
