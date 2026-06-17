import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';
import { app } from '../app';
import { db } from '../db';
import { projects } from '@productmap/db';

let projectId: string;
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
  const [p] = await db
    .insert(projects)
    .values({ name: 'ProductMap', vision: 'old vision', aboutMd: 'about' })
    .returning();
  projectId = p.id;
});

const patch = (body: unknown) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(body),
});

describe('PATCH /api/projects/:id', () => {
  it('updates vision', async () => {
    const res = await app.request(`/api/projects/${projectId}`, patch({ vision: 'new vision' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vision).toBe('new vision');
    expect(body.name).toBe('ProductMap');
    expect(body.aboutMd).toBe('about');
    expect(body.id).toBe(projectId);
  });

  it('updates name and aboutMd', async () => {
    const res = await app.request(
      `/api/projects/${projectId}`,
      patch({ name: 'PM2', aboutMd: 'changed' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('PM2');
    expect(body.aboutMd).toBe('changed');
    expect(body.vision).toBe('old vision');
  });

  it('400 on invalid body', async () => {
    const res = await app.request(`/api/projects/${projectId}`, patch({ name: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('404 on unknown id', async () => {
    const res = await app.request(
      '/api/projects/00000000-0000-4000-8000-000000000000',
      patch({ vision: 'x' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});
