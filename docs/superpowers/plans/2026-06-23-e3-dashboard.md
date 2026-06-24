# E3 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a user-scoped, cross-project Dashboard at the `/app` index that surfaces next actions, favorited/member projects with status rollups, my work, and a cross-project activity feed.

**Architecture:** One new user-scoped endpoint `GET /api/dashboard` (auth-only, spans projects) aggregates everything with a bounded set of set-based queries. Per-user pins live in a new `project_favorites` join table (admin-safe — admins have no membership row). Projects gain a unique `slug`; the existing single-project overview moves to `/app/p/:slug`. `activity` gains a denormalized `projectId` so the cross-project feed is queryable; all writes route through the existing `recordActivity` helper.

**Tech Stack:** Hono 4 + Drizzle ORM (Postgres) on the API; React 18 + React Router 6 + TanStack Query 5 + shadcn/Tailwind on the web; Vitest + MSW for tests.

**Spec:** `docs/superpowers/specs/2026-06-23-e3-dashboard-design.md` (read §7a strong goals before starting).

## Global Constraints

- **In-app paths** go through `apps/web/src/lib/routes.ts` (`appRoutes`) — never raw string literals (CI grep gate enforces it).
- **Activity writes** go through `recordActivity` in `apps/api/src/lib/activity.ts` — never a raw `db.insert(activity)` in route code (a few legacy raw inserts in `ideas.ts`/`plans.ts` get migrated in Task 1).
- **Dashboard project set** = projects the user is a member of ∪ projects the user has favorited. Same rule for admins (no "all projects" for admins on the dashboard).
- **No N+1:** `/api/dashboard` must be a fixed ≤~6 set-based queries regardless of project/feature count.
- **Migration safety:** backfill to zero nulls BEFORE every `SET NOT NULL`.
- **Slug format:** lowercase kebab, `^[a-z0-9]+(-[a-z0-9]+)*$`, max 60 chars, globally unique.
- **Types:** one shared `DashboardResponse` in `packages/shared/src/api-types.ts` drives server + client. `pnpm -r typecheck` and `pnpm -r build` must pass.
- **Test DB:** `productmap_test`; tests import `../test/helpers` BEFORE `../app`. Auth header shape: `{ cookie: await authCookie(user), origin: 'http://localhost', host: 'localhost' }`.
- **Run a single API test:** `pnpm --filter @productmap/api test -- <file> -t "<name>"`. Full suite: `pnpm -r test`.

---

## File Structure

**Create:**
- `apps/api/src/routes/dashboard.ts` — `GET /api/dashboard` aggregator.
- `apps/api/src/routes/dashboard.test.ts` — endpoint + isolation tests.
- `apps/api/src/lib/slug.ts` — `slugify` + `uniqueSlug` helpers.
- `apps/api/src/lib/slug.test.ts` — slug unit tests.
- `apps/api/src/routes/favorites.test.ts` — favorite toggle tests.
- `apps/web/src/routes/Dashboard.tsx` — the page.
- `apps/web/src/components/dashboard/NextActions.tsx`, `MyProjects.tsx`, `MyWork.tsx`, `DashboardFeed.tsx` — sub-components.
- `apps/web/src/routes/Dashboard.test.tsx` — page render + empty-state + favorite tests.
- `apps/web/src/routes/ProjectOverview.tsx` — slug-resolving wrapper around the existing Landing.
- `packages/db/migrations/0014_*.sql` — generated then hand-edited.

**Modify:**
- `packages/db/src/schema.ts` — add `projectFavorites`, `projects.slug`, `activity.projectId`.
- `packages/shared/src/api-types.ts` — `DashboardResponse` + sub-types; add `slug` to `Project`.
- `apps/api/src/app.ts` — register `dashboardRoutes`.
- `apps/api/src/lib/activity.ts` — `recordActivity` gains `projectId`.
- `apps/api/src/routes/{features,documents,comments,decisions,deps,releases,ideas,plans}.ts` — pass projectId to `recordActivity` / migrate raw inserts.
- `apps/api/src/routes/projects.ts` — favorite endpoints; slug in create/patch/list payloads.
- `apps/api/src/routes/activity.ts` — (optional) read via `activity.projectId`.
- `apps/web/src/lib/api.ts` — `useDashboard`, `useToggleFavorite`, `queryKeys.dashboard`.
- `apps/web/src/lib/project.tsx` — `ProjectListItem`/`useProjects` carry `slug` + `favorite`.
- `apps/web/src/lib/routes.ts` — `appRoutes.projectOverview(slug)`.
- `apps/web/src/App.tsx` — add `/app/p/:slug` route.
- `apps/web/src/components/AppShell.tsx` — Dashboard + Overview nav.
- `apps/web/src/components/settings/ProjectTab.tsx` — editable slug field.

---

## Task 0 — Foundation (SERIAL, first; everything depends on it)

Lands schema + migration + frozen shared types + route skeleton + queryKeys, then commits. **Do not fan out other tasks until this is committed.**

**Files:**
- Modify: `packages/db/src/schema.ts`, `packages/shared/src/api-types.ts`, `apps/api/src/app.ts`, `apps/web/src/lib/api.ts`
- Create: `packages/db/migrations/0014_*.sql`, `apps/api/src/routes/dashboard.ts` (skeleton)

**Interfaces — Produces (later tasks consume these exact names/types):**
```ts
// packages/db/src/schema.ts
projectFavorites: { userId, projectId, createdAt }  // PK (userId, projectId)
projects.slug: text (unique, not null)
activity.projectId: uuid (not null, FK projects, cascade)

// packages/shared/src/api-types.ts
interface Project { id; name; slug; vision; aboutMd; }   // slug ADDED
interface DashboardProject {
  id: string; name: string; slug: string;
  role: 'owner'|'editor'|'viewer'; favorite: boolean;
  counts: { idea: number; planned: number; in_progress: number; shipped: number };
  nextRelease: { id: string; name: string; date: string | null } | null;
  staleCount: number;
}
type NextAction =
  | { kind:'open_comment'; source:'authored'|'collaborating'; projectId:string; projectSlug:string; featureId?:string; documentId?:string; title:string; count:number }
  | { kind:'doc_in_review'; projectId:string; projectSlug:string; documentId:string; featureId:string; title:string; docType:string }
  | { kind:'feature_missing_dates'; projectId:string; projectSlug:string; featureId:string; title:string };
interface MyWorkItem { featureId:string; projectId:string; projectSlug:string; title:string; status:string; horizon:string; }
interface DashboardActivityItem extends WorkspaceActivityItem { projectId:string; projectSlug:string; }
interface DashboardResponse { projects: DashboardProject[]; nextActions: NextAction[]; myWork: MyWorkItem[]; activity: DashboardActivityItem[]; }
```

- [ ] **Step 1: Update `packages/db/src/schema.ts`**

Add `slug` to `projects` (line ~44), add `projectId` to `activity` (line ~119), and add a new `projectFavorites` table after `memberships`. Use the existing imports (`pgTable`, `uuid`, `text`, `timestamp`, `primaryKey`, `index`).

```ts
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  vision: text('vision').notNull().default(''),
  aboutMd: text('about_md').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projectFavorites = pgTable(
  'project_favorites',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);

export const activity = pgTable('activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('activity_project_id_idx').on(t.projectId)]);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @productmap/db exec drizzle-kit generate`
Expected: a new `packages/db/migrations/0014_*.sql` + updated `meta/_journal.json`. It will `ADD COLUMN ... NOT NULL` directly — that fails on existing rows, so edit it next.

- [ ] **Step 3: Hand-edit the generated `0014_*.sql` for safe backfill**

Replace the generated body with add-nullable → backfill → set-not-null ordering (keep the `meta/_journal.json` entry drizzle-kit created):

```sql
-- project_favorites
CREATE TABLE "project_favorites" (
  "user_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_favorites_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
ALTER TABLE "project_favorites" ADD CONSTRAINT "project_favorites_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "project_favorites" ADD CONSTRAINT "project_favorites_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;

-- projects.slug: add nullable, backfill, dedupe, then enforce
ALTER TABLE "projects" ADD COLUMN "slug" text;
UPDATE "projects" SET "slug" =
  regexp_replace(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g');
UPDATE "projects" SET "slug" = 'project' WHERE "slug" IS NULL OR "slug" = '';
-- de-duplicate: suffix collisions with -2, -3, ... by creation order
WITH ranked AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
  FROM "projects"
)
UPDATE "projects" p SET "slug" = p."slug" || '-' || r.rn
  FROM ranked r WHERE p.id = r.id AND r.rn > 1;
ALTER TABLE "projects" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_unique" UNIQUE("slug");

-- activity.projectId: add nullable, backfill from features, enforce
ALTER TABLE "activity" ADD COLUMN "project_id" uuid;
UPDATE "activity" a SET "project_id" = f."project_id" FROM "features" f WHERE a."feature_id" = f.id;
ALTER TABLE "activity" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
CREATE INDEX "activity_project_id_idx" ON "activity" ("project_id");
```

- [ ] **Step 4: Apply + verify migration on test DB**

Run: `pnpm --filter @productmap/api test -- src/routes/activity.test.ts` (its `setupTestDb` runs all migrations; green = migration applies clean). Also run `pnpm --filter @productmap/db exec drizzle-kit migrate` against dev if a dev DB exists.
Expected: migration runs with zero errors; existing activity tests still pass.

- [ ] **Step 5: Add shared types**

In `packages/shared/src/api-types.ts`: add `slug: string;` to `interface Project` (line ~7), and append the `DashboardProject` / `NextAction` / `MyWorkItem` / `DashboardActivityItem` / `DashboardResponse` block from the Interfaces section above. Ensure they're re-exported from `index.ts` if it uses an explicit export list (check and add).

- [ ] **Step 6: Route skeleton + registration**

Create `apps/api/src/routes/dashboard.ts`:
```ts
import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';

// GET /api/dashboard — user-scoped cross-project home. Filled in Task 3.
export const dashboardRoutes = new Hono<AuthEnv>().get('/', async (c) => {
  return c.json({ projects: [], nextActions: [], myWork: [], activity: [] });
});
```
(If `AuthEnv` isn't the exported env type from `middleware/auth.ts`, use the type that exposes `c.get('currentUser')` — grep `middleware/auth.ts` for the exported `*Env` type and match it.)

In `apps/api/src/app.ts`: import `dashboardRoutes` and register it among the auth-gated mounts (after `.route('/api/users', usersRoutes)`), e.g. `.route('/api/dashboard', dashboardRoutes)`. It sits behind the existing `/api/*` `requireAuth` middleware automatically.

- [ ] **Step 7: queryKeys + Project type propagation**

In `apps/web/src/lib/api.ts` `queryKeys` object: add `dashboard: ['dashboard'] as const,`.
In `apps/web/src/lib/project.tsx`: extend `ProjectListItem` to `extends Project` already carries `slug` now; add `favorite: boolean` to it (`export interface ProjectListItem extends Project { role: MemberRole; favorite: boolean; }`). (Server side wired in Task 2/4.)

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm -r typecheck`
Expected: PASS (skeleton returns the right shape; no consumers yet).
```bash
git add packages/db packages/shared apps/api/src/routes/dashboard.ts apps/api/src/app.ts apps/web/src/lib/api.ts apps/web/src/lib/project.tsx
git commit -m "feat(dashboard): foundation — schema, migration, shared types, route skeleton"
```

---

## Task 1 — Activity write-path carries projectId (after Task 0)

**Files:**
- Modify: `apps/api/src/lib/activity.ts`, and every caller listed in Global Constraints.
- Test: `apps/api/src/lib/activity.test.ts` (create) + existing `features.test.ts` stays green.

**Interfaces — Consumes:** `activity.projectId` (Task 0). **Produces:** `recordActivity(featureId, projectId, actorId, kind, payload?)`.

- [ ] **Step 1: Failing test for the new signature**

Create `apps/api/src/lib/activity.test.ts`:
```ts
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject } from '../test/helpers';
import { recordActivity } from './activity';
import { db } from '../db';
import { features, activity } from '@productmap/db/schema';
import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);

it('writes projectId alongside the activity row', async () => {
  const actor = await createTestUser({ role: 'admin' });
  const pid = await createTestProject('P');
  const [f] = await db.insert(features).values({ projectId: pid, title: 'F', horizon: 'now' }).returning();
  await recordActivity(f.id, pid, actor.id, 'feature_created', { to: 'F' });
  const [row] = await db.select().from(activity).where(eq(activity.featureId, f.id));
  expect(row.projectId).toBe(pid);
});
```

- [ ] **Step 2: Run — expect FAIL** (`recordActivity` arity mismatch / projectId missing).

Run: `pnpm --filter @productmap/api test -- src/lib/activity.test.ts`

- [ ] **Step 3: Update `recordActivity`**

```ts
export async function recordActivity(
  featureId: string,
  projectId: string,
  actorId: string | undefined,
  kind: ActivityKind,
  payload: Record<string, unknown> | null = null,
): Promise<void> {
  if (!actorId) return;
  await db.insert(activity).values({ featureId, projectId, actorId, kind, payload });
}
```

- [ ] **Step 4: Update every caller** to pass projectId as the 2nd arg. Each route already has the project id in scope (`c.get('currentProjectId')` in project-scoped routes, or the feature's `projectId`). For each file in Global Constraints:
  - `features.ts`: feature create uses `row.projectId`; updates use `prev.projectId` (or `c.get('currentProjectId')`).
  - `documents.ts`, `comments.ts`, `decisions.ts`, `deps.ts`, `releases.ts`, `ideas.ts`: use `c.get('currentProjectId')` (these are project-scoped routes) — verify each handler has it; if a handler only has a featureId, select the feature's projectId or thread it from the surrounding scope.
  - `ideas.ts:363`, `plans.ts:216/227/234`: raw `tx.insert(activity).values({...})` — add `projectId` to the values object (available as `c.get('currentProjectId')`).
  - `apps/api/src/lib/ai.ts`: if it records activity, thread projectId through.

- [ ] **Step 5: Run the test + the full API suite** — expect PASS for the new test and no regressions.

Run: `pnpm --filter @productmap/api test`
Expected: all green. (This proves goal #6: every activity-producing path carries projectId.)

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/lib/activity.ts apps/api/src/routes apps/api/src/lib/ai.ts apps/api/src/lib/activity.test.ts
git commit -m "feat(dashboard): activity writes carry projectId via recordActivity"
```

---

## Task 2 — Slug on project routes (after Task 0; parallel with 1/3/4)

**Files:**
- Create: `apps/api/src/lib/slug.ts`, `apps/api/src/lib/slug.test.ts`
- Modify: `apps/api/src/routes/projects.ts`
- Test: extend `apps/api/src/routes/projects.test.ts` (create if absent)

**Interfaces — Produces:** `slugify(name): string`, `uniqueSlug(name, exists): Promise<string>`; `GET/POST/PATCH /api/projects` payloads include `slug`.

- [ ] **Step 1: Failing unit test for slug helpers**

Create `apps/api/src/lib/slug.test.ts`:
```ts
import { slugify } from './slug';
import { describe, it, expect } from 'vitest';
it('slugifies', () => {
  expect(slugify('My Cool Project!')).toBe('my-cool-project');
  expect(slugify('  Spaces  &  Symbols  ')).toBe('spaces-symbols');
  expect(slugify('')).toBe('project');
  expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(60);
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm --filter @productmap/api test -- src/lib/slug.test.ts`).

- [ ] **Step 3: Implement `apps/api/src/lib/slug.ts`**
```ts
export function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return base || 'project';
}

/** Append -2, -3… until `exists(candidate)` returns false. */
export async function uniqueSlug(name: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugify(name);
  if (!(await exists(base))) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base.slice(0, 57)}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Failing integration test for slug in routes**

Add to `apps/api/src/routes/projects.test.ts` (mirror `activity.test.ts` setup for auth/db):
```ts
it('POST generates a unique slug and returns it', async () => {
  const r1 = await app.request('/api/projects', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alpha' }) });
  const p1 = await r1.json(); expect(p1.slug).toBe('alpha');
  const r2 = await app.request('/api/projects', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alpha' }) });
  const p2 = await r2.json(); expect(p2.slug).toBe('alpha-2');
});
it('PATCH rejects a duplicate slug with 409', async () => {
  // create two projects, PATCH the second to the first's slug → 409
});
```

- [ ] **Step 6: Run — expect FAIL.**

- [ ] **Step 7: Wire slug into `projects.ts`**
  - POST: inside the transaction, compute `slug = await uniqueSlug(input.name, async (s) => !!(await tx.select({ id: projects.id }).from(projects).where(eq(projects.slug, s)).then(r => r[0])))`; insert with `slug`; return `slug` in the payload.
  - PATCH: accept optional `slug` in `projectUpdate` zod schema (add `slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60).optional()`); on collision (unique violation) return `c.json({ error: 'slug_taken' }, 409)`; return `slug` in payload.
  - GET `/` (both admin + member branches) and GET `/:projectId`: include `slug` in the selected/returned fields.

- [ ] **Step 8: Run integration tests — expect PASS.** Then commit.
```bash
git add apps/api/src/lib/slug.ts apps/api/src/lib/slug.test.ts apps/api/src/routes/projects.ts apps/api/src/routes/projects.test.ts
git commit -m "feat(dashboard): project slugs (generate, validate, expose in payloads)"
```

---

## Task 3 — `GET /api/dashboard` aggregator (after Task 0; parallel with 1/2/4)

**Files:**
- Modify: `apps/api/src/routes/dashboard.ts`
- Test: `apps/api/src/routes/dashboard.test.ts` (create)

**Interfaces — Consumes:** `DashboardResponse` + sub-types (Task 0), `activity.projectId` (Task 0; backfilled rows exist even before Task 1 ships new writes), `projectFavorites` (Task 0). **Produces:** the populated endpoint.

> **Bounded-query rule (goal #2):** resolve the user's project-id set ONCE, then run set-based queries filtered by `inArray(table.projectId, pids)` / grouped by projectId. No loop over projects.

- [ ] **Step 1: Failing isolation test (the security goal #1)**

Create `apps/api/src/routes/dashboard.test.ts`. Fixture: user U is `member` of project A only; project B exists with its own owner, features, activity, an `in_review` doc, and an open comment. Seed A with similar data where U is involved.
```ts
it('returns only the caller’s member/favorited projects — zero leakage from B', async () => {
  const res = await app.request('/api/dashboard', { headers: auth });
  expect(res.status).toBe(200);
  const body = await res.json();
  const pidsSeen = new Set<string>([
    ...body.projects.map((p: any) => p.id),
    ...body.nextActions.map((n: any) => n.projectId),
    ...body.myWork.map((w: any) => w.projectId),
    ...body.activity.map((a: any) => a.projectId),
  ]);
  expect(pidsSeen.has(projectB)).toBe(false);   // assertion covering all four sections
  expect(body.projects.map((p: any) => p.id)).toContain(projectA);
});
it('favorited projects sort before non-favorited', async () => { /* favorite A2, assert order */ });
it('nextActions includes in_review docs but NOT draft docs', async () => { /* seed one of each, assert */ });
it('empty payload for a user with no projects', async () => { /* fresh user, all arrays empty */ });
```

- [ ] **Step 2: Run — expect FAIL** (skeleton returns empty arrays).

- [ ] **Step 3: Implement the aggregator** in `dashboard.ts`. Sketch (fill with real Drizzle queries):
```ts
export const dashboardRoutes = new Hono<AuthEnv>().get('/', async (c) => {
  const user = c.get('currentUser');
  // 1) project id set = membership ∪ favorites (admins included — NO all-projects)
  const memberRows = await db.select({ projectId: memberships.projectId, role: memberships.role })
    .from(memberships).where(eq(memberships.userId, user.id));
  const favRows = await db.select({ projectId: projectFavorites.projectId })
    .from(projectFavorites).where(eq(projectFavorites.userId, user.id));
  const roleByPid = new Map(memberRows.map(r => [r.projectId, r.role]));
  const favSet = new Set(favRows.map(r => r.projectId));
  const pids = [...new Set([...roleByPid.keys(), ...favSet])];
  if (pids.length === 0) return c.json({ projects: [], nextActions: [], myWork: [], activity: [] });

  // 2) projects + status rollup: one query for project rows; one grouped query for counts;
  //    one for next release; one for staleCount (endDate < now AND status != 'shipped').
  // 3) nextActions: open unresolved comments on features/docs the user authored or collaborates on;
  //    in_review docs (NOT draft) authored-by/collaborated; features (collaborator) missing dates.
  // 4) myWork: features where featureCollaborators.userId = user.id, joined for slug/status/horizon.
  // 5) activity: inArray(activity.projectId, pids), join users+features+projects.slug, newest first, limit 200.
  // Sort projects: favorite desc, then name asc.
  return c.json({ projects, nextActions, myWork, activity });
});
```
Use `inArray` from `drizzle-orm`. Group counts with `sql<number>` + `count()` grouped by `(projectId, status)` and fold into the per-project `counts` shape in JS (single pass, not per-project queries).

- [ ] **Step 4: Run the test file — expect PASS** (all four assertions).

Run: `pnpm --filter @productmap/api test -- src/routes/dashboard.test.ts`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/dashboard.ts apps/api/src/routes/dashboard.test.ts
git commit -m "feat(dashboard): GET /api/dashboard aggregator with isolation guarantees"
```

---

## Task 4 — Favorite endpoints (after Task 0; small, parallel)

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Test: `apps/api/src/routes/favorites.test.ts` (create)

**Interfaces — Produces:** `POST /api/projects/:projectId/favorite` → `{ favorite: true }`; `DELETE` → `{ favorite: false }`.

- [ ] **Step 1: Failing test**
```ts
it('POST then DELETE toggles favorite; idempotent; admin works without membership', async () => {
  const post = await app.request(`/api/projects/${projectId}/favorite`, { method: 'POST', headers: auth });
  expect(await post.json()).toEqual({ favorite: true });
  const again = await app.request(`/api/projects/${projectId}/favorite`, { method: 'POST', headers: auth });
  expect(again.status).toBe(200); // onConflictDoNothing → still favorite:true
  const del = await app.request(`/api/projects/${projectId}/favorite`, { method: 'DELETE', headers: auth });
  expect(await del.json()).toEqual({ favorite: false });
});
it('non-member gets 404', async () => { /* different user without membership → 404 */ });
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Add routes to `projectsRoutes`** (guard `requireMembership('viewer')`, which admits admins):
```ts
.post('/:projectId/favorite', requireMembership('viewer'), async (c) => {
  await db.insert(projectFavorites)
    .values({ userId: c.get('currentUser').id, projectId: c.req.param('projectId') })
    .onConflictDoNothing();
  return c.json({ favorite: true });
})
.delete('/:projectId/favorite', requireMembership('viewer'), async (c) => {
  await db.delete(projectFavorites)
    .where(and(eq(projectFavorites.userId, c.get('currentUser').id), eq(projectFavorites.projectId, c.req.param('projectId'))));
  return c.json({ favorite: false });
})
```
(Import `projectFavorites`, `and`.)

- [ ] **Step 4: Run — expect PASS. Commit.**
```bash
git add apps/api/src/routes/projects.ts apps/api/src/routes/favorites.test.ts
git commit -m "feat(dashboard): per-user project favorite endpoints"
```

---

## Task 5 — Frontend: Dashboard, hooks, Overview move, settings slug (after Tasks 0+3 contract)

**Files:**
- Create: `apps/web/src/routes/Dashboard.tsx`, `apps/web/src/routes/ProjectOverview.tsx`, `apps/web/src/components/dashboard/{NextActions,MyProjects,MyWork,DashboardFeed}.tsx`, `apps/web/src/routes/Dashboard.test.tsx`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/lib/routes.ts`, `apps/web/src/App.tsx`, `apps/web/src/components/AppShell.tsx`, `apps/web/src/components/settings/ProjectTab.tsx`

**Interfaces — Consumes:** `DashboardResponse` (Task 0), favorite endpoints (Task 4), slug payloads (Task 2). **Produces:** `useDashboard()`, `useToggleFavorite()`.

- [ ] **Step 1: Add hooks to `apps/web/src/lib/api.ts`**
```ts
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => fetchJson<DashboardResponse>('/api/dashboard'),
    staleTime: 30_000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, favorite }: { projectId: string; favorite: boolean }) =>
      fetchJson<{ favorite: boolean }>(`/api/projects/${projectId}/favorite`, { method: favorite ? 'POST' : 'DELETE' }),
    onMutate: async ({ projectId, favorite }) => {
      await qc.cancelQueries({ queryKey: queryKeys.dashboard });
      const prev = qc.getQueryData<DashboardResponse>(queryKeys.dashboard);
      if (prev) {
        qc.setQueryData<DashboardResponse>(queryKeys.dashboard, {
          ...prev,
          projects: prev.projects.map((p) => p.id === projectId ? { ...p, favorite } : p)
            .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(queryKeys.dashboard, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
  });
}
```

- [ ] **Step 2: Failing render test**

Create `apps/web/src/routes/Dashboard.test.tsx` (MSW handler returns a `DashboardResponse` with 2 projects, 1 nextAction, 1 myWork, 1 activity). Mirror the MSW + render harness used in `Landing.test.tsx`.
```ts
it('renders project cards, next actions, my work, and feed', async () => {
  renderDashboard(); // helper that wraps QueryClient + router
  expect(await screen.findByText('Alpha')).toBeInTheDocument();
  expect(screen.getByText(/next action|review/i)).toBeInTheDocument();
});
it('shows the empty/onboarding state when there are no projects', async () => { /* empty payload */ });
```

- [ ] **Step 3: Run — expect FAIL** (no Dashboard component).

- [ ] **Step 4: Build `Dashboard.tsx` + sub-components**, using shadcn `Card`, `Skeleton`, lucide icons, Tailwind Soft Studio classes (match `Landing.tsx`). `Dashboard` calls `useDashboard()`; renders `<NextActions>`, `<MyProjects>` (favorite pin via `useToggleFavorite`, cards `<Link to={appRoutes.projectOverview(p.slug)}>`), `<MyWork>`, `<DashboardFeed>`, a search button that opens the existing CommandPalette, and an empty state when `projects.length === 0`. Loading → skeletons.

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: Overview route move**

Add to `routes.ts`: `projectOverview: (slug: string) => \`${APP_BASE}/p/${slug}\`,` and pattern `projectOverview: \`${APP_BASE}/p/:slug\``.
Create `ProjectOverview.tsx`: read `:slug` via `useParams`, resolve from `useActiveProject().projects` (now carry `slug`); if found, `setProjectId(found.id)` in an effect, render `<Landing />`; if the list is loaded and no match, render a 404 state.
In `App.tsx`: `/app` index stays but its element becomes `<Dashboard />`; add `<Route path="p/:slug" element={<ProjectOverview />} />`. (Lazy-load both like siblings.)

- [ ] **Step 7: AppShell nav** — "Dashboard" → `appRoutes.dashboard`; add "Overview" → `appRoutes.projectOverview(activeProject.slug)` (guard when no active project).

- [ ] **Step 8: Settings slug field** — in `ProjectTab.tsx`, add an editable slug input prefilled from the project, with a "regenerate from name" button (client-side `slugify` mirror), submitting via the existing project PATCH; surface a 409 (`slug_taken`) as an inline error.

- [ ] **Step 9: Failing test for slug routing**

In `Dashboard.test.tsx` or a new `ProjectOverview.test.tsx`:
```ts
it('resolves a known slug and renders the overview', async () => { /* router at /app/p/alpha, projects include {slug:'alpha'} */ });
it('404s an unknown slug', async () => { /* /app/p/nope */ });
```

- [ ] **Step 10: Run web suite — expect PASS. Typecheck. Commit.**
```bash
pnpm --filter @productmap/web test && pnpm -r typecheck
git add apps/web/src
git commit -m "feat(dashboard): cross-project Dashboard page, hooks, /app/p/:slug overview, settings slug"
```

---

## Task 6 — Integration sweep & acceptance (after 1–5)

**Files:** none new — verification + gap-fill.

- [ ] **Step 1: Full suite** — `pnpm -r test` → all green (goal #3 zero regression).
- [ ] **Step 2: Typecheck + build** — `pnpm -r typecheck && pnpm -r build` (goal #5).
- [ ] **Step 3: Goal audit** — walk §7a goals 1–8 in the spec; for each, point to the passing test or run a manual check. Note any gap and open a follow-up task.
- [ ] **Step 4: Manual smoke** (if a dev DB is available) — `pnpm dev`, log in, land on Dashboard, favorite a project (re-sorts), click a card → `/app/p/:slug` overview, board/roadmap still work, rename slug in settings.
- [ ] **Step 5: Commit any fixes.**

---

## Self-Review (completed by plan author)

- **Spec coverage:** schema (§3 → Task 0), activity write-path (§3.3 → Task 1), dashboard endpoint (§4.1 → Task 3), favorite (§4.2 → Task 4), slug routes (§4.3 → Task 2), frontend incl. Overview move + settings slug (§5 → Task 5), tests (§6 → folded into each task + Task 6), strong goals (§7a → Task 6 audit). All mapped.
- **Placeholders:** endpoint bodies in Task 3 are deliberately sketched (real Drizzle queries to be written against the live schema) but the contract, query-count rule, and every test assertion are concrete; all other steps carry real code.
- **Type consistency:** `recordActivity(featureId, projectId, actorId, kind, payload?)` used identically in Task 1; `DashboardResponse`/sub-types defined once in Task 0 and consumed verbatim in Tasks 3 & 5; `appRoutes.projectOverview(slug)` consistent across Tasks 5 steps.
