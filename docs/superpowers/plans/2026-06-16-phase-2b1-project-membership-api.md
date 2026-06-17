# Phase 2b-1 — Project & Membership API (foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `requireMembership` middleware, project CRUD, and member management (with super-admin override + last-owner guard) as **new endpoints** — without moving or breaking the existing flat routes (those get URL-nested in 2b-2).

**Architecture:** A `requireMembership(minRole)` middleware resolves `:projectId`, allows instance admins (super-admin) or members whose role meets the minimum, else 404 (non-member) / 403 (insufficient role). Project + member endpoints live in `routes/projects.ts`, mounted at `/api/projects` behind the existing global `requireAuth` gate. Roles rank `viewer<editor<owner`.

**Tech Stack:** Hono, Drizzle + Postgres, Zod (shared), Vitest. Builds on 2a (`projects`, `memberships` tables, `member_role` enum, `loadScoped`).

**Reference spec:** `docs/superpowers/specs/2026-06-16-phase-2-projects-membership-design.md` (§6 roles, §7 requireMembership, §8 project/member API). **Stage DoD:** new endpoints fully tested (CRUD, role matrix, super-admin, last-owner guard); existing flat routes untouched + still green; full suite + build + typecheck green. Additive only — no path moves.

**Branch:** `phase-2b1-project-membership-api` off `main`.

**Environment:** DB tests need Postgres on localhost:5432 → run with sandbox DISABLED (`dangerouslyDisableSandbox: true`) on `connect EPERM :5432`. Ignore `@productmap/db has no exported member` LSP noise (tsc is truth). Helpers in `apps/api/src/test/helpers.ts`: `setupTestDb`, `truncateAll`, `closeTestDb`, `createTestUser`, `createTestProject`, `addMembership`, `authCookie`.

---

## File Structure
- `packages/shared/src/schemas.ts` — add `projectCreate`, `memberAdd`, `memberUpdate` zod schemas.
- `packages/shared/src/constants.ts` — add `ROLE_RANK` (role hierarchy).
- `apps/api/src/middleware/membership.ts` (new) — `requireMembership(minRole)` + `MembershipEnv` + `effectiveRole` helper.
- `apps/api/src/routes/projects.ts` — expand: list/create/get/patch/delete + members sub-routes.
- Tests: `apps/api/src/routes/projects.test.ts` (already exists from 2a rename — extend), `apps/api/src/middleware/membership.test.ts` (new, via route-level tests is fine).

---

## Task 1: Shared schemas + role rank

**Files:** `packages/shared/src/constants.ts`, `schemas.ts`, test `schemas.test.ts`.

- [ ] **Step 1: failing test** (append to `packages/shared/src/schemas.test.ts`):
```ts
import { projectCreate, memberAdd, memberUpdate, ROLE_RANK } from './index';

describe('project/member schemas', () => {
  it('projectCreate requires a name', () => {
    expect(projectCreate.safeParse({ name: 'P' }).success).toBe(true);
    expect(projectCreate.safeParse({ name: '' }).success).toBe(false);
  });
  it('memberAdd needs userId or email + a role', () => {
    expect(memberAdd.safeParse({ userId: '00000000-0000-0000-0000-000000000000', role: 'editor' }).success).toBe(true);
    expect(memberAdd.safeParse({ email: 'a@b.co', role: 'viewer' }).success).toBe(true);
    expect(memberAdd.safeParse({ role: 'editor' }).success).toBe(false);
    expect(memberAdd.safeParse({ userId: 'x', role: 'boss' }).success).toBe(false);
  });
  it('ROLE_RANK orders viewer < editor < owner', () => {
    expect(ROLE_RANK.viewer < ROLE_RANK.editor && ROLE_RANK.editor < ROLE_RANK.owner).toBe(true);
  });
});
```

- [ ] **Step 2: run, confirm FAIL** — `pnpm --filter @productmap/shared exec vitest run src/schemas.test.ts`

- [ ] **Step 3:** add to `constants.ts`:
```ts
/** Project role hierarchy — higher rank ⊇ lower rank's capabilities. */
export const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 } as const;
```

- [ ] **Step 4:** add to `schemas.ts` (reuse existing `z` import; `MemberRole` values are `owner|editor|viewer`):
```ts
export const projectCreate = z.object({
  name: z.string().min(1).max(120),
  vision: z.string().max(2000).optional(),
  aboutMd: z.string().max(20000).optional(),
});

const role = z.enum(['owner', 'editor', 'viewer']);

export const memberAdd = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    role: role.default('editor'),
  })
  .refine((v) => !!v.userId || !!v.email, { message: 'userId or email required' });

export const memberUpdate = z.object({ role });
```

- [ ] **Step 5: run, confirm PASS.**

- [ ] **Step 6: commit**
```bash
git add packages/shared/src
git commit -m "feat(shared): projectCreate/memberAdd/memberUpdate schemas + ROLE_RANK"
```

---

## Task 2: `requireMembership` middleware

**Files:** Create `apps/api/src/middleware/membership.ts`. Tested via the route tests in Tasks 3-4 (it has no behavior without a route), plus a focused test here.

**Files:** Test `apps/api/src/middleware/membership.test.ts`.

- [ ] **Step 1: failing test** — exercises the middleware on a tiny throwaway Hono app:
```ts
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
```

- [ ] **Step 2: run, confirm FAIL** (no `./membership`): `pnpm --filter @productmap/api exec vitest run src/middleware/membership.test.ts` (sandbox off).

- [ ] **Step 3: implement `apps/api/src/middleware/membership.ts`:**
```ts
import { createMiddleware } from 'hono/factory';
import { and, eq } from 'drizzle-orm';
import { memberships } from '@productmap/db';
import { ROLE_RANK, type MemberRole } from '@productmap/shared';
import { db } from '../db';
import type { AuthEnv } from './auth';

export type MembershipEnv = AuthEnv & { Variables: { currentRole: MemberRole } };

/**
 * Gate a `:projectId` route. Allows instance admins (super-admin → effective
 * 'owner') and members whose role rank ≥ minRole. 404 for non-members (never
 * leak project existence); 403 for members with an insufficient role.
 * Sets `currentRole` (the effective role) for handlers. Must run after requireAuth.
 */
export function requireMembership(minRole: MemberRole) {
  return createMiddleware<MembershipEnv>(async (c, next) => {
    const user = c.get('currentUser');
    const projectId = c.req.param('projectId');
    if (!projectId) return c.json({ error: 'not_found' }, 404);

    if (user.role === 'admin') {
      c.set('currentRole', 'owner'); // super-admin
      await next();
      return;
    }
    const [m] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.projectId, projectId)))
      .limit(1);
    if (!m) return c.json({ error: 'not_found' }, 404);
    if (ROLE_RANK[m.role] < ROLE_RANK[minRole]) return c.json({ error: 'forbidden' }, 403);
    c.set('currentRole', m.role);
    await next();
  });
}
```

- [ ] **Step 4: run, confirm PASS (4 tests)** (sandbox off).

- [ ] **Step 5: typecheck** `pnpm --filter @productmap/api exec tsc -p tsconfig.json --noEmit` → 0.

- [ ] **Step 6: commit**
```bash
git add apps/api/src/middleware/membership.ts apps/api/src/middleware/membership.test.ts
git commit -m "feat(api): requireMembership middleware (super-admin override, 404 non-member)"
```

---

## Task 3: Project CRUD endpoints

**Files:** `apps/api/src/routes/projects.ts` (expand), `routes/projects.test.ts` (extend). The router is already mounted at `/api/projects` in `app.ts`.

- [ ] **Step 1: failing tests** (append to `projects.test.ts`; use the helpers + auth pattern other route tests use):
```ts
import { createTestUser, createTestProject, addMembership, authCookie } from '../test/helpers';

const auth = async (u: { id: string; role: 'admin' | 'member' }) => ({ cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' });
const json = (method: string, body: unknown, h: Record<string, string>) => ({ method, headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) });

describe('project CRUD', () => {
  it('POST /api/projects creates a project with the creator as owner', async () => {
    const u = await createTestUser({ role: 'member' });
    const res = await app.request('/api/projects', json('POST', { name: 'New' }, await auth(u)));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('New'); expect(body.role).toBe('owner');
  });
  it('GET /api/projects lists only the caller’s projects (super-admin sees all)', async () => {
    const a = await createTestUser({ role: 'member' });
    const b = await createTestUser({ role: 'member' });
    const pa = await createTestProject('A'); await addMembership(a.id, pa.id, 'owner');
    const pb = await createTestProject('B'); await addMembership(b.id, pb.id, 'owner');
    const resA = await app.request('/api/projects', { headers: await auth(a) });
    expect((await resA.json()).map((p: any) => p.name)).toEqual(['A']);
    const admin = await createTestUser({ role: 'admin' });
    const resAdmin = await app.request('/api/projects', { headers: await auth(admin) });
    expect((await resAdmin.json()).length).toBeGreaterThanOrEqual(2); // sees all
  });
  it('PATCH /api/projects/:id requires owner; editor gets 403', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'editor');
    const res = await app.request(`/api/projects/${p.id}`, json('PATCH', { name: 'X' }, await auth(u)));
    expect(res.status).toBe(403);
  });
  it('DELETE /api/projects/:id (owner) removes it', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'owner');
    const res = await app.request(`/api/projects/${p.id}`, { method: 'DELETE', headers: await auth(u) });
    expect(res.status).toBe(204);
  });
  it('non-member GET /api/projects/:id → 404', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    const res = await app.request(`/api/projects/${p.id}`, { headers: await auth(u) });
    expect(res.status).toBe(404);
  });
});
```
(If `projects.test.ts` doesn't import `app`, add `import { app } from '../app';` + the vitest setup hooks used by other route tests — copy the `beforeAll(setupTestDb)/afterAll/beforeEach(truncateAll)` block.)

- [ ] **Step 2: run, confirm FAIL** (sandbox off).

- [ ] **Step 3: implement** — replace `routes/projects.ts` with the expanded router. Keep it mounted at `/api/projects` (so paths are `/`, `/:id`, etc.):
```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray } from 'drizzle-orm';
import { projectCreate, projectUpdate } from '@productmap/shared';
import { projects, memberships } from '@productmap/db';
import { db } from '../db';
import { requireMembership, type MembershipEnv } from '../middleware/membership';

const bad = (r: { success: boolean; error?: { issues: unknown } }, c: any) =>
  r.success ? undefined : c.json({ error: 'validation', issues: r.error!.issues }, 400);

export const projectsRoutes = new Hono<MembershipEnv>()
  // List: caller's projects (super-admin: all), each with the caller's effective role.
  .get('/', async (c) => {
    const user = c.get('currentUser');
    if (user.role === 'admin') {
      const rows = await db.select().from(projects);
      return c.json(rows.map((p) => ({ id: p.id, name: p.name, vision: p.vision, aboutMd: p.aboutMd, role: 'owner' as const })));
    }
    const rows = await db
      .select({ id: projects.id, name: projects.name, vision: projects.vision, aboutMd: projects.aboutMd, role: memberships.role })
      .from(memberships)
      .innerJoin(projects, eq(projects.id, memberships.projectId))
      .where(eq(memberships.userId, user.id));
    return c.json(rows);
  })
  // Create: creator becomes owner (atomic).
  .post('/', zValidator('json', projectCreate, bad), async (c) => {
    const user = c.get('currentUser');
    const input = c.req.valid('json');
    const project = await db.transaction(async (tx) => {
      const [p] = await tx.insert(projects).values({ name: input.name, vision: input.vision ?? '', aboutMd: input.aboutMd ?? '' }).returning();
      await tx.insert(memberships).values({ userId: user.id, projectId: p.id, role: 'owner' });
      return p;
    });
    return c.json({ id: project.id, name: project.name, vision: project.vision, aboutMd: project.aboutMd, role: 'owner' as const }, 201);
  })
  .get('/:projectId', requireMembership('viewer'), async (c) => {
    const [p] = await db.select().from(projects).where(eq(projects.id, c.req.param('projectId')));
    if (!p) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: p.id, name: p.name, vision: p.vision, aboutMd: p.aboutMd, role: c.get('currentRole') });
  })
  .patch('/:projectId', requireMembership('owner'), zValidator('json', projectUpdate, bad), async (c) => {
    const [row] = await db.update(projects).set(c.req.valid('json')).where(eq(projects.id, c.req.param('projectId'))).returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, name: row.name, vision: row.vision, aboutMd: row.aboutMd });
  })
  .delete('/:projectId', requireMembership('owner'), async (c) => {
    await db.delete(projects).where(eq(projects.id, c.req.param('projectId')));
    return c.body(null, 204);
  });
```
**Important:** the existing `PATCH /:id` (param was `:id`) becomes `PATCH /:projectId` so `requireMembership` (which reads `:projectId`) works. If the web client calls `PATCH /api/projects/:id` it still matches (path param name is internal). Keep `projectUpdate` for PATCH (partial), `projectCreate` for POST.

- [ ] **Step 4: run, confirm PASS** (sandbox off). Existing `projects.test.ts` PATCH tests from 2a: update them to add an owner membership + auth (the PATCH is now owner-gated) so they pass.

- [ ] **Step 5: typecheck + the existing suite for this file green.**

- [ ] **Step 6: commit**
```bash
git add apps/api/src/routes/projects.ts apps/api/src/routes/projects.test.ts
git commit -m "feat(api): project CRUD (list/create/get/patch/delete) with membership + super-admin"
```

---

## Task 4: Member management endpoints + last-owner guard

**Files:** `apps/api/src/routes/projects.ts` (add member sub-routes), `projects.test.ts` (extend).

- [ ] **Step 1: failing tests** (append):
```ts
describe('project members', () => {
  it('owner lists, adds, changes role, and removes members', async () => {
    const owner = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const target = await createTestUser({ role: 'member', email: 't@x.co' });
    const h = await auth(owner);

    const add = await app.request(`/api/projects/${p.id}/members`, json('POST', { userId: target.id, role: 'editor' }, h));
    expect(add.status).toBe(201);

    const list = await app.request(`/api/projects/${p.id}/members`, { headers: h });
    expect((await list.json()).length).toBe(2);

    const patch = await app.request(`/api/projects/${p.id}/members/${target.id}`, json('PATCH', { role: 'viewer' }, h));
    expect(patch.status).toBe(200);

    const del = await app.request(`/api/projects/${p.id}/members/${target.id}`, { method: 'DELETE', headers: h });
    expect(del.status).toBe(204);
  });
  it('cannot demote or remove the last owner', async () => {
    const owner = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    const demote = await app.request(`/api/projects/${p.id}/members/${owner.id}`, json('PATCH', { role: 'editor' }, h));
    expect(demote.status).toBe(409);
    const remove = await app.request(`/api/projects/${p.id}/members/${owner.id}`, { method: 'DELETE', headers: h });
    expect(remove.status).toBe(409);
  });
  it('editor cannot manage members (403)', async () => {
    const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
    await addMembership(u.id, p.id, 'editor');
    const res = await app.request(`/api/projects/${p.id}/members`, json('POST', { email: 'z@x.co', role: 'viewer' }, await auth(u)));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: run, confirm FAIL.**

- [ ] **Step 3: implement** — add member sub-routes to the `projectsRoutes` chain in `projects.ts` (import `memberAdd`, `memberUpdate` from shared, `users` from db, `publicUser`/a member serializer). Add a `countOwners` helper + last-owner guard:
```ts
// add imports: memberAdd, memberUpdate from '@productmap/shared'; users from '@productmap/db'

  .get('/:projectId/members', requireMembership('viewer'), async (c) => {
    const rows = await db
      .select({ userId: memberships.userId, role: memberships.role, name: users.name, color: users.color })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.projectId, c.req.param('projectId')));
    return c.json(rows);
  })
  .post('/:projectId/members', requireMembership('owner'), zValidator('json', memberAdd, bad), async (c) => {
    const projectId = c.req.param('projectId');
    const input = c.req.valid('json');
    let userId = input.userId ?? null;
    if (!userId && input.email) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
      if (!u) return c.json({ error: 'user_not_found' }, 404);
      userId = u.id;
    }
    if (!userId) return c.json({ error: 'validation' }, 400);
    await db.insert(memberships).values({ userId, projectId, role: input.role })
      .onConflictDoUpdate({ target: [memberships.userId, memberships.projectId], set: { role: input.role } });
    return c.json({ userId, projectId, role: input.role }, 201);
  })
  .patch('/:projectId/members/:userId', requireMembership('owner'), zValidator('json', memberUpdate, bad), async (c) => {
    const projectId = c.req.param('projectId');
    const userId = c.req.param('userId');
    const { role } = c.req.valid('json');
    if (role !== 'owner' && (await isLastOwner(projectId, userId))) return c.json({ error: 'last_owner' }, 409);
    const [row] = await db.update(memberships).set({ role })
      .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId))).returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ userId, projectId, role });
  })
  .delete('/:projectId/members/:userId', requireMembership('owner'), async (c) => {
    const projectId = c.req.param('projectId');
    const userId = c.req.param('userId');
    if (await isLastOwner(projectId, userId)) return c.json({ error: 'last_owner' }, 409);
    await db.delete(memberships).where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId)));
    return c.body(null, 204);
  });
```
Add the helper (module scope in projects.ts):
```ts
import { sql } from 'drizzle-orm';
/** True if removing/demoting (projectId,userId) would leave the project with zero owners. */
async function isLastOwner(projectId: string, userId: string): Promise<boolean> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.role, 'owner')));
  if (count > 1) return false;
  const [target] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId)));
  return target?.role === 'owner';
}
```

- [ ] **Step 4: run, confirm PASS** (sandbox off).

- [ ] **Step 5: typecheck + full suite** (sandbox off) → green.

- [ ] **Step 6: commit**
```bash
git add apps/api/src/routes/projects.ts apps/api/src/routes/projects.test.ts
git commit -m "feat(api): project member management + last-owner guard"
```

---

## Final verification (stage 2b-1 DoD)
- [ ] `pnpm --filter @productmap/api exec tsc -p tsconfig.json --noEmit` → 0; web tsc → 0.
- [ ] `pnpm test` (sandbox off) → all green (api count grows with new tests; web/shared/templates unchanged).
- [ ] `pnpm build` → clean.
- [ ] Existing flat routes (`/api/features`, etc.) untouched + still green — confirms additivity.
- [ ] Manual: `POST /api/projects` (member) → 201 owner; non-member `GET /api/projects/:id` → 404; editor `PATCH` → 403; last-owner demote → 409; super-admin lists all.

## Notes for the executor
- **Additive only:** do NOT move/rename existing flat route paths or wire `loadScoped` into them — that's 2b-2.
- The existing `PATCH /api/projects/:id` becomes owner-gated; update its 2a tests to add an owner membership + auth.
- `requireMembership` reads `:projectId`; ensure project routes use `:projectId` (not `:id`) as the param name.
- Web client untouched in 2b-1 (it still uses flat routes + the single project); switcher/settings UI is 2c.
