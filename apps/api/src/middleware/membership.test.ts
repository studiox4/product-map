import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireAuth } from './auth';
import { requireMembership, type MembershipEnv } from './membership';

const app = new Hono<MembershipEnv>()
  .use('/p/:projectId/*', requireAuth as never)
  .get('/p/:projectId/x', requireMembership('viewer'), (c) => c.json({ role: c.get('currentRole') }))
  .post('/p/:projectId/x', requireMembership('editor'), (c) => c.json({ ok: true }));

beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);
const hdrs = async (u: { id: string; role: 'admin' | 'member' }) => ({ cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' });

describe('requireMembership', () => {
  it('member with sufficient role passes; exposes currentRole', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'editor');
    const res = await app.request(`/p/${p.id}/x`, { headers: await hdrs(u) });
    expect(res.status).toBe(200); expect((await res.json()).role).toBe('editor');
  });
  it('non-member gets 404 (no existence leak)', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    const res = await app.request(`/p/${p.id}/x`, { headers: await hdrs(u) });
    expect(res.status).toBe(404);
  });
  it('insufficient role gets 403', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'viewer');
    const res = await app.request(`/p/${p.id}/x`, { method: 'POST', headers: { ...(await hdrs(u)), 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });
  it('instance admin (super-admin) passes without a membership row, as owner', async () => {
    const admin = await createTestUser({ role: 'admin' }); const p = await createTestProject();
    const res = await app.request(`/p/${p.id}/x`, { headers: await hdrs(admin) });
    expect(res.status).toBe(200); expect((await res.json()).role).toBe('owner');
  });
});
