# E3 — Dashboard (cross-project home)

**Status:** Design / approved for planning
**Date:** 2026-06-23
**Backlog:** `BACKLOG.md` → Must § E3. Build-first epic (fixes multi-project discoverability).
**Scope decision:** Self-contained. Builds only the minimal enabling slices E3 needs; defers full E2 notifications, E1 archive, and #13 search.

---

## 1. Goal

A **user-scoped, cross-project home** at the authed landing (`/app` index). It answers two questions:

1. *What should I do next?* — derived honestly from existing signals (no notifications system yet).
2. *How are the projects I care about doing?* — status rollup across my projects, favorites pinned.

It fixes the discoverability pain: today the project switcher is buried and there is no place that shows all your projects at once.

### In scope
- New cross-project Dashboard at `/app` index.
- Per-user **favorite** (pin) on projects.
- **Project slugs** + a real, addressable single-project Overview URL.
- `activity.projectId` so a cross-project feed is queryable.
- Best-effort, clearly-sourced **next actions** from existing data.
- Search **entry point** only (routes to the existing command palette).

### Explicitly out of scope (other epics)
- E2 notifications/event model, @mentions, email/Slack, `follow`. `nextActions` derives from existing tables, not a notifications table.
- E1 archive/soft-delete (`archivedAt`), share-polish, invite-accept UI.
- #13 Postgres full-text search backend. Dashboard ships only an entry box.

---

## 2. Placement & routing

The authed app lives under `/app/*` (marketing owns public `/`). Today `/app` index renders `Landing.tsx`, a single-project overview.

**Changes:**
- `/app` index → **`Dashboard.tsx`** (new, cross-project).
- The existing single-project overview (`Landing.tsx` and its widgets: VisionHeader, GanttHero, HorizonPanels, AttentionPanel, PulseHeatmap, AiDigestCard) moves to a **slug-addressed project URL: `/app/p/:slug`**, renamed conceptually to "Overview". No widget logic changes — only its route + how it resolves the active project.
- On mount, `/app/p/:slug` resolves the slug → project, sets it as the **active project** (so the existing context-driven nav: Board, Roadmap, Releases, Outcomes continue to work unchanged), then renders the overview.
- Dashboard project cards deep-link to `/app/p/:slug`.
- AppShell nav: "Dashboard" → `/app`. Keep an "Overview" link that points to the active project's `/app/p/:slug`.

**Non-goal:** We do NOT slug-prefix the whole app (board/roadmap stay context-driven). Full slug-based routing is a later E1 concern. Slug routing here is limited to the Overview entry + dashboard deep-links.

---

## 3. Schema (single migration)

New migration file (next number after current head, follow `packages/db/migrations` convention). Drizzle schema updated in `packages/db/src/schema.ts`.

### 3.1 `project_favorites` (new table)
```
project_favorites:
  userId    uuid REFERENCES users(id) ON DELETE CASCADE
  projectId uuid REFERENCES projects(id) ON DELETE CASCADE
  createdAt timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (userId, projectId)
```
Per-user pin. A dedicated table — **not** a `memberships.favorite` column — because the primary user is an instance **admin** (`auth.ts`: first registered user gets `role: 'admin'`), and admins bypass membership entirely (`membership.ts`: `role === 'admin'` → effective owner with **no membership row**). A favorite flag on `memberships` would silently no-op for any admin-accessed project they didn't create. The standalone join table works for members and admins alike and is decoupled from membership.

### 3.2 `projects.slug`
```
slug text  -- unique, lowercase kebab
```
- Migration: add nullable → backfill every existing project (`slugify(name)`, append `-2`, `-3`… on collision) → add UNIQUE constraint → set NOT NULL.
- Generated on project create from `name`; editable in Settings → Project.
- Renaming the slug changes the URL (no redirect history in v1 — documented limitation; renaming `name` does NOT auto-change an existing slug).
- `slugify`: lowercase, strip non-alphanumeric to `-`, collapse repeats, trim, max ~60 chars, fallback to short id-suffix if empty.

### 3.3 `activity.projectId`
```
project_id uuid REFERENCES projects(id) ON DELETE CASCADE
```
- Migration: add nullable → backfill from `features.projectId` via join on `activity.featureId` → set NOT NULL.
- **Write path:** every site that inserts into `activity` must now also write `projectId`. Audit all insert call-sites (feature create/update routes, status/horizon/date changes). Add a thin helper `recordActivity({ featureId, projectId, actorId, kind, payload })` if one doesn't exist, and route all inserts through it so projectId can't be forgotten.
- `activity.featureId` stays NOT NULL (every event is still feature-tied for now). `projectId` is the denormalized scope key for cross-project queries.

---

## 4. Backend

### 4.1 `GET /api/dashboard` (new, user-scoped)
Mounted at `/api/dashboard`, guarded by `requireAuth` **only** — it is NOT project-scoped (`requireMembership` is per-project; the dashboard spans projects). Resolves `currentUser.id` and returns one aggregate payload.

**Project set = (projects the user is a member of) ∪ (projects the user has favorited).** This rule is **the same for admins** — the dashboard stays personal. Admins are NOT shown every project in the instance (they can still reach any project via the switcher / direct URL); the dashboard reflects only what they've joined or pinned. This avoids an admin's home listing the entire system.

**Performance contract:** No N+1 across projects. Every sub-resolver is a single set-based query keyed by the user's project-id list (or grouped by `projectId`). Target ≤ ~6 queries total regardless of project count.

Response shape (add to `packages/shared/src/api-types.ts`):
```ts
interface DashboardResponse {
  projects: DashboardProject[];   // member projects, favorites first
  nextActions: NextAction[];      // best-effort, sourced
  myWork: MyWorkItem[];           // features I collaborate on
  activity: DashboardActivityItem[]; // cross-project, newest first, capped
}

interface DashboardProject {
  id: string; name: string; slug: string;
  role: 'owner' | 'editor' | 'viewer';
  favorite: boolean;
  counts: { idea: number; planned: number; in_progress: number; shipped: number };
  nextRelease: { id: string; name: string; date: string | null } | null;
  staleCount: number;   // overdue/blocked heuristic (e.g. endDate < now && status != shipped)
}

type NextAction =
  | { kind: 'open_comment'; source: 'authored' | 'collaborating';
      projectId: string; projectSlug: string; featureId?: string; documentId?: string;
      title: string; count: number }
  | { kind: 'doc_in_review'; projectId: string; projectSlug: string;
      documentId: string; featureId: string; title: string; docType: string }
  | { kind: 'feature_missing_dates'; projectId: string; projectSlug: string;
      featureId: string; title: string };

interface MyWorkItem {
  featureId: string; projectId: string; projectSlug: string;
  title: string; status: string; horizon: string;
}

interface DashboardActivityItem extends WorkspaceActivityItem { projectId: string; projectSlug: string; }
```

**`nextActions` derivation (honest, existing signals only):**
- `open_comment` — unresolved comment threads on features/docs the user **authored** or **collaborates on** (`featureCollaborators`). Grouped by item, counted.
- `doc_in_review` — documents with status **`in_review` only** (NOT `draft` — draft is WIP, not something to act on; including it would flood the panel with every unfinished doc) and authored by the user OR on a feature the user collaborates on.
- `feature_missing_dates` — features where the user is a collaborator and `startDate`/`endDate` is null.
- **Actionability rule:** every item must be genuinely *the user's to act on*. Anything that isn't gets excluded — the panel is noise-free or it gets ignored. Each carries enough to deep-link. Honest empty state when there's nothing. This set grows when E2 lands (@mentions, assignments).

**`staleCount` heuristic (v1):** features with `endDate < now()` and `status != 'shipped'`. Documented as a simple heuristic; refined later.

### 4.2 `POST` / `DELETE /api/projects/:projectId/favorite`
Guarded by `requireMembership('viewer')` (which already grants admins access). Inserts / deletes a `project_favorites` row for `(currentUser.id, projectId)` — `POST` uses `onConflictDoNothing`, `DELETE` removes. Returns `{ favorite: boolean }`. Idempotent. Works for admins (no membership row needed — the row lives in `project_favorites`).

### 4.3 Slug support on project routes
- `POST /api/projects` — generate + persist `slug` from `name` (collision-safe).
- `PATCH /api/projects/:projectId` — accept optional `slug`; validate (format + uniqueness), 409 on collision.
- `GET /api/projects` — include `slug` in the list payload (switcher/dashboard need it).
- New resolve path: `GET /api/projects/:projectId` already returns by id; add `slug` to its payload. Slug→project resolution on the frontend uses the `GET /api/projects` list (already loaded into `ActiveProjectProvider`), so **no new by-slug endpoint is required** — the client maps slug→id from the list it already has. (If the list is large later, add `GET /api/projects/by-slug/:slug`; not needed now.)

---

## 5. Frontend

### 5.1 `Dashboard.tsx` (`/app` index)
- `useDashboard()` query hook — **user-scoped** query key `['dashboard']` (NOT pid-scoped, since it spans projects). `fetchJson<DashboardResponse>('/api/dashboard')`.
- Layout (mobile-responsive, matches existing Soft Studio + shadcn conventions):
  - **NextActions** panel — sourced list, each row deep-links; honest empty state.
  - **MyProjects** — grid of project cards: name, role badge, status rollup bar/counts, next release, stale count, **favorite pin** (toggle). Favorites sort to top. Card click → `/app/p/:slug`. "New project…" affordance + empty/onboarding state when user has no projects.
  - **MyWork** — compact list of features I collaborate on, grouped by status, deep-linked.
  - **ActivityFeed** — cross-project recent activity (reuse existing activity row rendering; show project chip).
  - **Search entry box** — opens the existing CommandPalette (AppShell already has one). No new search backend.

### 5.2 Hooks (`apps/web/src/lib/api.ts`)
- `useDashboard()` — as above.
- `useToggleFavorite()` — mutation hitting POST/DELETE favorite; **optimistic** update of the dashboard cache + invalidate on settle; follows the existing `useUpdateFeature` optimistic pattern.
- `queryKeys.dashboard = ['dashboard']` added.

### 5.3 Overview route move
- Add route `/app/p/:slug` → renders the existing Landing component (now "Overview").
- A small wrapper resolves `:slug` → project (from the projects list in `ActiveProjectProvider`), sets active project, and renders Overview. 404 state if slug unknown.
- Update `lib/routes.ts`: `appRoutes.dashboard = '/app'`, add `appRoutes.overview(slug) => '/app/p/' + slug`.
- AppShell nav: "Dashboard" → `/app`; "Overview" → active project's `/app/p/:slug`.

### 5.4 Settings → Project
- Add an editable **slug** field (prefilled, with a "regenerate from name" affordance). Validates format client-side; surfaces 409 collision from the API.

---

## 6. Testing

**API (vitest, `apps/api/src/**/*.test.ts`, existing test helpers):**
- `GET /api/dashboard`: returns only the caller's member projects; **isolation** — project B (not a member) never appears in projects/activity/nextActions/myWork.
- Favorites sort first; counts/rollup correct; `nextActions` derivation for each kind; honest empty payload for a user with no projects.
- Favorite toggle: POST sets, DELETE clears, idempotent, membership-gated (non-member 404).
- Slug: generated on create, collision-safe; PATCH uniqueness 409; backfill migration leaves every project with a unique slug.
- `activity.projectId`: backfill correctness; new inserts carry projectId; cross-project query returns the right scope.

**Web (vitest + MSW, `apps/web/src/**/*.test.tsx`):**
- Dashboard renders projects/nextActions/myWork/feed from mocked payload.
- Empty/onboarding state (no projects).
- Favorite pin: optimistic toggle + re-sort.
- `/app/p/:slug` resolves a known slug and 404s an unknown one.

---

## 7. Build units (decomposition for parallelism)

1. **Schema migration** — `memberships.favorite`, `projects.slug` (backfill+unique+notnull), `activity.projectId` (backfill+notnull). Blocks everything. *(serial, first)*
2. **Activity write-path** — `recordActivity` helper; route all inserts through it; set projectId everywhere. *(after 1)*
3. **Slug on project routes** — create/patch/list payloads + validation. *(after 1)*
4. **`GET /api/dashboard` endpoint** + shared types. *(after 1, parallel with 3/5)*
5. **Favorite endpoint.** *(after 1, small)*
6. **Frontend** — Dashboard page + sub-components, hooks, Overview route move, settings slug field. *(after types from 4 exist; can stub against the typed contract)*
7. **Tests** — API + web, authored alongside their units (TDD where practical).

**Sequencing to avoid merge thrash:** units 2–6 collide on shared files (`schema.ts`, `api-types.ts`, `app.ts` route registration, `lib/api.ts`, `routes.ts`). Do NOT fan these out in parallel worktrees — they'd thrash on the same files. Instead, **one foundation agent first** lands: unit 1 (schema + migration), the frozen `DashboardResponse`/types contract in `api-types.ts`, the `/api/dashboard` route-registration skeleton in `app.ts`, and `queryKeys.dashboard` — then commit. **Then** fan out endpoint / favorite / slug-routes / frontend / tests against the frozen contract, each owning distinct files.

## 7a. Strong goals (acceptance — the build is measured against these)

1. **Isolation (security-critical):** with a 2-user × 2-project fixture, a user sees only their member/favorited projects — **zero** non-member rows in *all four* response sections (projects, nextActions, myWork, activity). One explicit assertion per section.
2. **Bounded queries:** `/api/dashboard` runs a fixed, small set of set-based queries (≤ ~6) independent of project/feature count — no per-project loop.
3. **Zero regression:** the moved Overview renders identically at `/app/p/:slug`; board/roadmap/releases/outcomes still resolve via active-project context; the existing test suite stays green.
4. **Honest next actions:** every item deep-links to a real target; correct empty state; nothing surfaced that isn't actually the user's to act on.
5. **End-to-end types:** one shared `DashboardResponse` drives server + client; `pnpm -r typecheck` and build pass.
6. **Migration safety:** backfill leaves **zero nulls** before each NOT NULL flip; runs clean on existing + test DB; all activity inserts route through one `recordActivity` helper so `projectId` can't be omitted — a test exercises each activity-producing action.
7. **Favorites correct for the primary user:** favoriting works for the **admin** account on a project with no membership row (verified via `project_favorites`, per §3.1).
8. **Slug integrity:** every project has a unique slug post-migration; create is collision-safe; PATCH collision returns 409; `/app/p/:slug` resolves known slugs and 404s unknown ones.

---

## 8. Known limitations (documented, deferred)
- `nextActions` is best-effort; richens with E2 (no @mentions/assignments-as-notifications yet).
- Slug rename changes URL with no redirect from the old slug.
- `staleCount` is a date heuristic, not a real "blocked" model.
- No archive — archived/soft-deleted projects are an E1 concern; all member projects show.
- Cross-project feed capped (reuse the existing 1000-row cap pattern, newest-first).
