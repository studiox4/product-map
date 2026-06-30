import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupTestDb, truncateAll, closeTestDb, createTestUser, authCookie,
} from './test/helpers';
import { Hono } from 'hono';
import { createCommunityProvider, type ServerPlugin } from '@productmap/sdk';
import { serverPlugins, installServerPlugins } from './plugins';
import { app } from './app';

beforeAll(async () => { await setupTestDb(); });
afterAll(async () => { await closeTestDb(); });
beforeEach(async () => { await truncateAll(); });

describe('plugin seam', () => {
  it('core boots with zero plugins: authed /api/ee/* is 404, core routes work', async () => {
    expect(serverPlugins.list()).toHaveLength(0);
    const user = await createTestUser({ role: 'member' });
    const headers = { cookie: await authCookie(user) };
    // Authed → passes requireAuth → no /api/ee route → notFound → 404.
    expect((await app.request('/api/ee/anything', { headers })).status).toBe(404);
    // Public route works without auth.
    expect((await app.request('/api/healthz')).status).toBe(200);
  });

  it('registerAll mounts a registered plugin under /api/ee/<name>', async () => {
    const fake: ServerPlugin = {
      name: 'fake',
      register: (a) => { a.get('/api/ee/fake/ping', (c) => c.json({ pong: true })); },
    };
    const probe = new Hono();
    serverPlugins.add(fake);
    serverPlugins.registerAll(probe, { entitlements: createCommunityProvider() });
    expect((await probe.request('/api/ee/fake/ping')).status).toBe(200);
  });
});
