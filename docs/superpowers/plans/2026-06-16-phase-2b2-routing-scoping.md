# Phase 2b-2 — URL-Nested Routing + Project Scoping (`loadScoped` everywhere) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Read §0 "How this plan stays green" before touching code — it is the load-bearing strategy.**

**Goal:** Move every project-scoped route under `/api/projects/:projectId/...` behind `requireMembership` (viewer-for-reads, editor-for-writes), wire `loadScoped` into **every path id and every body-supplied entity id** so a member of project A can never read or reference project B's data, remove `getDefaultProjectId`, and thread the active project id through the web client — leaving the suite green per commit and the app fully usable.

**Architecture:** A single `projectScopedContent` Hono sub-app mounted at `/api/projects/:projectId`, gated by one `.use('*')` middleware that picks `requireMembership('viewer')` for GET and `requireMembership('editor')` for everything else. `requireMembership` (from 2b-1) is **extended** to also `c.set('currentProjectId', projectId)`; handlers read `c.get('currentProjectId')` — never the URL param — so param resolution inside mounted sub-routers is a non-question. Project + member management (`projectsRoutes` from 2b-1) stays mounted at `/api/projects` with its own owner-gating. The public share read and AI-status stay top-level.

**Tech Stack:** Hono, Drizzle + Postgres, Zod (shared), Vitest, React Query (web), Playwright (e2e). Builds on 2a (`projects`/`memberships` tables, `member_role` enum, `loadScoped` helper, `projectId` on the 9 scoped tables) and **2b-1 merged** (`requireMembership`, `ROLE_RANK`, project/member CRUD, `MembershipEnv`).

**Reference spec:** `docs/superpowers/specs/2026-06-16-phase-2-projects-membership-design.md` — §4 (same-project integrity / `loadScoped`), §6 (capability matrix), §7 (URL-nested + `requireMembership`), §13 (strong goals), §15b (carryovers). **Predecessor plan:** `docs/superpowers/plans/2026-06-16-phase-2b1-project-membership-api.md`.

**Branch:** This is the largest diff to date. Ship as **3 sequential PRs** off `main` (see §"PR decomposition"). Branch names:
- PR-A: `phase-2b2a-scoping-foundation`
- PR-B: `phase-2b2b-features-cluster` (off PR-A once merged, or stacked)
- PR-C: `phase-2b2c-ideas-share-cleanup` (off PR-B once merged, or stacked)

**Environment:** DB tests need Postgres on `localhost:5432` → run vitest with **sandbox DISABLED** (`dangerouslyDisableSandbox: true`); the symptom of a missing override is `connect EPERM 5432`. Ignore `@productmap/db has no exported member` LSP noise — `tsc` is the source of truth. Test helpers in `apps/api/src/test/helpers.ts`: `setupTestDb`, `truncateAll`, `closeTestDb`, `createTestUser`, `createTestProject`, `addMembership`, `authCookie`.

---

## 0. How this plan stays green (read first)

The hard constraint (spec §13.4) is: **each commit leaves vitest green AND the app usable**, while we (a) move 14 route files flat→nested, (b) wire `loadScoped` everywhere, and (c) delete `getDefaultProjectId`. The reconciliation:

1. **Incremental per-group migration.** During 2b-2, `app.ts` mounts **some route groups flat and some nested at the same time.** Each group moves flat→nested in **one commit together with its web hook(s), its API route test, and its web test.** Unmigrated groups keep working on their flat paths. The app is usable after every commit; vitest is green after every commit.
2. **One runtime project in 2b-2.** The web resolves the active project as the user's **first/sole** project from `GET /api/projects` (the switcher is 2c). So at runtime there is effectively one project — partial migration never breaks behavior. **Isolation across projects is proven only by the net-new multi-project matrix tests** added as each group becomes nested, not by runtime behavior.
3. **`getDefaultProjectId` dies with its last caller.** `apps/api/src/lib/project.ts` is deleted in the commit (PR-C) that migrates the final caller. Callers: `plans.ts`, `share.ts` (mint), `objectives.ts`, `releases.ts`, `ideas.ts`, `decisions.ts`, plus the inline `select().from(projects).limit(1)` in `features.ts` and `overview.ts`.
4. **e2e is gated at PR boundaries, not per-commit.** A spec's e2e only re-greens once that group's web is threaded; mid-API-migration e2e will be red **by design**. Run `pnpm e2e` only at the end of each PR. Do not panic at red e2e between commits.
5. **Handlers read `c.get('currentProjectId')`, never `c.req.param('projectId')`.** Set in `requireMembership`. This makes "does the param resolve in a mounted sub-router" a non-issue.

---

## 1. The scoping inventory (first-class deliverable — drives every task + test)

`loadScoped(table, id, projectId)` only works on tables that **have a `projectId` column**. Exactly **9 do**: `features`, `documents`, `ideas`, `decisions`, `releases`, `objectives`, `plans`, `share_tokens`, `memberships`. Everything else scopes **transitively** through a parent that has `projectId`.

**Tables WITHOUT `projectId` (scope via parent):** `evidence` (→features), `comments` (→features or →documents), `votes` (→features), `idea_votes` (→ideas), `feature_dependencies` (→features), `plan_entries` (→plans + →features), `activity` (→features), `feature_collaborators` (→features), `uploads` (global, out of scope per spec §9).

### 1a. Path-id inventory (every `:id`/`:featureId` in a nested route)

| Route (nested) | Path id | How to scope |
|---|---|---|
| `features /:id` (GET/PATCH/DELETE/vote/activity/collaborators) | features.id | `loadScoped(features, id, pid)` |
| `deps /:id/dependencies` | features.id | `loadScoped(features, id, pid)` |
| `evidence /features/:id/evidence` | features.id | `loadScoped(features, id, pid)` |
| `evidence /evidence/:id` DELETE | evidence.id | load evidence → `loadScoped(features, evidence.featureId, pid)` |
| `documents /:id` | documents.id | `loadScoped(documents, id, pid)` |
| `ideas /:id` (+ /pitch /vote /promote) | ideas.id | `loadScoped(ideas, id, pid)` |
| `releases /:id` (+ /ship /notes-doc /generate-notes /features /notes.md) | releases.id | `loadScoped(releases, id, pid)` |
| `objectives /:id` | objectives.id | `loadScoped(objectives, id, pid)` |
| `plans /:id` (+ /entries/:featureId /apply) | plans.id | `loadScoped(plans, id, pid)` |
| `plans /:id/entries/:featureId` | features.id (2nd id) | `loadScoped(features, featureId, pid)` |
| `decisions /decisions/:id` DELETE | decisions.id | `loadScoped(decisions, id, pid)` |
| `comments /:id` (resolve/patch/delete) | comments.id | load comment → scope via its featureId/documentId (see 1c) |

### 1b. Body-id inventory (every entity id arriving in a JSON body or query)

| Route | Body/query id | How to scope (reject with 404, or 422 for malformed-but-known-cross) |
|---|---|---|
| `features PATCH /:id` | `objectiveId` | if present & non-null: `loadScoped(objectives, objectiveId, pid)` |
| `features PATCH /:id` | `releaseId` | if present & non-null: `loadScoped(releases, releaseId, pid)` |
| `deps PUT /:id/dependencies` | `blockerIds[]` | each must be in pid: one `inArray(features.id, ids) AND eq(features.projectId, pid)` query; count mismatch → 404 |
| `releases PUT /:id/features` | `featureIds[]` | same `inArray + projectId` count check → 404 |
| `documents POST` | `featureId` | `loadScoped(features, featureId, pid)` |
| `documents POST` | `templateId` (templates are GLOBAL) | **do NOT loadScoped** — templates have no projectId; keep existing existence check |
| `comments POST` | `featureId` | `loadScoped(features, featureId, pid)` |
| `comments POST` | `documentId` | `loadScoped(documents, documentId, pid)` |
| `comments POST` | `parentId` | load parent comment → scope its featureId/documentId in pid |
| `decisions POST` | `featureId` | if present: `loadScoped(features, featureId, pid)` |
| `decisions POST` | `sourceCommentId` | **canonical hard case** — load comment; scope via `comment.featureId`→`loadScoped(features,…,pid)` or `comment.documentId`→`loadScoped(documents,…,pid)`; if neither resolves in pid → 404/422 |
| `decisions POST /ai/suggest-decision` | `commentId` | load comment → scope via its feature/document in pid |
| `copilot POST /ai/review-doc` | `documentId` | `loadScoped(documents, documentId, pid)` |
| `plans POST` | `copyFrom` (plan id, unless `'current'`) | if not `'current'`: `loadScoped(plans, copyFrom, pid)` |
| `documents GET ?featureId=` | `featureId` query | filter the list by `eq(documents.projectId, pid)` (covered by list-scoping, §1d) |
| `comments GET ?featureId/documentId=` | query | list filtered by parent in pid (§1d) |
| `decisions GET ?featureId=` | query | list filtered by `eq(decisions.projectId, pid)` |

### 1c. Comment scoping helper (used by comments + decisions)

Comments have no `projectId`. A reusable helper resolves a comment to its project and asserts it equals `pid`:

```ts
// apps/api/src/lib/scope.ts — add alongside loadScoped
import { comments } from '@productmap/db';
/**
 * Assert a comment belongs to `projectId` via its feature OR document parent.
 * Throws ScopeError(404) if the comment is missing or its parent is in another project.
 * Returns the loaded comment row.
 */
export async function loadScopedComment(commentId: string, projectId: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) throw new ScopeError();
  if (comment.featureId) await loadScoped(features, comment.featureId, projectId);
  else if (comment.documentId) await loadScoped(documents, comment.documentId, projectId);
  else throw new ScopeError(); // orphan comment — cannot prove project; deny
  return comment;
}
```
(Add `features`, `documents` to the imports in `scope.ts`.)

### 1d. List-read inventory (each list query MUST filter by project — peer leak to path-id IDOR)

Every current `select().from(table)` with no project filter is a read leak. Each becomes project-filtered AND gets a "second project's rows don't appear" test:

| Route | Current leak | Fix |
|---|---|---|
| `features GET /` | unfiltered | `where(eq(features.projectId, pid))` |
| `releases GET /` | unfiltered + `select().from(releases)` in share | `where(eq(releases.projectId, pid))` |
| `releases GET /:id/notes.md` member loop | fine (scoped via release) | (release already scoped) |
| `objectives GET /` | unfiltered | `where(eq(objectives.projectId, pid))` (mind the existing GROUP BY/joins) |
| `plans GET /` | unfiltered | `where(eq(plans.projectId, pid))` |
| `plans POST copyFrom='current'` snapshot | `select().from(features)` unfiltered | `where(eq(features.projectId, pid))` |
| `ideas GET /` | unfiltered | `where(eq(ideas.projectId, pid))` (compose with status filter via `and`) |
| `documents GET ?all / ?featureId` | unfiltered | `where(eq(documents.projectId, pid))` (compose with featureId via `and`) |
| `documents exportRoutes /export.zip` | unfiltered features+docs | filter both by pid (move nested — see §5) |
| `activity GET /` | unfiltered (joins features) | `where(and(eq(features.projectId, pid), since?))` |
| `overview GET /` | `select().from(projects).limit(1)` | use pid; filter features/docs by pid |
| `copilot /ai/chat` retrieval | docs + features unfiltered | filter both by pid |
| `copilot /copilot/nudges` (4 queries) | docs/features/comments unfiltered | filter docs/features by `eq(*.projectId, pid)`; comments via join to features/docs in pid |
| `share GET /:token/data` | `select().from(releases)` line 102 unfiltered | `where(eq(releases.projectId, tokenRow.projectId))` |

---

## File Structure

**API (changed):**
- `apps/api/src/middleware/membership.ts` — extend `MembershipEnv` + `requireMembership` to set `currentProjectId`.
- `apps/api/src/lib/scope.ts` — add `loadScopedComment`; keep `loadScoped`.
- `apps/api/src/app.ts` — add `projectScopedContent` sub-app + method-gate; migrate mounts group-by-group.
- `apps/api/src/lib/project.ts` — **DELETED** in PR-C.
- All 14 route files: `features.ts`, `deps.ts`, `evidence.ts`, `documents.ts`, `comments.ts`, `activity.ts`, `overview.ts`, `ideas.ts`, `releases.ts`, `objectives.ts`, `plans.ts`, `decisions.ts`, `copilot.ts`, `share.ts` — switch to `MembershipEnv`, read `currentProjectId`, wire `loadScoped`, filter lists.
- All 14 `*.test.ts` — URL strings flat→nested; add per-file cross-project read + body-ref tests.
- `apps/api/src/routes/authz-matrix.test.ts` (**new**) — the consolidated strong-goal matrix (§13.1).

**Web (changed):**
- `apps/web/src/lib/project.tsx` (**new**) — `ProjectProvider`, `useProjectId()`, `useProjects()`, first-run guard.
- `apps/web/src/lib/api.ts` — add `apiPath(pid, ...)` helper; thread `pid` into every project-scoped hook + query key.
- `apps/web/src/App.tsx` — wrap `AppShell` subtree in `ProjectProvider`.
- Web tests + `e2e/*.spec.ts` — updated for nested paths (per PR).

---

# PR-A — Scoping foundation + template groups (branch `phase-2b2a-scoping-foundation`)

Establishes the mount scaffold, the `currentProjectId` contract, the comment helper, the web project context + path helper + keyed queries, and migrates **3 simple groups end-to-end (objectives, releases, plans)** as the copy-paste template for PR-B/PR-C.

## Task A1: Extend `requireMembership` to set `currentProjectId`

**Files:** `apps/api/src/middleware/membership.ts`, `membership.test.ts`.

- [ ] **Step 1: failing test** — append to `membership.test.ts`, extending the throwaway app to echo `currentProjectId`:
```ts
it('exposes currentProjectId to handlers', async () => {
  const u = await createTestUser({ role: 'member' }); const p = await createTestProject();
  await addMembership(u.id, p.id, 'viewer');
  const probe = new Hono<MembershipEnv>()
    .use('/p/:projectId/*', requireAuth as never)
    .get('/p/:projectId/pid', requireMembership('viewer'), (c) => c.json({ pid: c.get('currentProjectId') }));
  const res = await probe.request(`/p/${p.id}/pid`, { headers: await hdrs(u) });
  expect(res.status).toBe(200);
  expect((await res.json()).pid).toBe(p.id);
});
```
- [ ] **Step 2: run, confirm FAIL** — `pnpm --filter @productmap/api exec vitest run src/middleware/membership.test.ts` (sandbox off).
- [ ] **Step 3:** edit `membership.ts` — add to `MembershipEnv.Variables` and set in both branches:
```ts
export type MembershipEnv = AuthEnv & { Variables: { currentRole: MemberRole; currentProjectId: string } };
```
In `requireMembership`, after resolving `projectId` and before each `await next()` (both the super-admin branch and the member branch), add:
```ts
c.set('currentProjectId', projectId);
```
- [ ] **Step 4: run, confirm PASS** (sandbox off).
- [ ] **Step 5: typecheck** `pnpm --filter @productmap/api exec tsc -p tsconfig.json --noEmit` → 0.
- [ ] **Step 6: commit**
```bash
git add apps/api/src/middleware/membership.ts apps/api/src/middleware/membership.test.ts
git commit -m "feat(api): requireMembership sets currentProjectId for nested handlers"
```

## Task A2 (SPIKE — blocking): mount scaffold + method gate, prove the mgmt/content interaction

**This task is empirical — it proves the Hono mount composition or triggers the fallback. Do it before migrating any group.**

**Files:** `apps/api/src/app.ts`, new `apps/api/src/routes/project-scoped.ts`, new `apps/api/src/app.mount.test.ts`.

**Target design (preferred):**
- `projectsRoutes` (2b-1) stays mounted at `/api/projects` (routes: `/`, `/:projectId`, `/:projectId/members`, member sub-routes — all with their own owner/viewer gating).
- A new `projectScopedContent` sub-app mounted at `/api/projects/:projectId` with a single method-gate as its first middleware, mounting the content routers inside it.

Mgmt routes (`/:projectId`, `/:projectId/members`) and content routes (`/features`, `/ideas`, …) **never path-collide**; correctness depends on Hono falling through across the two `/api/projects*` mounts on no-match. **This is the spike.**

- [ ] **Step 1: create `apps/api/src/routes/project-scoped.ts`** with the gate + an initial empty mount (groups added in later tasks):
```ts
import { Hono } from 'hono';
import { requireMembership, type MembershipEnv } from '../middleware/membership';

/**
 * Content routes scoped to /api/projects/:projectId. One method-based gate:
 * GET → viewer, any mutation → editor. requireMembership 404s non-members and
 * sets currentProjectId. Groups are mounted onto this app as they migrate.
 */
export const projectScopedContent = new Hono<MembershipEnv>().use('*', async (c, next) => {
  const min = c.req.method === 'GET' ? 'viewer' : 'editor';
  return requireMembership(min)(c as never, next);
});
```
- [ ] **Step 2: wire into `app.ts`** — keep `projectsRoutes` at `/api/projects` (register FIRST), then mount the content app:
```ts
import { projectScopedContent } from './routes/project-scoped';
// ...existing mounts: keep .route('/api/projects', projectsRoutes)
.route('/api/projects/:projectId', projectScopedContent)
```
- [ ] **Step 3: write the spike test** `apps/api/src/app.mount.test.ts` — temporarily mount a probe content route to assert composition (remove the probe route once a real group lands in A5; keep the assertions wired to a real route then). Assertions:
  1. viewer content GET → 200
  2. viewer content POST → 403
  3. non-member content GET → 404
  4. `GET /api/projects/:projectId` (mgmt) still resolves for a viewer (200) — i.e. content mount does NOT shadow mgmt
  5. `POST /api/projects/:projectId/members` is **owner-gated** (editor → 403, NOT editor-allowed by the method rule) — i.e. the method-gate does NOT leak onto mgmt
```ts
// probe content route for the spike (replaced by objectives in A5):
projectScopedContent.get('/__probe', (c) => c.json({ pid: c.get('currentProjectId') }))
                    .post('/__probe', (c) => c.json({ ok: true }));
```
- [ ] **Step 4: run** (sandbox off).
- [ ] **Step 5 — DECISION GATE:**
  - **If all 5 pass:** the preferred mount composes. Proceed; delete the `__probe` routes once objectives lands (A5).
  - **If fallthrough/shadowing misbehaves (e.g. content mount 404s mgmt, or mgmt no longer reached):** trigger the **FALLBACK** — collapse mgmt INTO `projectScopedContent`: move `projectsRoutes`' `/:projectId` GET/PATCH/DELETE and `/:projectId/members*` into the content app, register them **before** the `.use('*')` method-gate (or guard the gate to skip `/members` and apply owner-gating there explicitly), and keep only list/create (`/`, `POST /`) at `/api/projects`. Re-run the 5 assertions against the fallback. Document which path was taken in the commit message.
- [ ] **Step 6: commit**
```bash
git add apps/api/src/routes/project-scoped.ts apps/api/src/app.ts apps/api/src/app.mount.test.ts
git commit -m "feat(api): projectScopedContent mount + method gate (spike: <preferred|fallback>)"
```

## Task A3: `loadScopedComment` helper

**Files:** `apps/api/src/lib/scope.ts`, `scope.test.ts`.

- [ ] **Step 1: failing test** — append to `scope.test.ts`: a comment on a feature in project A is rejected (404) when scoped to project B, accepted when scoped to A; an orphan comment (no feature/doc) → 404. Use `createTestProject`, `createTestUser`, and direct inserts of a feature + comment.
- [ ] **Step 2: run, confirm FAIL** (sandbox off).
- [ ] **Step 3: implement `loadScopedComment`** in `scope.ts` (code in §1c). Add `comments`, `features`, `documents` to the `@productmap/db` import.
- [ ] **Step 4: run, confirm PASS** (sandbox off).
- [ ] **Step 5: typecheck.**
- [ ] **Step 6: commit**
```bash
git add apps/api/src/lib/scope.ts apps/api/src/lib/scope.test.ts
git commit -m "feat(api): loadScopedComment (scope comments via feature/document parent)"
```

## Task A4: Web project context + path helper + keyed queries (foundation)

**Files:** new `apps/web/src/lib/project.tsx`; `apps/web/src/lib/api.ts`; `apps/web/src/App.tsx`; test `apps/web/src/lib/project.test.tsx`.

- [ ] **Step 1: failing test** `project.test.tsx` — render a component using `useProjectId()` inside `<ProjectProvider>` with a mocked `GET /api/projects` returning `[{id:'p1',...}]`; assert it exposes `'p1'`; assert a no-projects response renders the first-run fallback (a `data-testid="first-run"` node). Use the existing web test setup (MSW or fetch mock — match sibling tests).
- [ ] **Step 2: run, confirm FAIL** — `pnpm --filter @productmap/web exec vitest run src/lib/project.test.tsx`.
- [ ] **Step 3: implement `apps/web/src/lib/project.tsx`:**
```tsx
import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './api';
import type { Project } from '@productmap/shared';

export interface ProjectListItem extends Project { role: 'owner' | 'editor' | 'viewer'; }

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchJson<ProjectListItem[]>('/api/projects'),
    staleTime: 60_000,
  });
}

const ProjectIdContext = createContext<string | null>(null);

/** Active project = the user's first/sole project (switcher is 2c). First-run UI when none. */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useProjects();
  if (isLoading) return null; // AppShell already shows a skeleton wrapper
  if (isError) return <div data-testid="projects-error">Could not load projects.</div>;
  const active = data?.[0]?.id ?? null;
  if (!active) return <div data-testid="first-run">Create your first project to get started.</div>;
  return <ProjectIdContext.Provider value={active}>{children}</ProjectIdContext.Provider>;
}

/** Active project id. Throws if used outside ProjectProvider (programming error). */
export function useProjectId(): string {
  const id = useContext(ProjectIdContext);
  if (!id) throw new Error('useProjectId must be used within ProjectProvider');
  return id;
}
```
- [ ] **Step 4:** add the path helper to `api.ts` (top, after `fetchJson`):
```ts
/** Build a project-scoped API path: apiPath(pid, 'features', id) → /api/projects/<pid>/features/<id>. */
export function apiPath(projectId: string, ...segments: (string | number)[]): string {
  return `/api/projects/${projectId}${segments.length ? '/' + segments.join('/') : ''}`;
}
```
- [ ] **Step 5:** wrap the authed subtree in `App.tsx`. Inside `<RequireAuth><AppShell /></RequireAuth>`, wrap `<AppShell />` (or the `<Outlet/>` content) with `<ProjectProvider>`. Match the existing JSX shape — `ProjectProvider` must sit inside `RequireAuth` (needs auth) and above all data routes.
- [ ] **Step 6: run web vitest for the new test, confirm PASS; web tsc → 0.**
- [ ] **Step 7: commit**
```bash
git add apps/web/src/lib/project.tsx apps/web/src/lib/api.ts apps/web/src/App.tsx apps/web/src/lib/project.test.tsx
git commit -m "feat(web): ProjectProvider + useProjectId + apiPath helper (active = first project)"
```

> **Query-key rule for ALL subsequent web migrations (PR-A/B/C):** every project-scoped query key gains the pid as its second element, e.g. `['p', pid, 'features']`, `['p', pid, 'releases', id]`. This is cheap now and prevents a full 2c rewrite. Apply it in every hook you touch.

## Task A5: Migrate **objectives** end-to-end (the template group)

**Files:** `apps/api/src/routes/objectives.ts`, `app.ts`/`project-scoped.ts`, `objectives.test.ts`; `apps/web/src/lib/api.ts`; any web test hitting objectives.

- [ ] **Step 1: failing API tests** — rewrite `objectives.test.ts` URLs to `/api/projects/${projectId}/objectives...`; the existing admin-actor setup passes the gate. Add three NEW tests:
  - member-of-A GET `/api/projects/${B}/objectives/${objInB}` → 404 (path-id IDOR)
  - GET list in A does not include B's objectives (list isolation)
  - viewer POST → 403 (write gate)
  (Use `createTestUser({role:'member'})` + `addMembership` for these; keep the admin block for the happy path.)
- [ ] **Step 2: run, confirm FAIL** (sandbox off; routes still flat).
- [ ] **Step 3: implement:**
  - `objectives.ts`: change env to `MembershipEnv`; replace `getDefaultProjectId()` with `c.get('currentProjectId')`; add `where(eq(objectives.projectId, pid))` to the list query (compose with existing joins/GROUP BY via `and` if needed); replace `GET/PATCH/DELETE /:id` existence checks with `await loadScoped(objectives, id, pid)` (no try/catch — `ScopeError` propagates to `app.onError` as 404; confirm `onError` lets `HTTPException` through — it does, see `app.ts:80`). Remove the `getDefaultProjectId` import.
  - `app.ts`: remove `.route('/api/objectives', objectivesRoutes)`; add the mount onto `projectScopedContent` — keep ALL content mounts in `project-scoped.ts` for one owner. Recommended: `projectScopedContent.route('/objectives', objectivesRoutes)` inside `project-scoped.ts`.
- [ ] **Step 4: run, confirm PASS** (sandbox off).
- [ ] **Step 5: web** — in `api.ts`, change `useObjectives`/`useCreateObjective`/`useUpdateObjective` to use `useProjectId()` and `apiPath(pid, 'objectives', ...)`; key as `['p', pid, 'objectives']`. Update any web test that asserts the objectives URL. Web tsc → 0; web vitest green.
- [ ] **Step 6: typecheck api + web; commit**
```bash
git add apps/api/src/routes/objectives.ts apps/api/src/routes/objectives.test.ts apps/api/src/routes/project-scoped.ts apps/api/src/app.ts apps/web/src/lib/api.ts apps/web/src/lib/project.tsx
git commit -m "feat(2b2): nest objectives under /projects/:projectId + loadScoped + web thread"
```

## Task A6: Migrate **releases** end-to-end

Same recipe as A5 applied to `releases.ts` (`releasesRoutes`). Specifics:
- [ ] List GET: `where(eq(releases.projectId, pid))`.
- [ ] `/:id` and all sub-routes (`/ship`, `/notes-doc`, `/generate-notes`, `/features`, `/notes.md`): replace `select().from(releases).where(eq(releases.id,id))` existence checks with `await loadScoped(releases, id, pid)`.
- [ ] `POST /`: `getDefaultProjectId()` → `c.get('currentProjectId')`.
- [ ] **`PUT /:id/features {featureIds}` body-id scoping** (critical): replace the bare `inArray(features.id, ids)` count check with a project-scoped one:
```ts
const existing = await db.select({ id: features.id }).from(features)
  .where(and(inArray(features.id, ids), eq(features.projectId, pid)));
if (existing.length !== ids.length) return c.json({ error: 'not_found' }, 404);
```
- [ ] **Tests:** URL churn + NEW: member-of-A `PUT /api/projects/A/releases/:id/features {featureIds:[<B feature>]}` → 404 (the §13.1c body-reference case); list isolation; viewer write 403; path-id IDOR on `/:id`.
- [ ] **Web:** thread pid into `useReleases`/`useRelease`/`useCreateRelease`/`useUpdateRelease`/`useDeleteRelease`/`useSetReleaseFeatures`/`useCreateReleaseNotesDoc`/`useGenerateReleaseNotes`; keys `['p', pid, 'releases', ...]`.
- [ ] Commit: `feat(2b2): nest releases + scope release-feature membership body ids`.

## Task A7: Migrate **plans** end-to-end

Applied to `plans.ts`. Specifics:
- [ ] List GET + `/:id` + `/apply`: `loadScoped(plans, id, pid)`; list `where(eq(plans.projectId, pid))`.
- [ ] `POST /`: `getDefaultProjectId()` → pid; `copyFrom='current'` snapshot query gets `where(eq(features.projectId, pid))`; `copyFrom=<planId>` → `loadScoped(plans, copyFrom, pid)`.
- [ ] `PUT /:id/entries/:featureId`: `loadScoped(plans, planId, pid)` AND `loadScoped(features, featureId, pid)` (the 2nd path id).
- [ ] `/apply`: the inner join over `planEntries`→`features` is already constrained to this plan's entries; still `loadScoped(plans, id, pid)` at the top.
- [ ] **Tests:** URL churn + NEW: `PUT /api/projects/A/plans/:id/entries/<B feature>` → 404; `POST` with `copyFrom=<B plan>` → 404; list isolation; viewer write 403.
- [ ] **Web:** thread pid into `usePlans`/`usePlan`/`useCreatePlan`/`useRenamePlan`/`useDeletePlan`/`useUpdatePlanEntry`/`useApplyPlan`; keys `['p', pid, 'plans', ...]`.
- [ ] Commit: `feat(2b2): nest plans + scope copyFrom/entry feature body ids`.

## PR-A final verification (DoD)

- [ ] api tsc → 0; web tsc → 0.
- [ ] `pnpm test` (sandbox off) → green (api grows by new matrix tests; objectives/releases/plans web hooks updated).
- [ ] `pnpm build` → clean.
- [ ] Spike (A2) resolved and documented; method-gate proven (viewer GET 200 / POST 403 / non-member 404; mgmt `/members` still owner-gated).
- [ ] objectives/releases/plans fully nested; their web pages usable against the active project.
- [ ] Unmigrated groups (features/ideas/docs/etc.) still flat and green.
- [ ] `pnpm e2e` — run the outcomes/releases/roadmap specs that were threaded; others may rely on still-flat groups (green) — full e2e need only pass once those groups migrate (PR-B/C). Record which specs pass.
- [ ] Open PR-A.

---

# PR-B — Features cluster + transitive scoping (branch `phase-2b2b-features-cluster`)

The interlinked set where transitive (parent-scoped) wiring lives: `features`, `deps`, `evidence`, `documents`, `comments`, `activity`, `overview`. Follow the A5 recipe per group; specifics below.

## Task B1: Migrate **features** (+ inline project removal)

**Files:** `features.ts`, `app.ts`/`project-scoped.ts`, `features.test.ts`, web `api.ts`.
- [ ] List GET: `where(eq(features.projectId, pid))`.
- [ ] `POST /`: replace `select({id}).from(projects).limit(1)` (the §15b unordered carryover) with `c.get('currentProjectId')`.
- [ ] All `/:id*` (GET/PATCH/DELETE/vote/activity/collaborators): `loadScoped(features, id, pid)`.
- [ ] **`PATCH /:id` body ids:** if `objectiveId` present & non-null → `loadScoped(objectives, objectiveId, pid)`; if `releaseId` present & non-null → `loadScoped(releases, releaseId, pid)`.
- [ ] `PUT /:id/collaborators {userIds}`: userIds are users (global, no projectId) — keep as-is (do NOT scope user ids; membership is a separate concern, out of 2b-2 scope; existing `onConflictDoNothing` stands).
- [ ] **Tests:** URL churn + NEW: path-id IDOR; `PATCH` with `objectiveId`/`releaseId` from project B → 404; list isolation; viewer write/vote 403 (proves §6 viewer-no-vote via the method gate).
- [ ] **Web:** thread pid into `useFeatures`/`useFeature`/`useCreateFeature`/`useUpdateFeature`/`useDeleteFeature`/`useVote`/`useActivity`/`useCollaborators`; **mind the optimistic-cache helpers** (`patchFeatureInCaches`, `applyVoteInCaches`) — their `queryKeys.features`/`feature(id)`/`overview` must become pid-keyed; update `queryKeys` to functions taking pid OR derive keys inline. Keep cache-patch targets consistent or optimistic updates silently no-op.
- [ ] Commit: `feat(2b2): nest features + scope objective/release body ids + pid-keyed caches`.

## Task B2: Migrate **deps** (`/features/:id/dependencies`)

- [ ] Mount `depsRoutes` onto `projectScopedContent` at `/features` (alongside `featuresRoutes`), matching the original dual-mount at `/api/features`.
- [ ] GET + PUT `/:id/dependencies`: `loadScoped(features, id, pid)`.
- [ ] **`blockerIds[]` body scoping:** replace `featuresByIds(blockerIds)` count check with a project-scoped query:
```ts
const blockerRows = await db.select().from(features)
  .where(and(inArray(features.id, blockerIds), eq(features.projectId, pid)));
if (blockerRows.length !== blockerIds.length) return c.json({ error: 'not_found' }, 404);
```
- [ ] The `createsCycle` graph read (`select().from(featureDependencies)`) — edges have no projectId, but since both endpoints are now guaranteed in-project the cycle check is sound; optionally scope by joining to features in pid (note as a comment, not required for v1).
- [ ] **Tests:** URL churn + NEW: `PUT .../A/features/:id/dependencies {blockerIds:[<B feature>]}` → 404; viewer write 403.
- [ ] **Web:** thread pid into `useDependencies`/`useSetDependencies`/`useAllDependencies`; keys `['p', pid, 'features', id, 'dependencies']`.
- [ ] Commit: `feat(2b2): nest feature dependencies + scope blocker body ids`.

## Task B3: Migrate **evidence** (`/features/:id/evidence`, `/evidence/:id`)

- [ ] Mount `evidenceRoutes` onto `projectScopedContent` at `/` (it defines its own `/features/...` + `/evidence/...` prefixes).
- [ ] GET/POST `/features/:id/evidence`: replace `featureExists` with `loadScoped(features, id, pid)`.
- [ ] DELETE `/evidence/:id`: load evidence row, then `loadScoped(features, evidence.featureId, pid)` (2-hop; evidence has no projectId).
- [ ] **Tests:** URL churn + NEW: member-of-A DELETE `/api/projects/A/evidence/<B evidence>` → 404; viewer write 403.
- [ ] **Web:** thread pid into `useEvidence`/`useAddEvidence`/`useDeleteEvidence`; keys `['p', pid, 'features', id, 'evidence']`.
- [ ] Commit: `feat(2b2): nest evidence + scope via parent feature`.

## Task B4: Migrate **documents** (+ exportRoutes)

- [ ] Mount `documentsRoutes` onto `projectScopedContent` at `/documents`; mount `exportRoutes` at `/` (defines `/export.zip`).
- [ ] List GET (`?all` and `?featureId`): `where(eq(documents.projectId, pid))` composed with existing filters via `and`.
- [ ] `POST /`: `loadScoped(features, body.featureId, pid)`; **keep** the global `templateId` existence check unchanged (templates are global — do NOT loadScoped).
- [ ] `GET/PATCH/DELETE/:id` + `/:id/export.md`: `loadScoped(documents, id, pid)`.
- [ ] `exportRoutes /export.zip`: filter both `features` and `documents` by `eq(*.projectId, pid)`.
- [ ] **Tests:** URL churn + NEW: path-id IDOR on `/:id`; `POST {featureId:<B feature>}` → 404; list isolation (`?all` excludes B's docs); export.zip excludes B; viewer write 403.
- [ ] **Web:** thread pid into `useDocument`/`useAllDocuments`/`useCreateDocument`/`useUpdateDocument`/`useDeleteDocument`; export download URL via `apiPath(pid,'export.zip')` and `apiPath(pid,'documents',id,'export.md')`; keys `['p', pid, 'documents', ...]`.
- [ ] Commit: `feat(2b2): nest documents + export.zip + scope featureId body id`.

## Task B5: Migrate **comments**

- [ ] Mount `commentsRoutes` onto `projectScopedContent` at `/comments`.
- [ ] List GET (`?featureId`/`?documentId`): scope the parent — `loadScoped(features, featureId, pid)` or `loadScoped(documents, documentId, pid)` before listing (the list itself filters by that parent id; the loadScoped guards cross-project).
- [ ] `POST /`: `parentId` → `loadScopedComment(parentId, pid)`; else `documentId` → `loadScoped(documents, …, pid)`; else `featureId` → `loadScoped(features, …, pid)`.
- [ ] `PATCH /:id/resolve`, `PATCH /:id`, `DELETE /:id`: `loadScopedComment(id, pid)` (replaces the existence check); keep the existing author-ownership 403 checks.
- [ ] **Tests:** URL churn + NEW: comment on B's feature targeted via `/api/projects/A/comments` → 404; `POST {parentId:<B comment>}` → 404; viewer write 403.
- [ ] **Web:** thread pid into `useComments`/`useAddComment`/`useEditComment`/`useResolveComment`/`useDeleteComment`; `commentsKey` gains pid: `['p', pid, 'comments', featureId|null, documentId|null]`; `invalidateComments` updated.
- [ ] Commit: `feat(2b2): nest comments + scope target/parent body ids via loadScopedComment`.

## Task B6: Migrate **activity** + **overview**

- [ ] **activity:** mount `activityRoutes` onto `projectScopedContent` at `/activity` (the workspace feed). List: `where(and(eq(features.projectId, pid), since?))` — the query already inner-joins `features`, so add the project predicate.
- [ ] **overview:** mount at `/overview`. Replace `select().from(projects).limit(1)` with `c.get('currentProjectId')`; load the project row by pid (`loadScoped` is not applicable to `projects` itself — it has no `projectId` column; do `select().from(projects).where(eq(projects.id, pid))`, 404 if missing). Filter features/docs/comments queries by pid (the open-comments query joins documents — scope via the feature join).
- [ ] **Tests:** URL churn + NEW: activity list isolation (B's activity absent); overview returns only pid's features/attention; viewer GET 200 (read-only allowed).
- [ ] **Web:** thread pid into `useWorkspaceActivity` (key `['p', pid, 'activity','workspace']`) and `useOverview` (key `['p', pid, 'overview']`). **Critical:** `useOverview`'s key is referenced by `patchFeatureInCaches`/`applyVoteInCaches`/comment invalidation — ensure all those now compute the pid-keyed overview key consistently (centralize via a `queryKeys` factory taking pid).
- [ ] Commit: `feat(2b2): nest activity + overview, scope by project`.

## PR-B final verification (DoD)

- [ ] api tsc → 0; web tsc → 0; `pnpm test` (sandbox off) green; `pnpm build` clean.
- [ ] All B-cluster groups nested; transitive (parent-scoped) ids covered: evidence→feature, comment→feature/doc, deps blockers, doc featureId.
- [ ] Cross-project body-reference tests pass for releases/plans/features/deps/documents/comments.
- [ ] `pnpm e2e` — board/feature-page/comments/docs/editor/gantt/export specs green (their groups are now threaded). Record results.
- [ ] Open PR-B.

---

# PR-C — ideas / decisions / copilot / share + cleanup + strong-goal matrix (branch `phase-2b2c-ideas-share-cleanup`)

Finishes nesting, **deletes `getDefaultProjectId`/`project.ts`**, hardens share, and lands the consolidated authorization matrix + e2e.

## Task C1: Migrate **ideas**

- [ ] Mount `ideasRoutes` at `/ideas`.
- [ ] List GET: `where(eq(ideas.projectId, pid))` composed with status filter via `and`.
- [ ] `POST /`: replace the §15b unordered `getDefaultProjectId` with `c.get('currentProjectId')`.
- [ ] `GET/PATCH/DELETE/:id`, `/:id/pitch`, `/:id/vote`, `/:id/promote`: `loadScoped(ideas, id, pid)`. The promote transaction creates a feature with `projectId: idea.projectId` (already correct); pitch doc inherits `idea.projectId` (correct).
- [ ] **Tests:** URL churn + NEW: path-id IDOR; list isolation; viewer write 403 (incl. vote/promote/pitch as POST/PUT).
- [ ] **Web:** thread pid into `useIdeas`/`useIdea`/`useCreateIdea`/`useUpdateIdea`/`useIdeaVote`/`usePromoteIdea`/`useCreatePitch`; keys `['p', pid, 'ideas', ...]`.
- [ ] Commit: `feat(2b2): nest ideas + scope`.

## Task C2: Migrate **decisions**

- [ ] Mount `decisionsRoutes` at `/` (defines `/decisions...` + `/ai/suggest-decision`).
- [ ] List GET `/decisions` (`?featureId`): `where(eq(decisions.projectId, pid))` composed with featureId filter.
- [ ] `POST /decisions`: replace `getDefaultProjectId()` with pid; `featureId` (if present) → `loadScoped(features, featureId, pid)` (this is the §15b "decisions.featureId scoped to the project" carryover); `sourceCommentId` (if present) → `loadScopedComment(sourceCommentId, pid)` (the canonical hard case).
- [ ] `DELETE /decisions/:id`: `loadScoped(decisions, id, pid)`.
- [ ] `POST /ai/suggest-decision {commentId}`: `loadScopedComment(commentId, pid)` before reading the thread.
- [ ] **Tests:** URL churn + NEW: `POST {featureId:<B feature>}` → 404; `POST {sourceCommentId:<B comment>}` → 404; `suggest-decision {commentId:<B comment>}` → 404; list isolation; viewer write 403.
- [ ] **Web:** thread pid into `useDecisions`/`useCreateDecision`/`useSuggestDecision`; keys `['p', pid, 'decisions', ...]`.
- [ ] Commit: `feat(2b2): nest decisions + scope featureId/sourceCommentId body ids`.

## Task C3: Migrate **copilot** (`/ai/review-doc`, `/ai/chat`, `/copilot/nudges`)

- [ ] Mount `copilotRoutes` at `/` (defines `/ai/review-doc`, `/ai/chat`, `/copilot/nudges`). **Note the asymmetry:** `aiRoutes` (`/api/ai/status`) is GLOBAL config and stays top-level — do NOT move it.
- [ ] `POST /ai/review-doc {documentId}`: `loadScoped(documents, documentId, pid)` before reading (and keep the doc/feature inner join).
- [ ] `POST /ai/chat`: scope retrieval — docs (`eq(documents.projectId, pid)`) + features (`eq(features.projectId, pid)`).
- [ ] `GET /copilot/nudges`: scope all 4 queries — staleDrafts (`documents.projectId`), datelessNow (`features.projectId`), oversized (`features.projectId` + the `notExists` doc subquery scoped to feature), staleThreads (comments joined to features/docs — filter via the feature/doc project; safest: add `eq(features.projectId, pid)` OR `eq(documents.projectId, pid)` in an `or` wrapped with the comment-parent join).
- [ ] **Decision to state explicitly:** review-doc/chat/suggest-decision/notes-doc/generate-notes/share-mint are POST and thus **editor-gated** by the method rule → viewers get no AI/mint in v1. This is a deliberate, defensible v1 choice (viewers are strictly read-only per §6). Record it in the commit body.
- [ ] **Tests:** URL churn + NEW: `review-doc {documentId:<B doc>}` → 404; chat/nudges in A never surface B's docs/features (list isolation); viewer POST → 403.
- [ ] **Web:** thread pid into `useCopilotNudges` + the review-doc/chat SSE fetch URLs (these use raw `fetch`/EventSource — update to `apiPath(pid, 'ai', 'review-doc')` etc.); key nudges `['p', pid, 'copilot','nudges']`.
- [ ] Commit: `feat(2b2): nest copilot AI routes + scope retrieval (ai/status stays global)`.

## Task C4: Split & harden **share**

`shareRoutes` splits into a public top-level reader and a nested mint.

- [ ] **Step 1: failing tests** in `share.test.ts`:
  - public `GET /api/share/:token/data` returns ONLY the token's project's features AND releases (add a second project with its own release; assert it is absent — this directly fixes the line-102 leak and proves §13.5).
  - nested `POST /api/projects/:projectId/share/roadmap` mints a token whose `projectId === :projectId`; viewer → 403; non-member → 404.
  - revoke: keep `DELETE /api/share/:token` top-level (authed), but **add a membership check** — resolve `tokenRow.projectId`, then require the caller be a member/super-admin, else 404. Add a test: member-of-A cannot revoke B's token (404).
- [ ] **Step 2: run, confirm FAIL.**
- [ ] **Step 3: implement** — split `share.ts`:
  - `publicShareRoutes` (new Hono, no env): `GET /:token/data` (resolve `tokenRow.projectId`, filter features AND releases by it — fix line 102: `where(eq(releases.projectId, tokenRow.projectId))`) and `DELETE /:token` (revoke; gate by membership on `tokenRow.projectId`). Mounted top-level at `/api/share` (already in the public allowlist in `app.ts:42`).
  - `shareMintRoutes` (MembershipEnv): `POST /roadmap` using `c.get('currentProjectId')` instead of `getDefaultProjectId()`. Mounted on `projectScopedContent` at `/share`.
  - Remove the `getDefaultProjectId` import from `share.ts`.
- [ ] **Step 4: run, confirm PASS.**
- [ ] **Step 5: web** — `useCreateShare` → `apiPath(pid,'share','roadmap')`; `useRevokeShare`/`useShareData` stay on `/api/share/:token...` (public).
- [ ] **Step 6: commit:** `feat(2b2): split share into public reader (project-isolated) + nested mint`.

## Task C5: Delete `getDefaultProjectId` + `project.ts`

- [ ] **Step 1:** confirm zero callers — `grep -rn "getDefaultProjectId" apps/` returns nothing (all migrated in A5-A7, B1, C1-C4).
- [ ] **Step 2:** `git rm apps/api/src/lib/project.ts`. Remove any lingering import lines (there should be none after Step 1).
- [ ] **Step 3:** api tsc → 0 (proves no dangling reference).
- [ ] **Step 4: commit:** `refactor(2b2): remove getDefaultProjectId — projectId now URL-derived everywhere`.

## Task C6: Consolidated strong-goal authorization matrix (§13.1)

**Files:** new `apps/api/src/routes/authz-matrix.test.ts`.

- [ ] **Step 1: write the matrix test** (sandbox off). Set up two projects A and B, a member-of-A (editor), a viewer-of-A, a member-of-B, and a super-admin. Assert across a representative resource set (features, documents, ideas, releases, objectives, plans, decisions, evidence, comments):
  - **(a) role × action:** editor-of-A can CRUD in A; viewer-of-A can read A, all writes → 403; member-of-B cannot touch A (404).
  - **(b) path-id IDOR:** member-of-A GET/PATCH/DELETE on B's resource via `/api/projects/A/<table>/<B id>` → 404 (loop over the path-id inventory §1a).
  - **(c) body-reference rejection:** member-of-A, for each body-id in §1b, sends a B-owned id under A's path → 404/422 (features.objectiveId/releaseId, deps.blockerIds, releases.featureIds, documents.featureId, comments.parentId/featureId/documentId, decisions.featureId/sourceCommentId, plans.copyFrom/entry featureId, copilot.documentId).
  - **super-admin override:** admin actor passes all of the above (effective owner) — but bound to the URL project (super-admin ≠ cross-project mixing: admin on `/api/projects/A/...` still cannot reference a B id in a body → 404).
- [ ] **Step 2: run, confirm PASS** (failures here mean a route missed a `loadScoped` — fix the route, not the test).
- [ ] **Step 3: commit:** `test(2b2): consolidated cross-project authorization matrix (§13.1 a/b/c + super-admin)`.

## Task C7: e2e + web final pass

- [ ] Update all `e2e/*.spec.ts` that assert API URLs or rely on flat paths — most go through the UI so the web threading (done per group) handles them; fix any spec that pokes `/api/...` directly.
- [ ] Confirm the e2e seed creates a membership for the admin actor on the seeded project (it should, via 2a backfill / seed). If the e2e login user has no membership, `GET /api/projects` returns empty → first-run screen → specs fail. Verify and fix the seed/e2e setup if needed (note: super-admin sees all projects via `GET /api/projects`, so an admin actor is safe; a non-admin e2e actor needs a membership row).
- [ ] `pnpm e2e` → full suite green.
- [ ] Commit: `test(2b2): e2e green on nested project paths`.

## PR-C / Stage 2b-2 final verification (DoD — tied to strong goals)

- [ ] **Build/typecheck:** `pnpm --filter @productmap/api exec tsc -p tsconfig.json --noEmit` → 0; web tsc → 0; `pnpm build` clean.
- [ ] **Suite:** `pnpm test` (sandbox off) → all green.
- [ ] **§13.1(a) role matrix:** `authz-matrix.test.ts` passes — editor CRUD, viewer read-only (writes 403), member-of-B blocked.
- [ ] **§13.1(b) path-id IDOR:** member-of-A → 404 on every B resource via path id.
- [ ] **§13.1(c) body-reference:** member-of-A → 404/422 for every body-id in §1b.
- [ ] **§13.1 super-admin:** admin passes, still URL-project-bound.
- [ ] **§13.5 share isolation:** `GET /api/share/:token/data` returns only the token's project (features AND releases); a token never returns another project's data.
- [ ] **List isolation:** every list route has a "second project's rows absent" test passing.
- [ ] **Greppable invariants:**
  - `grep -rn "getDefaultProjectId" apps/` → **zero** matches; `apps/api/src/lib/project.ts` does not exist.
  - No project-scoped router mounted outside `/api/projects/:projectId` (inspect `app.ts`: only `auth`, `admin`, `users`, `templates`, `uploads`, `ai` (status), `projects` mgmt, and the public `share` reader remain top-level; all 14 content groups live on `projectScopedContent`).
- [ ] **§13.4 usable + green between stages:** each commit left the suite green and the app usable; each PR left e2e green.
- [ ] **§13.5 no Phase-1 regressions:** auth, output scrubbing, no-enumeration (404 not 403 for non-members), public share read all pass.
- [ ] **e2e:** `pnpm e2e` green.

---

## PR decomposition (recommendation)

Ship 2b-2 as **3 PRs**, never one 3000-line PR (spec §12/§15):
1. **PR-A — Foundation + template groups:** `projectScopedContent` scaffold + method gate + `currentProjectId` extension + `loadScopedComment`; web provider/path-helper/projects-query/keyed-queries; migrate objectives + releases + plans end-to-end as the template.
2. **PR-B — Features cluster:** features/deps/evidence/documents/comments/activity/overview + all transitive (parent-scoped) body-id wiring.
3. **PR-C — Remainder + cleanup:** ideas/decisions/copilot/share-mint + share-read hardening + **delete getDefaultProjectId/project.ts** + full strong-goal matrix + e2e.

Each PR is internally staged by route-group commits (each commit leaves vitest green and the app usable); e2e is gated at PR boundaries.

---

## Notes for the executor

- **Sandbox:** every vitest/e2e/`pnpm test` command that touches Postgres must run with `dangerouslyDisableSandbox: true`. Symptom of forgetting: `connect EPERM 5432`.
- **`ScopeError` is an `HTTPException(404)`** — it propagates cleanly through `app.onError` (see `app.ts:79-86`), so handlers can just `await loadScoped(...)` without try/catch; the thrown 404 reaches the client. Verify this in the first migrated group (objectives) and rely on it thereafter.
- **422 vs 404:** the spec accepts either for body-reference rejection. Prefer **404** (consistent with `loadScoped`/`ScopeError`, and avoids leaking that the id exists elsewhere). Use 422 only if a body id is structurally invalid (not a uuid) — that's already a zod 400.
- **Templates are global** — never `loadScoped` a `templateId`; keep existing existence checks.
- **Uploads stay global** (spec §9) — out of 2b-2 scope.
- **`ai/status` stays top-level**; only copilot's `/ai/*` move nested. Do not move status.
- **Web query keys:** ALWAYS include pid as the 2nd key element. Centralize via a `queryKeys`/key-factory that takes pid so optimistic-cache patches (`patchFeatureInCaches`, `applyVoteInCaches`, comment/overview invalidation) target the same keys the queries use — mismatched keys make optimistic updates silently no-op.
- **SSE/raw-fetch hooks** (copilot review-doc/chat, share data, export downloads) bypass `fetchJson` — update their URL construction by hand with `apiPath`.
- **Mount ownership:** all `projectScopedContent.route(...)` mounts live in `apps/api/src/routes/project-scoped.ts` (single owner) to avoid `app.ts` churn/conflicts across agents; `app.ts` only mounts `projectScopedContent` once.
- **2b-1 interaction (Task A2):** the spike decides preferred-vs-fallback for the `/api/projects` mgmt + content co-mount. Do A2 first; everything downstream assumes its outcome.
