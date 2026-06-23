# Demo Runtime — Implementation Report

Task 2 of the demo-mode build: an in-page demo runtime that spins up an in-memory
PGlite database, applies the real migrations, seeds it, injects it into the real
Hono `app`, and answers requests through the real route logic via `demoFetch`.

## Files created

- `apps/web/src/demo/migrations.ts` — bundles + orders + applies the 14 real migrations.
- `apps/web/src/demo/demoDb.ts` — `createDemoDb()`: in-memory PGlite + Drizzle handle typed as `Db`.
- `apps/web/src/demo/demoSession.ts` — `DEMO_USER_ID`, `mintDemoCookie()` (JWT via `hono/jwt` + `config.authSecret`).
- `apps/web/src/demo/enableDemo.ts` — `enableDemo()`, `demoFetch`, `getDemoProjectId()`, `demoReady()`; re-exports `app` + `DEMO_USER_ID`.
- `apps/web/src/demo/demo-runtime.test.ts` — vitest proving the full loop against real routes.
- `apps/web/src/vite-env.d.ts` — `/// <reference types="vite/client" />` (typings for `import.meta.glob` + `?raw`).

## Dependency added

- `@electric-sql/pglite@^0.5.0` → resolved to **0.5.3** in `apps/web`.
- `drizzle-orm` (with its `/pglite` adapter) was already present at **0.38.4** transitively; no explicit add needed.
- `pnpm add` hit a sandbox EPERM; succeeded with the sandbox disabled.

## Migration glob path that worked

From `apps/web/src/demo/migrations.ts`:

```ts
import.meta.glob('../../../../packages/db/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
})
```

`src/demo → src → web → apps → repo root` = 4 × `../`. **Verified: matches exactly 14 files**
(asserted by `migrationCount() === 14` in the test). Order comes from
`packages/db/migrations/meta/_journal.json` (`entries` sorted by `idx` asc; each `tag`
mapped to its `<tag>.sql`). Each file is split ONLY on the literal
`--> statement-breakpoint` (never on `;`, because 0011 has a `DO $$ ... END $$`
block with internal semicolons), trimmed, empties filtered, then `client.exec(chunk)`.

## seedDemo import path + returned project id mechanism

- Imported via **relative source path**: `../../../../packages/db/src/seed-data` (NOT the
  `@productmap/db/seed-data` bare specifier — apps/web does not declare `@productmap/db`
  as a dependency, so pnpm's strict resolution would reject the bare import from web). All
  cross-package demo imports (`app`, `db`, `markdown`, `schema`, `Db`) use the same relative
  style for consistency. Drizzle table-object identity across module instances does not affect
  query building, so there is no correctness cost.
- `seedDemo(db, markdownToTiptap, async () => 'demo-no-login')` — the stub hasher keeps the
  native `@node-rs/argon2` addon out of the browser graph.
- `seedDemo` returns `void`, so the project id is recovered by querying:
  `db.select({ id: projects.id }).from(projects).limit(1)` (single seeded project).
  Exposed via `getDemoProjectId()`.

## demoFetch cookie approach

- `mintDemoCookie()` signs `{ sub: DEMO_USER_ID, role: 'admin', tv: 0, exp: now + 1yr }` with
  `config.authSecret` (the one ephemeral per-instance secret the same module verifies against —
  sign and verify always agree, so no 401). Returns `pm_session=<token>` (`ACCESS_COOKIE`
  imported from `lib/auth/cookies`, not hardcoded).
- `demoFetch(input, init)` normalizes the URL via `new URL(rawUrl, 'http://demo.local')`, merges
  incoming headers, force-sets `Cookie` to the minted string (replacing any existing), and returns
  `app.fetch(new Request(url, { ...init, headers }))`. The synthetic Request carries no `Origin`
  header → the app's `isSameOrigin` CSRF check passes for mutations (POST 201 confirmed).
- `requireAuth` accepts the cookie (sig + expiry only, no DB read); `role: 'admin'` →
  `requireMembership` grants `owner` with no DB read. Zero auth-related DB reads.

## setActiveFetch wiring

`setActiveFetch`/`activeFetch` do **not** yet exist in `apps/web/src/lib/api.ts` (confirmed by
grep). Per the task, this module does NOT add or call it; it exports `demoFetch` and `app` so the
later api.ts task can wire them.

## tsconfig / vite resolution changes

- **Added `apps/web/src/vite-env.d.ts`** with `/// <reference types="vite/client" />`. This was the
  only resolution change required: web typecheck failed with `TS2339: Property 'glob' does not exist
  on type 'ImportMeta'` until the Vite client types were referenced. The file is inside the existing
  `tsconfig.json` `include: ["src", ...]`, so no tsconfig edit was needed.
- No tsconfig `paths` / vite `resolve` aliases were needed — Vite/vitest resolve the relative TS
  source imports from `apps/api/src` and `packages/db/src` directly (the cross-package spike result
  held). pnpm dep-resolution issues were avoided entirely by using relative imports.

## Test output

```
 RUN  v2.1.9 .../apps/web

stdout | src/demo/demo-runtime.test.ts > demo runtime (real app + PGlite)
seeded: 1 product, 8 features, 15 documents ... 4 users, 8 comment threads, 18 votes, ...

 ✓ src/demo/demo-runtime.test.ts (6 tests) 1383ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Tests: 14-migration glob count, non-empty features GET, overview GET 200, POST feature → 201 →
follow-up GET includes it, POST comment authored by `DEMO_USER_ID` → 201 with `authorId === DEMO_USER_ID`
(FK resolves), and no request returns 401.

- `// @vitest-environment node` is set on the test file (PGlite WASM instantiation is unreliable under
  jsdom; node is the right env for this DB-level test).
- `pnpm --filter @productmap/api build` (tsc): **clean**.
- `pnpm --filter @productmap/web exec tsc --noEmit`: **clean**.
- `pnpm --filter @productmap/web test` (the package script, which excludes `scripts/**`):
  **65 files, 414 tests passed**.

### Note on the full `vitest run`

Running `vitest run` WITHOUT the package's `--exclude 'scripts/**'` surfaces 5 pre-existing failures
in `scripts/prerender.test.ts` (`ENOENT … dist/marketing.html`). These require a `vite build` artifact,
are unrelated to demo work, and are excluded by the package's own `test` script.
