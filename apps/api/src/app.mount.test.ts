/**
 * Task A2 (SPIKE) — mount scaffold + method gate
 *
 * Proves that:
 *  1. viewer content GET  → 200 (gate allows viewer read)
 *  2. viewer content POST → 403 (gate blocks editor-required write)
 *  3. non-member GET      → 404 (gate hides project existence)
 *  4. mgmt GET /api/projects/:projectId → 200 for viewer
 *     (content mount does NOT shadow mgmt)
 *  5. mgmt POST /api/projects/:projectId/members → 403 for editor
 *     (method-gate does NOT leak onto mgmt; mgmt keeps its own owner-gate)
 *
 * The __probe routes in project-scoped.ts are spike scaffolding and will be
 * removed once objectives lands in A5.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupTestDb,
  truncateAll,
  closeTestDb,
  createTestUser,
  createTestProject,
  addMembership,
  authCookie,
} from './test/helpers';
import { app } from './app';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

// Helper: build headers for a member (includes origin for CSRF gate).
async function memberHeaders(
  user: { id: string; role: 'admin' | 'member' },
  extra?: Record<string, string>,
) {
  return {
    cookie: await authCookie(user),
    origin: 'http://localhost',
    host: 'localhost',
    ...extra,
  };
}

describe('A2 spike — mount scaffold + method gate', () => {
  let projectId: string;
  let viewerUser: { id: string; role: 'admin' | 'member' };
  let editorUser: { id: string; role: 'admin' | 'member' };
  let nonMember: { id: string; role: 'admin' | 'member' };

  beforeEach(async () => {
    await truncateAll();
    const project = await createTestProject('Spike Project');
    projectId = project.id;

    viewerUser = await createTestUser({ role: 'member' });
    editorUser = await createTestUser({ role: 'member' });
    nonMember = await createTestUser({ role: 'member' });

    await addMembership(viewerUser.id, projectId, 'viewer');
    await addMembership(editorUser.id, projectId, 'editor');
    // nonMember intentionally has no membership row
  });

  it('1. viewer content GET /__probe → 200 with pid', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/__probe`,
      { headers: await memberHeaders(viewerUser) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Confirm the param resolved and currentProjectId was set correctly
    expect(body.pid).toBe(projectId);
  });

  it('2. viewer content POST /__probe → 403 (editor required by method-gate, not forbidden_origin)', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/__probe`,
      {
        method: 'POST',
        headers: {
          ...await memberHeaders(viewerUser),
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    // Must be the membership role-gate's 'forbidden', NOT 'forbidden_origin' from the CSRF gate
    expect(body.error).toBe('forbidden');
  });

  it('3. non-member content GET /__probe → 404', async () => {
    const res = await app.request(
      `/api/projects/${projectId}/__probe`,
      { headers: await memberHeaders(nonMember) },
    );
    expect(res.status).toBe(404);
  });

  it('4. mgmt GET /api/projects/:projectId → 200 for viewer (content mount does NOT shadow mgmt)', async () => {
    const res = await app.request(
      `/api/projects/${projectId}`,
      { headers: await memberHeaders(viewerUser) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(projectId);
  });

  it('5. mgmt POST /api/projects/:projectId/members → 403 for editor (owner-gate intact, method-gate did NOT leak)', async () => {
    const anotherUser = await createTestUser({ role: 'member' });
    const res = await app.request(
      `/api/projects/${projectId}/members`,
      {
        method: 'POST',
        headers: {
          ...await memberHeaders(editorUser),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: anotherUser.email, role: 'viewer' }),
      },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    // Must be 'forbidden' from the mgmt owner-gate, NOT 'forbidden_origin'
    expect(body.error).toBe('forbidden');
  });
});
