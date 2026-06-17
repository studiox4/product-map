# Phase 3A — App Route Migration to `/app/*` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every authenticated route under an `/app/*` prefix behind a single typed route-builder module, keeping `/login`, `/register`, `/share/:token`, `/invite/:token` public and making `/` redirect to `/app` so the app ships standalone before the marketing page (Phase 3B) replaces `/`.

**Architecture:** A new `apps/web/src/lib/routes.ts` owns `APP_BASE = '/app'`, an `appRoutes` builder object (concrete URL strings) AND `appPatterns` (react-router path patterns for `matchPath`). `App.tsx` mounts the authed subtree under a nested `<Route path="/app">` parent (children become relative: `path="board"`); the chrome-free reader becomes a separate top-level `/app/docs/:id/read` route. Every scattered path literal in nav, command palette, widgets, redirects, auth, and e2e migrates to the builders/patterns. A grep gate enforces that no raw app-path literal survives outside `lib/routes.ts` + test files. This is mechanical and wide; the suite stays green at each commit.

**Tech Stack:** Vite + React 18, `react-router-dom` v6 (`<Routes>/<Route>`, `matchPath`, `<Navigate>`), Vitest + Testing Library (jsdom, no Postgres), Playwright e2e (vite dev server `baseURL: http://localhost:5173`), pnpm workspaces (`@productmap/web`).

---

## File Structure

### Created
- `apps/web/src/lib/routes.ts` — **single source of truth** for app paths. Exports:
  - `APP_BASE = '/app'`.
  - `appRoutes` — typed builders returning **clean base URL strings** (no query/hash): `dashboard`, `board`, `roadmap`, `inbox`, `outcomes`, `releases`, `release(id)`, `feature(id)`, `docs`, `doc(id)`, `docRead(id)`, `settings`, `settingsTab(tab)`, `templateEditor(id)`.
  - `appPatterns` — react-router **path patterns** for `matchPath`/equality in CommandPalette + recents: `board`, `feature`, `doc` (e.g. `appPatterns.feature = '/app/features/:id'`).
  - Callers append `?query`/`#hash` themselves (e.g. `appRoutes.board + '?feature=' + id`); builders never embed query strings.
- `apps/web/src/lib/routes.test.ts` — unit tests for the builders + patterns.

### Modified — routing core
- `apps/web/src/App.tsx` — authed subtree moves under a nested `<Route path="/app">` parent with relative children; add `<Route path="/" element={<Navigate to="/app" replace />} />`; reader becomes top-level `/app/docs/:id/read`; settings index/`*` `<Navigate>` targets become `/app/settings/templates`.

### Modified — nav / command surfaces
- `apps/web/src/components/AppShell.tsx` — `NAV_LINKS`, `PLAN_LINKS`, `DOCS_LINK`, logo `<Link to="/">`, settings `<NavLink to="/settings">`.
- `apps/web/src/components/command/CommandPalette.tsx` — `NAV_TARGETS` table, `matchPath('/features/:id')`, `location.pathname === '/board'`, `matchPath('/docs/:id')`, `go('/features/...')`, `go('/inbox?new=1')`, recents `go(...)`.
- `apps/web/src/components/command/recents.ts` — `matchPath('/features/:id')`, `matchPath('/docs/:id')`.
- `apps/web/src/routes/Settings.tsx` — `BASE_TABS` + `ADMIN_TABS` `to` literals.

### Modified — redirects / auth
- `apps/web/src/routes/Login.tsx` — `safeNext` default `/`→`/app`; "No account?" link comparison `next !== '/'`→`next !== appRoutes.dashboard`.
- `apps/web/src/routes/Register.tsx` — (imports `safeNext` from Login; no literal change, but verify).
- `apps/web/src/routes/AcceptInvite.tsx` — success `navigate('/')`→`navigate(appRoutes.dashboard)`.

### Modified — widget / link literals (batched)
- `apps/web/src/components/ProjectSwitcher.tsx` — `<Link to="/?new=1">`→`appRoutes.dashboard + '?new=1'`.
- `apps/web/src/components/NewProjectDialog.tsx` — `navigate('/', { replace: true })`.
- `apps/web/src/routes/FeaturePage.tsx` — `navigate('/board')`, `<Link to="/board">`.
- `apps/web/src/routes/TemplateEditor.tsx` — two `<Link to="/settings">` (stays a child of `/app` layout).
- `apps/web/src/routes/doc-back-link.ts` — `/board?feature=`, `/inbox?idea=`, `/docs`.
- `apps/web/src/components/board/FeatureDetailPanel.tsx` — `navigate('/docs/...')`, `navigate('/features/...')`.
- `apps/web/src/components/board/NewDocDialog.tsx` — `navigate('/docs/...')`.
- `apps/web/src/components/docs/DocPreviewSheet.tsx` — `navigate('/docs/...')`.
- `apps/web/src/components/docs/DocsTable.tsx` — `ownerHref` (`/inbox?idea=`, `/releases/`, `/features/`).
- `apps/web/src/components/feature/DocsGrid.tsx` — `navigate('/docs/...')`.
- `apps/web/src/components/feature/DependenciesRail.tsx` — two `<Link to={`/features/...`}>`.
- `apps/web/src/components/feature/ObjectiveCard.tsx` *(actually `components/outcomes/ObjectiveCard.tsx`)* — `<Link to={`/features/...`}>`.
- `apps/web/src/components/inbox/IdeaDetailPane.tsx` — `navigate('/docs/...')`.
- `apps/web/src/components/landing/AttentionPanel.tsx` — `/features/...#comments`, `/docs/...`, `/board?feature=`.
- `apps/web/src/components/landing/HorizonPanel.tsx` — `/board?feature=`, `<Link to="/board">`.
- `apps/web/src/components/landing/GanttHero.tsx` — `/roadmap?feature=`.
- `apps/web/src/components/releases/ReleaseCard.tsx` — `<Link to={`/releases/...`}>`.
- `apps/web/src/components/releases/ReleaseDetail.tsx` — two `navigate('/docs/...')`, two `<Link to="/releases">`.
- `apps/web/src/components/settings/TemplatesTab.tsx` — two `navigate('/settings/templates/...')`.
- `apps/web/src/components/copilot/CopilotPanel.tsx` — `linkifyDocTitles` generated `href="/docs/..."` (HTML string) + the `go(href)` nudge navigate (verify nudge targets build via routes.ts).

### Modified — tests (same task as the code they cover; excluded from grep gate)
- `apps/web/src/routes/routes.test.ts` (new, above).
- `apps/web/src/routes/Login.test.tsx` — `safeNext` default + open-redirect cases now expect `/app`.
- `apps/web/src/routes/Landing.test.tsx` — navigation assertions + `<Route path>` harness → `/app/...`.
- `apps/web/src/components/command/CommandPalette.test.tsx` — `initialEntries` + context detection → `/app/...`.
- `apps/web/src/routes/AcceptInvite.test.tsx` — comment/assertion mentioning `/` (no functional path literal, verify).

### Modified — e2e (all `goto`/`toHaveURL`/`waitForURL` app paths → `/app/...`)
- `e2e/auth.setup.ts`, `e2e/board.spec.ts`, `e2e/comments.spec.ts`, `e2e/docs-page.spec.ts`, `e2e/dream-tier.spec.ts`, `e2e/editor.spec.ts`, `e2e/export.spec.ts`, `e2e/feature-page.spec.ts`, `e2e/gantt.spec.ts`, `e2e/landing.spec.ts`, `e2e/profile.spec.ts`, `e2e/settings.spec.ts`, `e2e/signature-w1.spec.ts`, `e2e/signature-w2.spec.ts`, `e2e/ux.spec.ts`, `e2e/voting.spec.ts`, `e2e/ai.spec.ts`. (`e2e/helpers.ts` uses only `/api/...` — leave it.)

### Deliberately NOT migrated
- `apps/web/src/routes/SharePage.tsx` footer `<Link to="/">` — points at the **public root**, not an app route. Leave as `/`. The bare-`/` literal is not flagged by the gate. NOTE for controller: during PR A a logged-out share viewer clicking it hits `/`→`/app`→`/login` (the spec explicitly accepts PR A shipping standalone with `/`→`/app`). Acceptable, not a blocker.
- `apps/web/src/lib/auth.tsx` `<Navigate to="/login">` — `/login` is public, unchanged.

---

## Task 1: Create `lib/routes.ts` (builders + patterns)

**Files:**
- Create: `apps/web/src/lib/routes.ts`
- Test: `apps/web/src/lib/routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { APP_BASE, appRoutes, appPatterns } from './routes';

describe('appRoutes builders', () => {
  it('APP_BASE is /app', () => {
    expect(APP_BASE).toBe('/app');
  });

  it('static routes are prefixed', () => {
    expect(appRoutes.dashboard).toBe('/app');
    expect(appRoutes.board).toBe('/app/board');
    expect(appRoutes.roadmap).toBe('/app/roadmap');
    expect(appRoutes.inbox).toBe('/app/inbox');
    expect(appRoutes.outcomes).toBe('/app/outcomes');
    expect(appRoutes.releases).toBe('/app/releases');
    expect(appRoutes.docs).toBe('/app/docs');
    expect(appRoutes.settings).toBe('/app/settings');
  });

  it('parameterized routes build the full path', () => {
    expect(appRoutes.release('r1')).toBe('/app/releases/r1');
    expect(appRoutes.feature('f1')).toBe('/app/features/f1');
    expect(appRoutes.doc('d1')).toBe('/app/docs/d1');
    expect(appRoutes.docRead('d1')).toBe('/app/docs/d1/read');
    expect(appRoutes.settingsTab('workspace')).toBe('/app/settings/workspace');
    expect(appRoutes.templateEditor('t1')).toBe('/app/settings/templates/t1');
  });

  it('builders return clean base paths with no query/hash', () => {
    expect(appRoutes.board).not.toContain('?');
    expect(appRoutes.feature('f1')).not.toContain('#');
  });

  it('matchPath patterns carry the /app prefix', () => {
    expect(appPatterns.board).toBe('/app/board');
    expect(appPatterns.feature).toBe('/app/features/:id');
    expect(appPatterns.doc).toBe('/app/docs/:id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/lib/routes.test.ts`
Expected: FAIL — `Failed to resolve import "./routes"` / `appRoutes is not defined`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/routes.ts`:

```ts
/**
 * Single source of truth for in-app route paths (Phase 3A).
 *
 * The authenticated application lives under `/app/*`. Every in-app `<Link>`,
 * `<NavLink>`, `navigate(...)`, command-palette target, and `matchPath` check
 * must go through this module — never a raw string literal. A grep gate in CI
 * enforces it.
 *
 * - `appRoutes`  → concrete URL strings (no query/hash). Callers append
 *                  `?query`/`#hash` themselves: `appRoutes.board + '?feature=' + id`.
 * - `appPatterns`→ react-router path patterns for `matchPath`/equality checks.
 */
export const APP_BASE = '/app';

export const appRoutes = {
  dashboard: APP_BASE,
  board: `${APP_BASE}/board`,
  roadmap: `${APP_BASE}/roadmap`,
  inbox: `${APP_BASE}/inbox`,
  outcomes: `${APP_BASE}/outcomes`,
  releases: `${APP_BASE}/releases`,
  release: (id: string) => `${APP_BASE}/releases/${id}`,
  feature: (id: string) => `${APP_BASE}/features/${id}`,
  docs: `${APP_BASE}/docs`,
  doc: (id: string) => `${APP_BASE}/docs/${id}`,
  docRead: (id: string) => `${APP_BASE}/docs/${id}/read`,
  settings: `${APP_BASE}/settings`,
  settingsTab: (tab: string) => `${APP_BASE}/settings/${tab}`,
  templateEditor: (id: string) => `${APP_BASE}/settings/templates/${id}`,
} as const;

/** Path patterns for `matchPath`/equality context detection. */
export const appPatterns = {
  board: `${APP_BASE}/board`,
  feature: `${APP_BASE}/features/:id`,
  doc: `${APP_BASE}/docs/:id`,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/lib/routes.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/routes.ts apps/web/src/lib/routes.test.ts
git commit -m "feat(web): add lib/routes.ts app-path builders + matchPath patterns"
```

---

## Task 2: Migrate `App.tsx` routing + add `/`→`/app` redirect

**Files:**
- Modify: `apps/web/src/App.tsx`

**Approach:** Convert the authed subtree to a **nested** `<Route path="/app">` parent with **relative** children (`path="board"`, etc.). This keeps `App.tsx` out of the grep gate (children are relative literals like `"board"`, not `"/board"`). The settings nested `<Navigate>` and the reader route use absolute `/app/...` (the reader is a separate top-level route).

- [ ] **Step 1: Write the failing test**

This task is structural routing; the failing signal is the existing suite breaking on old paths (covered by Task 7's test updates) and `tsc`. Add no new test here — verify via `tsc` + an existing routing-dependent test. Skip to the implementation and rely on Step 2's typecheck.

- [ ] **Step 2: Run typecheck to capture the baseline**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit`
Expected: PASS (0 errors) before the edit — confirms a clean starting point.

- [ ] **Step 3: Edit `App.tsx`**

Add the import near the top (after line 11):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the `<Routes>...</Routes>` block (lines 89–231) with:

```tsx
          <Routes>
            {/* Public routes — no auth required. */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {/* PR A: `/` redirects to the app (Phase 3B replaces this with Marketing). */}
            <Route path="/" element={<Navigate to={appRoutes.dashboard} replace />} />
            {/* Authed application — everything under /app/*. */}
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <ActiveProjectProvider>
                    <AuthedShell />
                  </ActiveProjectProvider>
                </RequireAuth>
              }
            >
              <Route index element={<Landing />} />
              {/* Idea Inbox (inbox agent route line). */}
              <Route
                path="inbox"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <InboxPage />
                  </Suspense>
                }
              />
              <Route
                path="board"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <BoardPage />
                  </Suspense>
                }
              />
              <Route
                path="roadmap"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RoadmapPage />
                  </Suspense>
                }
              />
              <Route
                path="features/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <FeaturePage />
                  </Suspense>
                }
              />
              {/* Releases + Outcomes (releases+outcomes agent route lines). */}
              <Route
                path="releases"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ReleasesPage />
                  </Suspense>
                }
              />
              <Route
                path="releases/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ReleaseDetailPage />
                  </Suspense>
                }
              />
              <Route
                path="outcomes"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <OutcomesPage />
                  </Suspense>
                }
              />
              <Route
                path="docs"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <DocsPage />
                  </Suspense>
                }
              />
              <Route
                path="docs/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <DocPage />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <SettingsPage />
                  </Suspense>
                }
              >
                {/* Settings shell: tab content renders via <Outlet/> (own Suspense). */}
                <Route index element={<Navigate to="/app/settings/templates" replace />} />
                <Route path="templates" element={<TemplatesTab />} />
                <Route path="workspace" element={<WorkspaceTab />} />
                <Route path="profile" element={<ProfileTab />} />
                <Route path="project" element={<ProjectTab />} />
                <Route path="users" element={<UsersTab />} />
                {/* Unknown tabs fall back to Templates. */}
                <Route path="*" element={<Navigate to="/app/settings/templates" replace />} />
              </Route>
              {/* Template editor: full-page Tiptap chrome, child of /app layout. */}
              <Route
                path="settings/templates/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TemplateEditorPage />
                  </Suspense>
                }
              />
            </Route>
            {/* Public read-only share page (dream tier D8) — outside AppShell, no auth. */}
            <Route
              path="/share/:token"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <SharePage />
                </Suspense>
              }
            />
            {/* Accept-invite — sibling of /share/:token, outside the active-project
                gate; the page handles its own auth check + login redirect. */}
            <Route
              path="/invite/:token"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <AcceptInvitePage />
                </Suspense>
              }
            />
            {/* Chrome-free reader view (spec 2.3) — separate top-level /app route,
                NOT nested under the AuthedShell layout; auth-gated AND project-scoped. */}
            <Route
              path="/app/docs/:id/read"
              element={
                <RequireAuth>
                  <ProjectProvider>
                    <Suspense fallback={<RouteFallback />}>
                      <ReaderView />
                    </Suspense>
                  </ProjectProvider>
                </RequireAuth>
              }
            />
          </Routes>
```

> NOTE: The settings `<Navigate>` and reader use absolute `/app/...` string literals — these live in `App.tsx`, which the grep gate **excludes** (App.tsx is the routing-definition file). The gate command in Task 9 excludes `App.tsx`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): mount authed subtree under /app/* with /->/app redirect"
```

---

## Task 3: Migrate `AppShell.tsx` nav links

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`

- [ ] **Step 1: Confirm the suite is green pre-edit**

Run: `pnpm --filter @productmap/web exec vitest run src/components/command`
Expected: PASS (baseline; AppShell has no dedicated test — palette tests exercise nearby code).

- [ ] **Step 2: Edit `AppShell.tsx`**

Add the import (after line 19, `import { cn } ...`):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the `NAV_LINKS`, `PLAN_LINKS`, `DOCS_LINK` blocks (lines 21–34):

```tsx
const NAV_LINKS: { to: string; label: string; end: boolean; icon?: typeof Lightbulb }[] = [
  { to: appRoutes.dashboard, label: 'Overview', end: true },
  { to: appRoutes.inbox, label: 'Inbox', end: false, icon: Lightbulb },
];

/** Planning surfaces grouped under one "Plan" pill to keep the nav calm. */
const PLAN_LINKS: { to: string; label: string }[] = [
  { to: appRoutes.board, label: 'Board' },
  { to: appRoutes.roadmap, label: 'Roadmap' },
  { to: appRoutes.releases, label: 'Releases' },
  { to: appRoutes.outcomes, label: 'Outcomes' },
];

const DOCS_LINK = { to: appRoutes.docs, label: 'Docs', end: true };
```

Replace the logo `<Link to="/"` (line 67) with:

```tsx
            to={appRoutes.dashboard}
```

Replace the settings `<NavLink to="/settings"` (line 141) with:

```tsx
              to={appRoutes.settings}
```

> NOTE: `planActive` uses `location.pathname.startsWith(l.to)` (line 49) and the dropdown active check uses `startsWith(link.to)` (line 98). With `/app`-prefixed values these still work correctly — `/app/board` starts with `/app/board`. The `end` flag on the Overview `NavLink` (line 79) keeps `/app` from matching as active on every child route. No logic change needed.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/AppShell.tsx
git commit -m "refactor(web): route AppShell nav through appRoutes"
```

---

## Task 4: Migrate `CommandPalette.tsx` + `recents.ts` (route table + matchPath context)

**Files:**
- Modify: `apps/web/src/components/command/CommandPalette.tsx`
- Modify: `apps/web/src/components/command/recents.ts`
- Test: `apps/web/src/components/command/CommandPalette.test.tsx`

**Why both together:** CommandPalette's context detection (`matchPath`/equality) and recents' `matchPath` reference the OLD paths. If only one moves, context detection or recents tracking silently breaks. The test harness's `initialEntries` also references old paths and must move in lockstep.

- [ ] **Step 1: Update the test harness + assertions (failing first)**

In `apps/web/src/components/command/CommandPalette.test.tsx`:
- The `renderHarness(entries: string[] = ['/'])` default and any test passing context paths (`'/features/<id>'`, `'/board'`, `'/board?feature=<id>'`, `'/docs/<id>'`) must become `'/app/features/<id>'`, `'/app/board'`, `'/app/board?feature=<id>'`, `'/app/docs/<id>'`.
- Any assertion checking a navigated location text (`/features/<id>`, `/inbox?new=1`, `/docs/<id>`) becomes the `/app/...` form.

Read the file first and apply each substitution. Example representative edit — context-feature test entry:

Before:
```tsx
    renderHarness(['/features/feat-1']);
```
After:
```tsx
    renderHarness(['/app/features/feat-1']);
```

- [ ] **Step 2: Run the palette test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/components/command/CommandPalette.test.tsx`
Expected: FAIL — context actions/nav assertions mismatch because `CommandPalette.tsx` still matches old paths against the new `/app/...` entries.

- [ ] **Step 3: Edit `CommandPalette.tsx`**

Add the import (after line 41, `import { navigateWithTransition } ...`):

```tsx
import { appRoutes, appPatterns } from '@/lib/routes';
```

Replace the `NAV_TARGETS` block (lines 63–72):

```tsx
const NAV_TARGETS = [
  { to: appRoutes.dashboard, label: 'Overview', icon: LayoutDashboard },
  { to: appRoutes.inbox, label: 'Inbox', icon: Lightbulb },
  { to: appRoutes.board, label: 'Board', icon: Columns3 },
  { to: appRoutes.roadmap, label: 'Roadmap', icon: GanttChart },
  { to: appRoutes.releases, label: 'Releases', icon: Rocket },
  { to: appRoutes.outcomes, label: 'Outcomes', icon: Target },
  { to: appRoutes.docs, label: 'Docs', icon: Library },
  { to: appRoutes.settings, label: 'Settings', icon: Settings },
];
```

Replace the context-detection block (lines 132–141):

```tsx
  // ---- context (feature page, board peek, doc editor) ----
  const featureMatch = matchPath(appPatterns.feature, location.pathname);
  const peekId =
    location.pathname === appPatterns.board
      ? new URLSearchParams(location.search).get('feature')
      : null;
  const contextFeatureId = featureMatch?.params.id ?? peekId ?? null;
  const contextFeature = contextFeatureId
    ? (features.find((f) => f.id === contextFeatureId) ?? null)
    : null;
  const contextDocId = matchPath(appPatterns.doc, location.pathname)?.params.id ?? null;
```

Replace the create-feature success navigate (line 169):

```tsx
          go(appRoutes.feature(feature.id));
```

Replace the recents `go(...)` (line 272):

```tsx
                        go(entry.kind === 'feature' ? appRoutes.feature(entry.id) : appRoutes.doc(entry.id))
```

Replace the feature nav `go(...)` (line 355):

```tsx
                  onSelect={() => go(appRoutes.feature(feature.id))}
```

Replace the doc nav `go(...)` (line 368):

```tsx
                  onSelect={() => go(appRoutes.doc(doc.id))}
```

Replace the "New idea…" `go(...)` (line 392) — append the query to the base builder:

```tsx
                onSelect={() => go(`${appRoutes.inbox}?new=1`)}
```

- [ ] **Step 4: Edit `recents.ts`**

Add the import (after line 6, `import { useProjectId } ...`):

```tsx
import { appPatterns } from '@/lib/routes';
```

Replace the two `matchPath` lines (lines 65–66):

```tsx
    const featureMatch = matchPath(appPatterns.feature, location.pathname);
    const docMatch = matchPath(appPatterns.doc, location.pathname);
```

- [ ] **Step 5: Run the palette test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/components/command/CommandPalette.test.tsx`
Expected: PASS — all palette tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/command/CommandPalette.tsx apps/web/src/components/command/recents.ts apps/web/src/components/command/CommandPalette.test.tsx
git commit -m "refactor(web): route command palette + recents through appRoutes/appPatterns"
```

---

## Task 5: Migrate `Settings.tsx` tab rail

**Files:**
- Modify: `apps/web/src/routes/Settings.tsx`

- [ ] **Step 1: Edit `Settings.tsx`**

Add the import (after line 6, `import { useAuth } ...`):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the `BASE_TABS` + `ADMIN_TABS` blocks (lines 8–17):

```tsx
const BASE_TABS = [
  { to: appRoutes.settingsTab('templates'), label: 'Templates', icon: LayoutTemplate },
  { to: appRoutes.settingsTab('workspace'), label: 'Workspace', icon: Wrench },
  { to: appRoutes.settingsTab('project'), label: 'Project', icon: FolderKanban },
  { to: appRoutes.settingsTab('profile'), label: 'Profile', icon: UserRound },
];

const ADMIN_TABS = [
  { to: appRoutes.settingsTab('users'), label: 'Users', icon: Users },
];
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/Settings.tsx
git commit -m "refactor(web): route settings tab rail through appRoutes"
```

---

## Task 6: Migrate redirect/auth semantics (`Login`, `Register`, `AcceptInvite`)

**Files:**
- Modify: `apps/web/src/routes/Login.tsx`
- Modify: `apps/web/src/routes/AcceptInvite.tsx`
- Test: `apps/web/src/routes/Login.test.tsx`

**Two edits in `safeNext`, not one:** the default return AND the "No account?" link comparison. The char-check guard (`next[0] !== '/'`, `next[1] === '/'`/`'\\'`) is untouched — those are character checks, not path literals.

- [ ] **Step 1: Update `Login.test.tsx` (failing first)**

In `apps/web/src/routes/Login.test.tsx`, the `safeNext` default + open-redirect fallbacks now resolve to `/app`. Replace the relevant assertions:

Before:
```ts
  it('returns the fallback for null/empty', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('http://evil.com/path')).toBe('/');
    expect(safeNext('evil.com')).toBe('/');
  });

  it('rejects backslash tricks', () => {
    expect(safeNext('/\\evil.com')).toBe('/');
  });

  it('allows a bare slash', () => {
    expect(safeNext('/')).toBe('/');
  });
```
After:
```ts
  it('returns the fallback for null/empty', () => {
    expect(safeNext(null)).toBe('/app');
    expect(safeNext('')).toBe('/app');
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(safeNext('//evil.com')).toBe('/app');
    expect(safeNext('https://evil.com')).toBe('/app');
    expect(safeNext('http://evil.com/path')).toBe('/app');
    expect(safeNext('evil.com')).toBe('/app');
  });

  it('rejects backslash tricks', () => {
    expect(safeNext('/\\evil.com')).toBe('/app');
  });

  it('allows a bare slash', () => {
    expect(safeNext('/')).toBe('/');
  });
```

> NOTE: A bare `'/'` is still a valid same-origin path, so `safeNext('/')` legitimately returns `'/'` (which then redirects to `/app` via the router). The default/reject cases are what change. The `safeNext('/board')` / `safeNext('/invite/tok1')` honor cases stay as-is (they pass the guard and are returned verbatim).

- [ ] **Step 2: Run the Login test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/routes/Login.test.tsx`
Expected: FAIL — `safeNext(null)` returns `'/'`, expected `'/app'`.

- [ ] **Step 3: Edit `Login.tsx`**

Add the import (after line 7, `import { Label } ...`):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the `safeNext` default (line 11) — change only the fallback return:

Before:
```tsx
  if (!next || next[0] !== '/' || next[1] === '/' || next[1] === '\\') return '/';
  return next;
```
After:
```tsx
  if (!next || next[0] !== '/' || next[1] === '/' || next[1] === '\\') return appRoutes.dashboard;
  return next;
```

Replace the "No account?" link comparison (line 43):

Before:
```tsx
      <p className="mt-4 text-sm text-muted-foreground">No account? <a href={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-action">Register</a></p>
```
After:
```tsx
      <p className="mt-4 text-sm text-muted-foreground">No account? <a href={`/register${next !== appRoutes.dashboard ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-action">Register</a></p>
```

> NOTE: `/register` is a public path — leave it literal (gate does not flag `/register`). `Register.tsx` imports `safeNext` from Login and needs no edit; verify in Step 5's typecheck.

- [ ] **Step 4: Edit `AcceptInvite.tsx`**

Add the import (after line 5, `import { Skeleton } ...`):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the success navigate (line 92):

Before:
```tsx
                navigate('/');
```
After:
```tsx
                navigate(appRoutes.dashboard);
```

> NOTE: The `<Navigate to={`/login?next=/invite/${token}`}>` (line 37) keeps `/login` + `/invite/...` (both public) — unchanged.

- [ ] **Step 5: Run typecheck + the Login test to verify pass**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit && pnpm --filter @productmap/web exec vitest run src/routes/Login.test.tsx`
Expected: PASS — 0 type errors; Login tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/Login.tsx apps/web/src/routes/Login.test.tsx apps/web/src/routes/AcceptInvite.tsx
git commit -m "feat(web): post-auth + accept-invite redirects land on /app"
```

---

## Task 7: Migrate widget/link literals — batch 1 (landing + feature + outcomes + dependencies)

**Files:**
- Modify: `apps/web/src/components/landing/AttentionPanel.tsx`
- Modify: `apps/web/src/components/landing/HorizonPanel.tsx`
- Modify: `apps/web/src/components/landing/GanttHero.tsx`
- Modify: `apps/web/src/components/feature/DependenciesRail.tsx`
- Modify: `apps/web/src/components/outcomes/ObjectiveCard.tsx`
- Modify: `apps/web/src/routes/FeaturePage.tsx`
- Test: `apps/web/src/routes/Landing.test.tsx`

- [ ] **Step 1: Update `Landing.test.tsx` (failing first)**

In `apps/web/src/routes/Landing.test.tsx`:
- Harness `<Route path="/board" element={<div>board page</div>} />` → `<Route path="/app/board" ...>`.
- Assertions `expect(...).toBe('/board?feature=f8')` and `'/board?feature=f1'` → `'/app/board?feature=f8'` / `'/app/board?feature=f1'`.
- Any doc-navigation assertion (`/docs/<id>`) → `/app/docs/<id>`.

Read the file and apply each. Representative edit:

Before:
```tsx
    expect(screen.getByTestId('location').textContent).toBe('/board?feature=f8');
```
After:
```tsx
    expect(screen.getByTestId('location').textContent).toBe('/app/board?feature=f8');
```

- [ ] **Step 2: Run the Landing test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/routes/Landing.test.tsx`
Expected: FAIL — navigation lands on `/board?feature=...` but the test now expects `/app/board?feature=...`.

- [ ] **Step 3: Edit `AttentionPanel.tsx`**

Add the import (after the `react-router-dom` import line):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the `open(item)` body (lines 20–26):

```tsx
    if (item.kind === 'open_comments') {
      navigate(`${appRoutes.feature(item.featureId)}#comments`);
    } else if (item.kind === 'draft_doc' || item.kind === 'in_review_doc') {
      navigate(appRoutes.doc(item.documentId));
    } else {
      navigate(`${appRoutes.board}?feature=${item.featureId}`);
    }
```

- [ ] **Step 4: Edit `HorizonPanel.tsx`**

Add the import:

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the peek `onClick` (line 44):

```tsx
            onClick={() => navigateWithTransition(() => navigate(`${appRoutes.board}?feature=${f.id}`))}
```

Replace the "more" `<Link to="/board"` (line 54):

```tsx
            to={appRoutes.board}
```

- [ ] **Step 5: Edit `GanttHero.tsx`**

Add the import:

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the roadmap peek `onClick` (line 106):

```tsx
                onClick={() => navigate(`${appRoutes.roadmap}?feature=${f.id}`)}
```

- [ ] **Step 6: Edit `DependenciesRail.tsx`**

Add the import (after the `STATUS_LABELS` import):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace both blocker `<Link to={`/features/${b.id}`}>` (lines 146 and 163):

```tsx
                    to={appRoutes.feature(b.id)}
```

(Apply to both occurrences — same replacement string.)

- [ ] **Step 7: Edit `ObjectiveCard.tsx`**

Add the import (after the `OBJECTIVE_STATUS_LABELS` import):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the `FeatureMiniRow` `<Link to={`/features/${feature.id}`}>` (line 51):

```tsx
        to={appRoutes.feature(feature.id)}
```

- [ ] **Step 8: Edit `FeaturePage.tsx`**

Add the import (locate the existing import block near the top and add):

```tsx
import { appRoutes } from '@/lib/routes';
```

Replace the delete navigate (line 115):

```tsx
        navigate(appRoutes.board);
```

Replace the breadcrumb `<Link to="/board"` (line 125):

```tsx
          to={appRoutes.board}
```

- [ ] **Step 9: Run the Landing test + typecheck to verify pass**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit && pnpm --filter @productmap/web exec vitest run src/routes/Landing.test.tsx`
Expected: PASS — 0 type errors; Landing tests green.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/landing/AttentionPanel.tsx apps/web/src/components/landing/HorizonPanel.tsx apps/web/src/components/landing/GanttHero.tsx apps/web/src/components/feature/DependenciesRail.tsx apps/web/src/components/outcomes/ObjectiveCard.tsx apps/web/src/routes/FeaturePage.tsx apps/web/src/routes/Landing.test.tsx
git commit -m "refactor(web): migrate landing/feature/outcomes nav literals to appRoutes"
```

---

## Task 8: Migrate widget/link literals — batch 2 (docs + board + inbox + releases + templates + copilot + switcher)

**Files:**
- Modify: `apps/web/src/components/ProjectSwitcher.tsx`
- Modify: `apps/web/src/components/NewProjectDialog.tsx`
- Modify: `apps/web/src/routes/doc-back-link.ts`
- Modify: `apps/web/src/components/board/FeatureDetailPanel.tsx`
- Modify: `apps/web/src/components/board/NewDocDialog.tsx`
- Modify: `apps/web/src/components/docs/DocPreviewSheet.tsx`
- Modify: `apps/web/src/components/docs/DocsTable.tsx`
- Modify: `apps/web/src/components/feature/DocsGrid.tsx`
- Modify: `apps/web/src/components/inbox/IdeaDetailPane.tsx`
- Modify: `apps/web/src/components/releases/ReleaseCard.tsx`
- Modify: `apps/web/src/components/releases/ReleaseDetail.tsx`
- Modify: `apps/web/src/components/settings/TemplatesTab.tsx`
- Modify: `apps/web/src/routes/TemplateEditor.tsx`
- Modify: `apps/web/src/components/copilot/CopilotPanel.tsx`

For each file: add `import { appRoutes } from '@/lib/routes';` to the import block, then apply the substitution below. Builders return clean base paths; append `?query`/`#hash` at the call site.

- [ ] **Step 1: `ProjectSwitcher.tsx`** — `<Link to="/?new=1">` (line 51):

```tsx
          <Link to={`${appRoutes.dashboard}?new=1`}>
```

- [ ] **Step 2: `NewProjectDialog.tsx`** — `navigate('/', { replace: true })` (line 55):

```tsx
          navigate(appRoutes.dashboard, { replace: true });
```

- [ ] **Step 3: `doc-back-link.ts`** — replace the three returns (lines 13–25):

```tsx
  if (doc.featureId) {
    return {
      href: `${appRoutes.board}?feature=${doc.featureId}`,
      label: titles.featureTitle ?? 'Back to board',
    };
  }
  if (doc.ideaId) {
    return {
      href: `${appRoutes.inbox}?idea=${doc.ideaId}`,
      label: `Idea: ${titles.ideaTitle ?? '…'}`,
    };
  }
  return { href: appRoutes.docs, label: 'All docs' };
```

- [ ] **Step 4: `FeatureDetailPanel.tsx`** — `navigate(`/docs/${doc.id}`)` (line 224) and `navigate(`/features/${feature.id}`)` (line 244):

```tsx
                  onClick={() => navigate(appRoutes.doc(doc.id))}
```
```tsx
            navigate(appRoutes.feature(feature.id));
```

- [ ] **Step 5: `NewDocDialog.tsx`** — `navigate(`/docs/${doc.id}`)` (line 125):

```tsx
          navigate(appRoutes.doc(doc.id));
```

- [ ] **Step 6: `DocPreviewSheet.tsx`** — `navigate(`/docs/${doc.id}`)` (line 137):

```tsx
                      navigateWithTransition(() => navigate(appRoutes.doc(doc.id)));
```

- [ ] **Step 7: `DocsTable.tsx`** — replace `ownerHref` (lines 66–70):

```tsx
function ownerHref(owner: DocOwnerLabel): string {
  if (owner.kind === 'idea') return `${appRoutes.inbox}?idea=${owner.id}`;
  if (owner.kind === 'release') return appRoutes.release(owner.id);
  return appRoutes.feature(owner.id);
}
```

- [ ] **Step 8: `DocsGrid.tsx`** — `navigate(`/docs/${doc.id}`)` (line 32):

```tsx
              onClick={() => navigate(appRoutes.doc(doc.id))}
```

- [ ] **Step 9: `IdeaDetailPane.tsx`** — `navigate(`/docs/${doc.id}`)` (line 73):

```tsx
            onSuccess: (doc) => navigate(appRoutes.doc(doc.id)),
```

- [ ] **Step 10: `ReleaseCard.tsx`** — `<Link to={`/releases/${release.id}`}>` (line 13):

```tsx
          to={appRoutes.release(release.id)}
```

- [ ] **Step 11: `ReleaseDetail.tsx`** — two `navigate(`/docs/${doc.id}`)` (lines 201, 211) and two `<Link to="/releases">` (lines 326, 336):

```tsx
      onSuccess: (doc) => navigate(appRoutes.doc(doc.id)),
```
```tsx
        navigate(appRoutes.doc(doc.id));
```
```tsx
          <Link to={appRoutes.releases}>Back to releases</Link>
```
```tsx
          to={appRoutes.releases}
```

- [ ] **Step 12: `TemplatesTab.tsx`** — two `navigate(`/settings/templates/${...}`)` (lines 141, 209):

```tsx
        onSuccess: (tpl) => navigate(appRoutes.templateEditor(tpl.id)),
```
```tsx
  const onEdit = (id: string) => navigate(appRoutes.templateEditor(id));
```

- [ ] **Step 13: `TemplateEditor.tsx`** — two `<Link to="/settings">` (lines 94, 192):

```tsx
          <Link to={appRoutes.settings}>
```
```tsx
            <Link to={appRoutes.settings}>Back to settings</Link>
```

- [ ] **Step 14: `CopilotPanel.tsx`** — the generated doc-link HTML in `linkifyDocTitles` (line 59). Replace:

Before:
```tsx
      `<a href="/docs/${doc.id}" data-doc-link="${doc.id}"><strong>${escapeHtml(doc.title)}</strong></a>`,
```
After:
```tsx
      `<a href="${appRoutes.doc(doc.id)}" data-doc-link="${doc.id}"><strong>${escapeHtml(doc.title)}</strong></a>`,
```

> NOTE: The `go(href)` call (line 307) navigates whatever `href` the nudge builder produced; once the doc-link HTML uses `appRoutes.doc(...)`, the click-through is `/app/docs/...`. Read the nudge target builder in the same file — if any nudge constructs `/features/...` or `/docs/...` literally, replace it with `appRoutes.feature(...)`/`appRoutes.doc(...)` too. (Grep confirms the only raw literal is the `linkifyDocTitles` href; verify during edit.)

- [ ] **Step 15: Run full typecheck + web unit suite to verify pass**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit && pnpm --filter @productmap/web exec vitest run`
Expected: PASS — 0 type errors; all unit tests green (jsdom; no Postgres needed).

- [ ] **Step 16: Commit**

```bash
git add apps/web/src/components/ProjectSwitcher.tsx apps/web/src/components/NewProjectDialog.tsx apps/web/src/routes/doc-back-link.ts apps/web/src/components/board/FeatureDetailPanel.tsx apps/web/src/components/board/NewDocDialog.tsx apps/web/src/components/docs/DocPreviewSheet.tsx apps/web/src/components/docs/DocsTable.tsx apps/web/src/components/feature/DocsGrid.tsx apps/web/src/components/inbox/IdeaDetailPane.tsx apps/web/src/components/releases/ReleaseCard.tsx apps/web/src/components/releases/ReleaseDetail.tsx apps/web/src/components/settings/TemplatesTab.tsx apps/web/src/routes/TemplateEditor.tsx apps/web/src/components/copilot/CopilotPanel.tsx
git commit -m "refactor(web): migrate docs/board/inbox/releases/templates/copilot nav literals to appRoutes"
```

---

## Task 9: Grep gate — no raw app-path literals outside `lib/routes.ts` + tests + App.tsx

**Files:**
- (verification only — no source edit unless the gate finds a stray literal)

- [ ] **Step 1: Run the grep gate**

Run (single line; requires a quote/backtick before the path so `/app/board` is auto-excluded — the char before `/board` in `/app/board` is `p`, not a quote):

```bash
grep -rnE "['\"\`](/board|/roadmap|/inbox|/outcomes|/releases|/features/|/docs|/settings)" apps/web/src \
  --include="*.ts" --include="*.tsx" \
  | grep -v "src/lib/routes.ts" \
  | grep -v "src/App.tsx" \
  | grep -v "\.test\."
```

Expected: **no output** (exit code 1 from the final grep = no matches = gate passes).

- [ ] **Step 2: If the gate prints any line, fix it**

Each printed line is a missed literal. Open the file, add `import { appRoutes } from '@/lib/routes';` if absent, and replace the literal with the matching builder (`/board`→`appRoutes.board`, `/features/${id}`→`appRoutes.feature(id)`, `/docs/${id}`→`appRoutes.doc(id)`, `/releases/${id}`→`appRoutes.release(id)`, `/settings/x`→`appRoutes.settingsTab('x')`, etc.). Re-run Step 1 until it is silent.

- [ ] **Step 3: Re-run typecheck + unit suite (only if a fix was applied)**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit && pnpm --filter @productmap/web exec vitest run`
Expected: PASS — 0 type errors; all unit tests green.

- [ ] **Step 4: Commit (only if a fix was applied)**

```bash
git add -A apps/web/src
git commit -m "refactor(web): grep-gate sweep — eliminate stray app-path literals"
```

---

## Task 10: Migrate e2e specs to `/app/*`

**Files:**
- Modify: `e2e/auth.setup.ts`, `e2e/board.spec.ts`, `e2e/comments.spec.ts`, `e2e/docs-page.spec.ts`, `e2e/dream-tier.spec.ts`, `e2e/editor.spec.ts`, `e2e/export.spec.ts`, `e2e/feature-page.spec.ts`, `e2e/gantt.spec.ts`, `e2e/landing.spec.ts`, `e2e/profile.spec.ts`, `e2e/settings.spec.ts`, `e2e/signature-w1.spec.ts`, `e2e/signature-w2.spec.ts`, `e2e/ux.spec.ts`, `e2e/voting.spec.ts`, `e2e/ai.spec.ts`

**Rule:** Playwright `baseURL` is the vite dev server (`http://localhost:5173`); vite's SPA fallback serves any `/app/...` deep link. Every `page.goto(...)`, `toHaveURL(...)`, `waitForURL(...)`, and skeleton-path table entry that names an APP path gains the `/app` prefix. App paths: `/board`, `/roadmap`, `/inbox`, `/outcomes`, `/releases`, `/releases/:id`, `/features/:id`, `/docs`, `/docs/:id`, `/docs/:id/read`, `/settings`, `/settings/*`. Public paths stay bare: `/login`, `/register`, `/share/...`, `/invite/...`, and `/api/...` (helpers.ts).

**Special case — bare `/` after auth:** Tests that `page.goto('/')` then expect the dashboard now load `/` → which redirects to `/app`. Two valid fixes per occurrence:
- If the test only needs the dashboard, change `goto('/')` → `goto('/app')` (avoids depending on the redirect).
- If the test specifically asserts post-login lands somewhere, update the `toHaveURL` regex accordingly.
Prefer `goto('/app')` for dashboard visits.

- [ ] **Step 1: `auth.setup.ts`** — the post-login URL assertion (line 22):

Before:
```ts
  await expect(page).toHaveURL('/', { timeout: 10_000 });
```
After:
```ts
  await expect(page).toHaveURL('/app', { timeout: 10_000 });
```
(`page.goto('/login')` on line 14 stays — `/login` is public.)

- [ ] **Step 2: Sweep `goto`/`toHaveURL`/`waitForURL` app paths across the remaining spec files**

For each file in the list, apply these substitutions to every occurrence (read the file first):
- `goto('/board')` → `goto('/app/board')`; `goto('/roadmap')` → `goto('/app/roadmap')`; `goto('/inbox')` → `goto('/app/inbox')`; `goto('/outcomes')` → `goto('/app/outcomes')`; `goto('/releases')` → `goto('/app/releases')`; `goto('/docs')` → `goto('/app/docs')`.
- `goto('/settings/...')` → `goto('/app/settings/...')`.
- Template literals: `goto(`/features/${id}`)` → `goto(`/app/features/${id}`)`; `goto(`/docs/${id}`)` → `goto(`/app/docs/${id}`)`; `goto(`/docs/${id}/read`)` → `goto(`/app/docs/${id}/read`)`; `goto(`/board?feature=${id}`)` → `goto(`/app/board?feature=${id}`)`.
- `goto('/')` (dashboard visit) → `goto('/app')`.
- Regex URL assertions: `toHaveURL(/\/board$/)` → `toHaveURL(/\/app\/board$/)`; `toHaveURL(/\/features\/[0-9a-f-]+$/)` → `toHaveURL(/\/app\/features\/[0-9a-f-]+$/)`; `toHaveURL(/\/docs$/)` → `toHaveURL(/\/app\/docs$/)`; `toHaveURL(/\/docs\/[0-9a-f-]{36}$/)` → `toHaveURL(/\/app\/docs\/[0-9a-f-]{36}$/)`; `toHaveURL(/\/roadmap\?feature=/)` → `toHaveURL(/\/app\/roadmap\?feature=/)`; `toHaveURL(/\/settings\/templates$/)` → `toHaveURL(/\/app\/settings\/templates$/)`; `toHaveURL(/\/settings\/templates\/[0-9a-f-]+$/)` → `toHaveURL(/\/app\/settings\/templates\/[0-9a-f-]+$/)`; `toHaveURL(new RegExp(`/features/${id}$`))` → `toHaveURL(new RegExp(`/app/features/${id}$`))`; `toHaveURL(new RegExp(`/features/${id}#comments`))` → `toHaveURL(new RegExp(`/app/features/${id}#comments`))`.
- `ux.spec.ts` skeleton-path table (lines 22–23): `['/board', 'board-skeleton']` → `['/app/board', 'board-skeleton']`; `['/roadmap', 'roadmap-skeleton']` → `['/app/roadmap', 'roadmap-skeleton']`.

> NOTE on `feature=` / hash assertions like `toHaveURL(new RegExp(`feature=${feature.id}`))` (signature-w1, voting): these match a query substring only — they keep matching after the prefix, but for clarity update them to the `/app/...` form where the path is also asserted. Substring-only `feature=` / `not.toHaveURL(/feature=/)` checks need no change.
> NOTE: `shareUrl` / `/share/...` / `/invite/...` / `/api/...` and `goto('/login')` stay bare.

- [ ] **Step 3: Static sanity grep for leftover bare app paths in e2e**

Run:

```bash
grep -rnE "(goto|toHaveURL|waitForURL)\(.*['\"\`/](board|roadmap|inbox|outcomes|releases|features/|docs|settings)" e2e \
  | grep -vE "/app/|/api/|/share|/invite|/login|/register|feature=" \
  | grep -vE "//"
```

Expected: **no output** (any line is a missed bare app path — fix it, then re-run).

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): migrate spec navigation to /app/* paths"
```

> **Controller note (sandbox-off):** e2e is NOT run inside the sandboxed plan execution. Playwright needs the full stack — api (`:3411`) + vite (`:5173`) + **Postgres on `:5432`** — booted via `playwright.config.ts` `webServer`. Run e2e yourself with the sandbox off after the unit suite + build are green:
> `pnpm --filter @productmap/web exec playwright test` (from repo root, or per the repo's e2e script). The unit suite (Task 8/9) is the in-sandbox gate; e2e is the controller's out-of-sandbox confirmation.

---

## Task 11: Final verification — typecheck + unit suite + build

**Files:**
- (verification only)

- [ ] **Step 1: Typecheck**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit`
Expected: **0 errors.**

- [ ] **Step 2: Full web unit suite**

Run: `pnpm --filter @productmap/web exec vitest run`
Expected: **all tests green** (jsdom; no Postgres). Confirm the suite count matches the pre-migration baseline (no tests silently skipped).

- [ ] **Step 3: Re-run the grep gate (regression guard)**

Run the Task 9 Step 1 command again.
Expected: **no output.**

- [ ] **Step 4: Production build**

Run: `pnpm --filter @productmap/web build`
Expected: **clean build** — Vite emits `dist/` with no errors. (Confirms the lazy route imports + new module resolve in a production bundle.)

- [ ] **Step 5: Commit any verification fixups (if needed)**

If Steps 1–4 surface a stray issue, fix it, re-run the failing step to green, then:

```bash
git add -A
git commit -m "chore(web): phase-3a route migration verification fixups"
```

If nothing surfaced, this task produces no commit — the work is already committed per task above.

---

## Self-Review (controller checklist)

**Spec coverage (Unit A only):**
- "All authed routes gain `/app` prefix; subtree mounts at `/app/*`; `Marketing` at `/`" → Task 2 (nested `/app` parent; `/`→`/app` redirect placeholder since Marketing is 3B).
- "Authed route map after migration (`/app`, `/app/board`, …, `/app/docs/:id/read`)" → Task 2 (children + separate reader route).
- "Public/unprefixed unchanged: `/login`, `/register`, `/share/:token`, `/invite/:token`" → Task 2 (kept as top-level; verified bare in Login/AcceptInvite Task 6).
- "All internal navigation updated (`<Link>`, `<NavLink>`, `navigate(...)`, command-palette route table, recents, AppShell nav, `?new=1` switcher, hardcoded paths)" → Tasks 3, 4, 5, 7, 8 + grep gate Task 9.
- "RequireAuth unauth → /login (unchanged)" → untouched in `auth.tsx`; **covered by existing `RequireAuth` behavior** (no code change). Routing test for "`/app/*` auth-gated → /login": this plan relies on the existing `RequireAuth` unit/e2e coverage rather than adding a new test — flagged below as the one consciously-not-new-tested spec line.
- "Post-auth default `safeNext` `/`→`/app` (Login + Register); `?next=` honored" → Task 6 (default + link comparison; Register inherits `safeNext`).
- "AcceptInvite success → `/app`, keeping `pm.activeProjectId`" → Task 6 (navigate change only; `localStorage.setItem` untouched).
- "Settings index/`*` `<Navigate to="/settings/templates">` → `/app/settings/templates`" → Task 2.
- "Dedicated task sweeps targets + updates tests/e2e" → Tasks 7–10.
- Testing-strategy "e2e updated to `/app/*`" → Task 10 (+ controller sandbox-off note).
- Risk "migration breadth … grep sweep + green suite as gate" → Tasks 9 + 11.

**Spec line consciously NOT given a new test:** "Routing (web): `/app/*` is auth-gated (unauth → `/login`)". The `RequireAuth` wrapper is unchanged and already covered by existing tests/e2e (`auth.setup.ts` + RequireAuth's own behavior). Adding a fresh routing test is optional polish; the migration does not alter the gating logic, only the path it gates. **Reported as the single unmapped-to-a-new-task spec item.**

**Out of scope (correctly absent):** Marketing page/sections, prerender, production static serving — all Phase 3B. `/`→`/app` redirect is the explicit PR-A placeholder per spec.
