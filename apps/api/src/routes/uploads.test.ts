// Integration tests for uploads route (Task 2B).
// helpers must be imported before ../app so DATABASE_URL points at productmap_test.
import { setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie } from '../test/helpers';
import { app } from '../app';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

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

function makeForm(bytes: Buffer | Uint8Array, mime: string, name = 'pixel.png'): FormData {
  const form = new FormData();
  form.append('file', new File([Uint8Array.from(bytes)], name, { type: mime }));
  return form;
}

describe('POST /api/uploads', () => {
  it('accepts a png and returns 201 {id,url}; stored bytes match', async () => {
    const res = await app.request('/api/uploads', { method: 'POST', headers: auth, body: makeForm(PNG_BYTES, 'image/png') });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.url).toMatch(/^\/uploads\/[A-Za-z0-9_-]+\.png$/);

    // Bytes on disk match what we sent.
    const stored = path.join(repoRoot, body.url.replace(/^\//, ''));
    const onDisk = await readFile(stored);
    expect(Buffer.compare(onDisk, PNG_BYTES)).toBe(0);

    // Served via static middleware (same config as apps/api/src/index.ts).
    const staticApp = new Hono().use(
      '/uploads/*',
      serveStatic({ root: path.relative(process.cwd(), repoRoot) || '.' }),
    );
    const served = await staticApp.request(body.url);
    expect(served.status).toBe(200);
    const servedBytes = Buffer.from(await served.arrayBuffer());
    expect(Buffer.compare(servedBytes, PNG_BYTES)).toBe(0);
  });

  it('rejects disallowed mime types with 400', async () => {
    const res = await app.request('/api/uploads', {
      method: 'POST',
      headers: auth,
      body: makeForm(Buffer.from('hello'), 'text/plain', 'notes.txt'),
    });
    expect(res.status).toBe(400);
  });

  it('rejects files over 10MB with 413', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    const res = await app.request('/api/uploads', { method: 'POST', headers: auth, body: makeForm(big, 'image/png', 'big.png') });
    expect(res.status).toBe(413);
  });

  it('rejects a missing file field with 400', async () => {
    const form = new FormData();
    form.append('documentId', 'not-a-file');
    const res = await app.request('/api/uploads', { method: 'POST', headers: auth, body: form });
    expect(res.status).toBe(400);
  });
});
