# Demo Mode Plan — Amendments (post-spike + adversarial review)

> Patch to `2026-06-23-demo-mode.md`. Apply these before implementing Phase 1+.
> Two plan assumptions failed empirically: the `hc`-fetch interception seam, and route db-injection. Both have concrete corrected approaches below.

## 1. Go/No-Go per mechanism

| Spike | Verdict | Evidence |
|---|---|---|
| **hono-fetch (`app.fetch` via swapped `fetch`)** | **GO (mechanism) / BLOCKED (as applied)** | `hc({fetch})` round-trip passes on resolved Hono 4.12.25, but `hc` is **dead code** in `api.ts` — all I/O goes through the global `fetch` in `fetchJson()` (`api.ts:100-101`) + bare `fetch` in `tryRefresh`/`useMe`/`useShareData`. Swapping `hc`'s fetch intercepts nothing. Re-aim at the real transport (Amendment 1). |
| **pglite migrations + concurrency** | **GO** | All 14 migrations (incl. `DO $$` block in 0011, partial unique index in 0004) apply; `gen_random_uuid()` works with no `pgcrypto`; FTS `to_tsvector @@ plainto_tsquery` matches; 12 concurrent `db.transaction()` → 0 rejects, count=12. PGlite serializes internally — **no manual queue needed**. |
| **cross-package import (apps/web ← apps/api routes)** | **GO-WITH-CHANGES** | Vite resolves TS source into `apps/api/src` and `@productmap/db` with no config change, BUT routes are **module-level singletons** closing over a node-postgres `db` singleton (`db.ts:8` `new pg.Pool()`), not factories. `pg` enters the graph via two vectors and only runtime-crashes (Vite stubs builtins). No DI seam exists — must alias `../db` + `@productmap/db` (Amendment 2). Only `pg` surfaces on the features path — argon2/aws/ai/archiver/nodemailer do **not**. |

---

## 2. Required plan amendments

### Amendment 1 — Interception seam is `fetchJson`/global fetch, NOT `hc` (Tasks 0a, 6; Architecture; Spec §2)
**Folds:** review blockers "hc client is dead code" (×2), major "api.ts is in the core chunk".

`hc<AppType>('/')` at `api.ts:29` is imported by nobody (`grep "import { api }"` → 0 hits). Real transport:
- `fetchJson()` → global `fetch` (`api.ts:100-101`)
- `tryRefresh` → `fetch('/api/auth/refresh')` (`api.ts:93`)
- `useMe` → `fetch('/api/auth/me')` (`api.ts:185`)
- `useShareData` → bare `fetch` (`api.ts:1006`)

**Corrected approach — late-bound module-level fetch reference (also satisfies G3 chunk isolation):**
In `api.ts`, introduce one swappable reference and route all four sites through it:
```ts
// api.ts — top level
let activeFetch: typeof fetch = (...a) => globalThis.fetch(...a);
export function setActiveFetch(f: typeof fetch) { activeFetch = f; }
// fetchJson, tryRefresh, useMe, useShareData: replace `fetch(` with `activeFetch(`
```
`api.ts` must statically import **nothing** from `src/demo/**`. `enableDemo()` (reached only via DemoEntry's dynamic `import()`) does `await import('./demoApp')`, builds the app, then calls `setActiveFetch(demoFetch)` where `demoFetch(input, init) = activeDemoApp.fetch(new Request(input, init))`.
- **Normalize the Request URL defensively** so `demoFetch` works in-browser AND under vitest (Tasks 4/6/10 call it in node, where `fetchJson` passes relative `apiPath()` strings like `/api/...` and `new Request('/api/...')` throws "Invalid URL"). Hono routes on pathname only, so the origin is arbitrary:
  ```ts
  const demoFetch = (input: RequestInfo | URL, init?: RequestInit) =>
    activeDemoApp.fetch(new Request(new URL(input as string, 'http://demo.local'), init));
  ```
  In-browser the relative path already resolves against `location.origin`; the `new URL(input, 'http://demo.local')` base only matters in node — but always applying it is harmless and prevents the spike-1 "must pass an absolute base in node" failure from hitting the plan's own tests.
- **Delete** the `hc({fetch})` swap language from plan Architecture, Task 6 Step 2, Tech Stack, and Spec §2/Flow.
- **Task 0a rewrite:** the existing spike proved the wrong path. Either delete it or re-scope it to assert that swapping `activeFetch` causes `fetchJson('/api/...')` to hit `demoApp.fetch`. The `hc` round-trip result is informational only.

### Amendment 2 — No DI seam; alias `../db` AND `@productmap/db` (Tasks 3, 4)
**Folds:** review blocker "no route is a factory", spike-3 planImpact.

Routes are `export const xRoutes = new Hono<...>()` closing over module-scoped `import { db } from '../db'` (`features.ts:7`). ~28 modules import the singleton. **Do not rewrite to factories.** Replace plan's "inject db" language with **build-time aliasing**:

- **Task 3 Step 1 rewrite:** Drop "confirm routes receive db via injection / refactor to factory". Instead, in the demo Vite alias set add:
  - `'@productmap/db'` → `@productmap/db/browser` (drizzle-orm/pglite + re-exported schema; **no `pg`**)
  - the relative `'../db'` (resolved to `apps/api/src/db.ts`) → `apps/web/src/demo/demoDb.ts`
  Aliasing **both** is required — without the `@productmap/db` alias, `pg` stays in the graph (confirmed by spike-3). The schema/driver both flow through `@productmap/db/src/index.ts` which top-level imports `pg`.
- **Sync-vs-async handshake (new, unresolved in plan):** `db.ts` exports a **synchronous** `const db`, but PGlite create + migrate + seed is **async**. `demoDb.ts` must expose the same symbols (`db`, `pool`) but cannot block at import. Use a lazily-assigned singleton: export a `db` proxy/placeholder that `enableDemo()` populates via `await createDemoDb()` **before** any route handler runs (DemoEntry awaits `enableDemo()` before `navigate('/app')`, so no request fires earlier). Specify this ordering explicitly in Task 3. This relies on ES live bindings: the `../db` `db` export must be a **reassignable binding**, and consumers must keep reading `db` at call-time inside handlers (they already do `import { db } from '../db'` and reference it per-request) — they must **not** destructure-and-cache `db` at module top.
- **`createDemoDb`:** `new PGlite()` (in-memory, no `idb://`) → apply migrations → return `drizzle(client)`. Migration load: bundle the 14 `.sql` as raw strings via `import.meta.glob('.../migrations/*.sql', { query: '?raw' })` keyed by `meta/_journal.json` idx order; split each on the literal `--> statement-breakpoint` (**never on `;`** — 0011's `DO $$` has internal semicolons); `await client.exec(chunk)` in order. No `fs` in browser.

### Amendment 3 — Task 1 fixes only Vector A; name the extra files (Task 1)
**Folds:** review blocker "two pg vectors, Task 1 fixes one".

Task 1 (repoint table imports `@productmap/db` → `@productmap/db/schema`) is correct but **does not remove `pg`** — that's Amendment 2's `../db` alias. State this. Expand Task 1 Step 5 repoint surface to explicitly include the two middleware files and lib files that import tables/db: `middleware/auth.ts:5`, `middleware/membership.ts:5`, `lib/activity.ts`, `lib/scope.ts`, `lib/votes.ts`. **Preserve** the existing `@productmap/db/seed-data` export (`routes/admin.ts:5` imports `seedDemo` from it) in the new exports map. Add the `@productmap/db/browser` entry here too (schema + drizzle-orm/pglite, no pg).

### Amendment 4 — Reuse existing `seedDemo`; fix the demo identity UUID (Tasks 5, 4, 8; Global Constraints; Spec lines 25/54/96-100)
**Folds:** review blockers "demo-user is not a UUID", "missing NOT-NULL color", "seedDemo already exists"; majors on `documents_owner_check` / `comments_target_check`; minors on votes/membership/release-notes.

`id='demo-user'` is **invalid uuid syntax** — `users.id` is `uuid().defaultRandom()` (`schema.ts:34`); both the seed insert and every FK stamp (features.createdBy, comments.authorId, votes.userId, decisions.decidedBy, activity.actorId) would throw on parse.

**Corrected approach:**
- Define one constant `DEMO_USER_ID = '00000000-0000-0000-0000-000000000001'` (the value the existing seed already uses; `seed-data.ts:60-62` comments "Do NOT change — the auth JWT encodes this id"). Use it for the users row, `memberships.userId`, the demoAuth claim `sub`, and the AuthProvider short-circuit user.
- **Replace `{id:'demo-user'}` everywhere** in the plan (Global Constraints, Task 5 Step 1, Task 4 Step 1, Task 8 Step 2) and spec (lines 25/54/100) with `DEMO_USER_ID`.
- **Do not author a new seed.** Reuse `seedDemo(db, markdownToTiptap)` from `@productmap/db/seed-data` (`seed-data.ts:42`) — it truncates + reseeds idempotently with ~15 features / 4 users / project / memberships / templates, the exact dataset Task 5 re-describes. **It requires a `markdownToTiptap` arg** the plan never mentions — Task 5 must resolve where the demo obtains that converter (find the existing one used by `routes/admin.ts`'s caller and ensure it has no node-only imports, or pass a browser-safe equivalent).
- Seeded `users` row needs `color` — `users.color` is `text().notNull()` with no default (`schema.ts:35`); also read on every comment/activity response via `innerJoin` on `users.color`. `seedDemo` already supplies it; if any row is authored manually use e.g. `color: '#2b557e'`. `email`/`passwordHash` are nullable; `role:'admin'` must stay explicit (default is `member`).
- **Verify node-purity of the reused seed:** adopting `seedDemo` makes `seed-data.ts` and the chosen `markdownToTiptap` converter demo-reachable, so Task 11's purity guard will scan them. Confirm both have **no node-only module-level imports** before wiring them in — otherwise the demo build breaks.
- If authoring **any** rows manually, respect constraints `seedDemo` already honors: `documents_owner_check` (non-`release_notes` docs need featureId and/or ideaId; `release_notes` docs need both null + wired via `releases.notesDocId`); `comments_target_check` (exactly one of featureId/documentId, body 1–4000 chars); `votes.value ∈ {1,-1}` with unique `(userId,featureId)`.

### Amendment 5 — Drop the membership shim; mount real `requireMembership` (Task 4)
**Folds:** review minor "admin already grants owner".

Real `requireMembership` returns effective `owner` for any `currentUser.role === 'admin'` with **no db read and no membership row** (`membership.ts:23-28`). So:
- **Task 4 Step 1:** demoAuth only needs `c.set('currentUser', { id: DEMO_USER_ID, role: 'admin' })` (matching `auth.ts:22`). Mount the **real** `requireMembership` unchanged — it sets `currentRole='owner'` + `currentProjectId` (`membership.ts:36-37`), the exact keys handlers read. Delete the custom membership shim.
- Authz needs no membership row; only the `users` FK row is load-bearing (comment/vote/decision/activity stamps). The seeded membership row is harmless and `seedDemo` includes it.

### Amendment 6 — CSRF is fused with auth; custom assembly is MANDATORY, not optional (Task 4; Spec §3, line 55)
**Folds:** review minors "CSRF not a separate middleware", "CSRF claim backwards".

CSRF is **not** a standalone middleware — it's fused inside one `.use('/api/*')` block (`app.ts:25-37`): origin check (`!isSameOrigin(c) → 403`, lines 32-34) then `requireAuth` (line 36). You **cannot** import `app.ts` and selectively drop CSRF. The plan already builds `demoApp` by custom assembly (Task 4 Step 2), so "omitting CSRF" is free — but make it **mandatory** language, not the spec's "confirm which path" hedge (line 55).
- **Correct the rationale (Spec §3):** a synthetic Request with no `Origin` actually **passes** the gate (`isSameOrigin` returns true when Origin is absent — `rate-limit.ts:54-55`). The real reason to build a separate `demoApp` is that `app.ts` statically imports the node-postgres singleton (via `middleware/auth.ts:5`) and can't load in a browser. Downgrade the CSRF claim to "omit as cleanup, not a blocker".

### Amendment 7 — AuthProvider short-circuit must be reactive (Task 8; Spec §3)
**Folds:** review blocker "cached null `me` defeats demo".

`AuthProvider` wraps the entire Routes tree (`App.tsx:90`) and fires `useMe()` on first paint — before `/demo`. `useMe` has `retry:false, staleTime 60_000` (`api.ts:181-192`), so a logged-out visitor's `['me']` resolves to `null` and is cached. A bare module `demoMode` boolean won't re-render AuthProvider; `RequireAuth` then reads `me===null` (`auth.tsx:21`) and `<Navigate to="/login">` fires.
- **Task 8 Step 2 rewrite:** in `enableDemo()`, before `navigate('/app')`, **prime the cache**: `queryClient.setQueryData(['me'], demoUser)` where `demoUser = { id: DEMO_USER_ID, role:'admin', name:'Demo User' }`. Drive `demoMode` through React state/Context (or the cache) that AuthProvider subscribes to, and short-circuit `useMe`/AuthProvider on that reactive source — not a bare boolean.

### Amendment 8 — Prerender is already safe; no change (Task 9; minor)
SSR build compiles only `entry-marketing.tsx` (`package.json:8`), whose graph never reaches `App.tsx`/`api.ts`/demo. Adding a client-only `/demo` route does not enter the SSR graph. **No prerender change.** Sole constraint: demo modules must not be imported by Marketing or `@/lib/marketing` (they aren't). Add a Task 9 assertion that the **main/landing entry chunk** does not reference the PGlite WASM asset (check the main entry specifically, not merely "a separate chunk exists").

---

## 3. Newly discovered risks

1. **Synchronous-singleton vs async-PGlite handshake** (Amendment 2) — neither plan nor spec resolved how a sync `const db` export receives a migrated+seeded async instance. Must be a lazily-assigned singleton populated by `enableDemo()` before the first request. This is load-bearing; under-specifying it will surface as "db is undefined" at first query.
2. **`markdownToTiptap` dependency of `seedDemo`** — the existing curated seed requires a converter argument the plan never mentions. The demo must supply a browser-safe converter; if the production one pulls node-only deps, that's an extra lazy/alias surface.
3. **`@productmap/db/browser` entry must re-export schema AND a pglite-backed driver** — Task 1's `/schema` path is schema-only; the demo alias target additionally needs the drizzle-orm/pglite handle, so it's a distinct third entry, not the same as `/schema`.
4. **`useShareData` bare fetch** (`api.ts:1006`) was not in the plan's interception list — it must route through `activeFetch` too, or share-link views error in demo.
5. **Concurrency queue is dead weight** — Task 6 Step 1's "if Task 0b flagged concurrency, wrap demoFetch in a serialized queue" will never trigger (spike proved PGlite self-serializes). Remove the conditional to avoid speculative complexity.

---

## 4. Recommended task reordering / additions

- **Task 0a:** Re-scope or delete (Amendment 1) — it validated the wrong seam. If kept, assert `setActiveFetch` → `fetchJson` interception, not `hc`.
- **Task 1:** Add the `@productmap/db/browser` export + name middleware/lib files (Amendment 3). Keep `@productmap/db/seed-data`.
- **NEW Task 3a (split out of Task 3):** "Demo driver aliasing + sync/async db handshake." Aliases `@productmap/db` → `/browser` and `../db` → `demoDb.ts`; defines the lazily-assigned singleton + the `enableDemo()`-populates-before-first-request ordering. This is bigger than the old Task 3 Step 1's one-line "confirm injection" and is the linchpin — call it out as its own reviewable unit.
- **Task 3 (remaining):** `createDemoDb` via bundled-SQL `import.meta.glob` + split-on-breakpoint loop. Drop the factory-refactor language.
- **Task 4:** Drop membership shim (Amendment 5); make custom assembly + CSRF-omission mandatory (Amendment 6); demoAuth sets only `currentUser` with `DEMO_USER_ID`.
- **Task 5:** Replace "author new seed" with "call existing `seedDemo(db, markdownToTiptap)`"; resolve the converter; use `DEMO_USER_ID` (Amendment 4).
- **Task 6:** Implement `setActiveFetch` late-binding (Amendment 1); remove the speculative serialized queue (Risk 5).
- **Task 8:** Cache-prime `['me']` + reactive demoMode (Amendment 7).
- **Task 9:** Assert the **main** entry chunk has no PGlite WASM reference (Amendment 8).
- **Global Constraints / Spec lines 25,54,55,100, §2, §3:** swap `demo-user` → `DEMO_USER_ID`; delete `hc({fetch})` language; reword CSRF rationale.

**Net ordering:** 0a(re-scoped)/0b/0c → 1 (expanded) → 2 → **3a (alias+handshake)** → 3 (createDemoDb) → 4 (real membership, custom assembly) → 5 (reuse seedDemo) → 6 (setActiveFetch) → 7 → 8 (cache-prime) → 9 (main-chunk assert) → 10/11/12.
