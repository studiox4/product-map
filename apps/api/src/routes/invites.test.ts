import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject,
  addMembership, authCookie, createTestInvite,
} from '../test/helpers';
import { eq, and } from 'drizzle-orm';
import { memberships } from '@productmap/db';
import { app } from '../app';
import { db } from '../db';

beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);
const auth = async (u: { id: string; role: 'admin' | 'member' }) => ({ cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' });

async function membershipRole(userId: string, projectId: string) {
  const [m] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.projectId, projectId)));
  return m?.role ?? null;
}

describe('invites preview + accept', () => {
  it('GET /api/invites/:token previews project + role (no token internals)', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject('Acme');
    const inv = await createTestInvite({ projectId: p.id, createdBy: owner.id, role: 'editor' });
    const joiner = await createTestUser({ role: 'member' });
    const res = await app.request(`/api/invites/${inv.token}`, { headers: await auth(joiner) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ projectId: p.id, projectName: 'Acme', role: 'editor', expired: false });
  });

  it('accept → membership row with the embedded role', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const inv = await createTestInvite({ projectId: p.id, createdBy: owner.id, role: 'viewer' });
    const joiner = await createTestUser({ role: 'member' });
    const res = await app.request(`/api/invites/${inv.token}/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(res.status).toBe(200);
    expect(await membershipRole(joiner.id, p.id)).toBe('viewer');
  });

  it('accept is idempotent when already a member (keeps existing membership, 200)', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const inv = await createTestInvite({ projectId: p.id, createdBy: owner.id, role: 'viewer' });
    const joiner = await createTestUser({ role: 'member' });
    await addMembership(joiner.id, p.id, 'editor'); // already an editor
    const res = await app.request(`/api/invites/${inv.token}/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(res.status).toBe(200);
    // Does NOT downgrade an existing higher membership.
    expect(await membershipRole(joiner.id, p.id)).toBe('editor');
    // Response body role reflects the ACTUAL (editor) role, not the invite's (viewer) role.
    const body = await res.json();
    expect(body.role).toBe('editor');
  });

  it('expired invite → 410; revoked invite → 404; unknown token → 404', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const joiner = await createTestUser({ role: 'member' });
    const expired = await createTestInvite({ projectId: p.id, createdBy: owner.id, expiresInSec: -10 });
    const revoked = await createTestInvite({ projectId: p.id, createdBy: owner.id, revoked: true });

    const e = await app.request(`/api/invites/${expired.token}/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(e.status).toBe(410);
    const r = await app.request(`/api/invites/${revoked.token}/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(r.status).toBe(404);
    const u = await app.request(`/api/invites/does-not-exist/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(u.status).toBe(404);
  });

  it('email-bound invite: matching email accepts; wrong email rejected (403)', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const inv = await createTestInvite({ projectId: p.id, createdBy: owner.id, role: 'editor', email: 'invited@x.co' });

    const wrong = await createTestUser({ role: 'member', email: 'other@x.co' });
    const w = await app.request(`/api/invites/${inv.token}/accept`, { method: 'POST', headers: await auth(wrong) });
    expect(w.status).toBe(403);
    expect(await membershipRole(wrong.id, p.id)).toBeNull();

    const right = await createTestUser({ role: 'member', email: 'invited@x.co' });
    const ok = await app.request(`/api/invites/${inv.token}/accept`, { method: 'POST', headers: await auth(right) });
    expect(ok.status).toBe(200);
    expect(await membershipRole(right.id, p.id)).toBe('editor');
  });
});
