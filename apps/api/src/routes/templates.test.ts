// Integration tests for templates routes (workspace template manager).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { templates } from '@productmap/db/schema';
import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

let auth: Record<string, string> = {};

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await truncateAll();
  const actor = await createTestUser({ role: 'admin' });
  auth = { cookie: await authCookie(actor), origin: 'http://localhost', host: 'localhost' };
});

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json', ...auth },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const BODY_JSON = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '{{title}}' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello body.' }] },
  ],
};

async function createTemplate(overrides: Record<string, unknown> = {}) {
  const res = await app.request(
    '/api/templates',
    json('POST', { type: 'prd', name: 'My PRD', bodyJson: BODY_JSON, ...overrides }),
  );
  return res;
}

describe('POST /api/templates', () => {
  it('creates a template and derives body_md from bodyJson', async () => {
    const res = await createTemplate({ description: 'A PRD', promptHints: 'be terse' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('My PRD');
    expect(body.type).toBe('prd');
    expect(body.description).toBe('A PRD');
    expect(body.promptHints).toBe('be terse');
    expect(body.isDefault).toBe(false);
    expect(body.archivedAt).toBeNull();
    expect(body.bodyMd).toContain('# {{title}}');
    expect(body.bodyMd).toContain('Hello body.');
    expect(body.createdBy).toBeTruthy();
  });

  it('allows an empty body', async () => {
    const res = await app.request('/api/templates', json('POST', { type: 'brd', name: 'Empty' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bodyJson).toEqual({ type: 'doc', content: [] });
    expect(body.bodyMd).toBe('');
  });

  it('400 on invalid payload', async () => {
    expect((await app.request('/api/templates', json('POST', { type: 'nope', name: 'x' }))).status).toBe(400);
    expect((await app.request('/api/templates', json('POST', { type: 'prd', name: '' }))).status).toBe(400);
  });
});

describe('GET /api/templates', () => {
  it('orders defaults first then by name, filters by type, hides archived by default', async () => {
    const zeta = await (await createTemplate({ name: 'Zeta' })).json();
    await createTemplate({ name: 'Alpha' });
    await createTemplate({ name: 'Beta', type: 'brd' });
    const archived = await (await createTemplate({ name: 'Old' })).json();
    await app.request(`/api/templates/${zeta.id}/default`, json('POST'));
    await app.request(`/api/templates/${archived.id}/archive`, json('POST', { archived: true }));

    const res = await app.request('/api/templates?type=prd', { headers: auth });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.map((t: { name: string }) => t.name)).toEqual(['Zeta', 'Alpha']);

    const withArchived = await (await app.request('/api/templates?type=prd&includeArchived=true', { headers: auth })).json();
    expect(withArchived.map((t: { name: string }) => t.name)).toEqual(['Zeta', 'Alpha', 'Old']);

    const all = await (await app.request('/api/templates', { headers: auth })).json();
    expect(all).toHaveLength(3);
  });
});

describe('PATCH /api/templates/:id', () => {
  it('updates fields and re-derives body_md when bodyJson changes', async () => {
    const tpl = await (await createTemplate()).json();
    const res = await app.request(
      `/api/templates/${tpl.id}`,
      json('PATCH', {
        name: 'Renamed',
        description: 'new desc',
        promptHints: 'new hints',
        bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Changed.' }] }] },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Renamed');
    expect(body.description).toBe('new desc');
    expect(body.promptHints).toBe('new hints');
    expect(body.bodyMd).toBe('Changed.');
  });

  it('404 for unknown id', async () => {
    const res = await app.request(
      '/api/templates/00000000-0000-0000-0000-000000000000',
      json('PATCH', { name: 'x' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/templates/:id/duplicate', () => {
  it('copies the template with " copy" suffix and isDefault false', async () => {
    const tpl = await (await createTemplate({ promptHints: 'hints' })).json();
    await app.request(`/api/templates/${tpl.id}/default`, json('POST'));
    const res = await app.request(`/api/templates/${tpl.id}/duplicate`, json('POST'));
    expect(res.status).toBe(201);
    const copy = await res.json();
    expect(copy.name).toBe('My PRD copy');
    expect(copy.id).not.toBe(tpl.id);
    expect(copy.isDefault).toBe(false);
    expect(copy.bodyMd).toBe(tpl.bodyMd);
    expect(copy.promptHints).toBe('hints');
  });

  it('404 for unknown id', async () => {
    const res = await app.request(
      '/api/templates/00000000-0000-0000-0000-000000000000/duplicate',
      json('POST'),
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/templates/:id/default', () => {
  it('swaps the default within the type transactionally', async () => {
    const a = await (await createTemplate({ name: 'A' })).json();
    const b = await (await createTemplate({ name: 'B' })).json();
    const other = await (await createTemplate({ name: 'BRD', type: 'brd' })).json();
    await app.request(`/api/templates/${other.id}/default`, json('POST'));

    expect((await app.request(`/api/templates/${a.id}/default`, json('POST'))).status).toBe(204);
    let rows = await db.select().from(templates).where(eq(templates.isDefault, true));
    expect(rows.map((r) => r.id).sort()).toEqual([a.id, other.id].sort());

    expect((await app.request(`/api/templates/${b.id}/default`, json('POST'))).status).toBe(204);
    rows = await db.select().from(templates).where(eq(templates.isDefault, true));
    expect(rows.map((r) => r.id).sort()).toEqual([b.id, other.id].sort());
  });

  it('is a no-op when already default', async () => {
    const a = await (await createTemplate({ name: 'A' })).json();
    await app.request(`/api/templates/${a.id}/default`, json('POST'));
    expect((await app.request(`/api/templates/${a.id}/default`, json('POST'))).status).toBe(204);
    const [row] = await db.select().from(templates).where(eq(templates.id, a.id));
    expect(row.isDefault).toBe(true);
  });

  it('400 for archived templates, 404 for unknown', async () => {
    const a = await (await createTemplate({ name: 'A' })).json();
    await app.request(`/api/templates/${a.id}/archive`, json('POST', { archived: true }));
    expect((await app.request(`/api/templates/${a.id}/default`, json('POST'))).status).toBe(400);
    expect(
      (await app.request('/api/templates/00000000-0000-0000-0000-000000000000/default', json('POST'))).status,
    ).toBe(404);
  });
});

describe('POST /api/templates/:id/archive', () => {
  it('archives and restores a non-default template', async () => {
    const a = await (await createTemplate({ name: 'A' })).json();
    const res = await app.request(`/api/templates/${a.id}/archive`, json('POST', { archived: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).archivedAt).toBeTruthy();

    const restore = await app.request(`/api/templates/${a.id}/archive`, json('POST', { archived: false }));
    expect(restore.status).toBe(200);
    expect((await restore.json()).archivedAt).toBeNull();
  });

  it('400 when archiving the current default', async () => {
    const a = await (await createTemplate({ name: 'A' })).json();
    await app.request(`/api/templates/${a.id}/default`, json('POST'));
    const res = await app.request(`/api/templates/${a.id}/archive`, json('POST', { archived: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/default/i);
    // Still active.
    const [row] = await db.select().from(templates).where(eq(templates.id, a.id));
    expect(row.archivedAt).toBeNull();
  });

  it('400 on invalid body, 404 for unknown id', async () => {
    const a = await (await createTemplate({ name: 'A' })).json();
    expect((await app.request(`/api/templates/${a.id}/archive`, json('POST', {}))).status).toBe(400);
    expect(
      (
        await app.request(
          '/api/templates/00000000-0000-0000-0000-000000000000/archive',
          json('POST', { archived: true }),
        )
      ).status,
    ).toBe(404);
  });
});
