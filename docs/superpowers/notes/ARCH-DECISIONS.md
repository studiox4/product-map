# Demo Mode — Final Architecture Decisions (supersedes plan/amendments where conflicting)

Grounded in the actual code. These decisions are authoritative for implementation.

## Core insight: reuse the REAL `app`, inject db + auth cookie at runtime

`apps/api/src/middleware/auth.ts` `requireAuth` only verifies a JWT cookie (`pm_session`) via `verifyAccess` (`hono/jwt` = Web Crypto, browser-safe) and does **no DB read**. `requireMembership(min)` grants `admin → owner` with **no DB read**. CSRF (`app.ts:25-36`) only rejects non-GET when `!isSameOrigin(c)`; a synthetic in-page `Request` with no `Origin` passes (spike-confirmed). Therefore:

- **No separate `demoApp`/`demoAuth` assembly.** Demo imports the real `app` (`apps/api/src/app.ts`) and calls `app.fetch(req)`.
- **Auth:** the intercepting fetch attaches a `Cookie: pm_session=<demo JWT>` header to every request. The token is minted in-page with `hono/jwt` `sign({ sub: DEMO_USER_ID, role: 'admin', tv: 0, exp: now + 1yr }, config.authSecret)`. Real `requireAuth` verifies it; real `requireMembership` sees `admin` → owner. Zero auth-related DB reads.
- **No global Vite aliases, no separate demo build.** Same bundle. Demo code is lazy-loaded only at `/demo`, so PGlite WASM lands in a `/demo`-only chunk.

## DB: driver-agnostic module + runtime injection (replaces alias approach)

Make `apps/api/src/db.ts` import **no** `pg` and expose an injectable handle:

```ts
import type { Db } from '@productmap/db';
let _db: Db | null = null;
export function configureDb(d: Db) { _db = d; }
export function isDbConfigured() { return _db !== null; }
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    if (!_db) throw new Error('db not configured — call configureDb() first');
    const v = (_db as any)[prop];
    return typeof v === 'function' ? v.bind(_db) : v;
  },
}) as Db;
```

- **Node path** (`apps/api/src/index.ts`): build the pg pool there (`createDb(connectionString)` from `@productmap/db`) and call `configureDb(db)` before `serve(...)`. Production behavior identical; pg import moves to the node entry, off the browser-reachable path.
- **Demo path** (`enableDemo()`): build the PGlite drizzle handle and call `configureDb(pgliteDb)` before any request is dispatched. The forwarding proxy means all route imports of `{ db } from '../db'` work unchanged in both.
- Any other importer of `db.ts`'s `pool` export: grep and move to the node entry; if none outside index, drop the `pool` export from db.ts.

## Schema package: `@productmap/db/schema` subpath (no pg)

`@productmap/db` root imports `pg` (createDb). Add `packages/db/src/schema-only.ts` (`export * from './schema'; export { schema }`) and a `"./schema"` export in `package.json`. Repoint every `apps/api` import of **table objects** (`users`, `memberships`, `features`, …) from `@productmap/db` → `@productmap/db/schema`. Leave `createDb`/`type Db` on the root (node entry + seed only). `type Db` may be imported type-only from root anywhere (types erase).

## Lazy node-only imports (so importing `app` is browser-safe)

Move these from module top-level to dynamic `import()` inside the specific handler (the demo never calls them):
- `config.ts` — `node:crypto` `randomBytes` → lazy inside the dev-secret branch only.
- `routes/documents.ts` — `archiver`, `node:fs`, `node:path` → inside the export.zip handler.
- `routes/uploads.ts` — drop module-load `mkdirSync`; `node:fs` writes → inside POST handler.
- `lib/ai.ts` — `@ai-sdk/amazon-bedrock`, `@aws-sdk/credential-providers` → inside `createAiModel()`; `isAiEnabled()` stays a pure env check.
- `lib/auth/password.ts` — `@node-rs/argon2` → dynamic inside `hashPassword`/`verifyPassword` (only register/login/change-password call these; demo doesn't).

## config browser-safety (no Vite define, no node:crypto)

`config.ts` (`assertConfig()` singleton, evaluated at import) is pulled in via tokens→auth→app on the demo path. Make it browser+node safe with no build-time `define`:
- **Replace `node:crypto` `randomBytes(32)`** with the cross-runtime Web Crypto API: `const b = new Uint8Array(32); globalThis.crypto.getRandomValues(b); const hex = [...b].map(x => x.toString(16).padStart(2,'0')).join('')`. Available in Node ≥18 and browsers. Removes the only `node:crypto` import — no lazy needed.
- **Guard every `process.env.X`** with a helper: `const env = (k: string) => (typeof process !== 'undefined' && process.env ? process.env[k] : undefined);` then use `env('AUTH_SECRET')`, `env('NODE_ENV')`, etc. In-browser `isProd` is false → dev branch → ephemeral Web Crypto secret; `SMTP_HOST` undefined → `smtp: null`.
- Net: in-browser `loadConfig()` returns a valid config with an **ephemeral secret**, never throws. `enableDemo()` signs the demo JWT with `config.authSecret` (the same ephemeral value the same module instance verifies against) — so sign and verify always agree. No `AUTH_SECRET` define required.
- Prod path unchanged: `env('NODE_ENV')==='production'` + real `AUTH_SECRET` → identical behavior; `assertConfig` still throws in prod if the secret is missing.

## Migrations in-browser

Bundle the 14 `.sql` files from `packages/db/migrations/` as raw strings via `import.meta.glob('/…/migrations/*.sql', { query: '?raw', eager: true })`, order by `meta/_journal.json` (idx asc), split each on the literal `--> statement-breakpoint` (NOT `;` — 0011 has a `DO $$` block), `await client.exec(chunk)` per chunk against the raw `PGlite` client. Then `drizzle(client)` for queries. In-memory `new PGlite()` (NO `idb://`).

## Seed: reuse `seedDemo`, parametrize the password hasher

`seedDemo(db, markdownToTiptap)` from `packages/db/src/seed-data.ts` already seeds the admin user with id `00000000-0000-0000-0000-000000000001`, plus projects and memberships. So **mint the demo JWT with `sub = '00000000-0000-0000-0000-000000000001'`, `role: 'admin'`** — no seed fork. `markdownToTiptap` from `apps/api/src/lib/markdown.ts` is browser-safe (`@tiptap/html`+turndown+marked, no DOM).

**Blocker:** `seed-data.ts` top-level-imports `@node-rs/argon2` (`hash('devpassword123')` for `passwordHash`). That's a native node addon — un-loadable in browser even via dynamic import. The demo never logs in, so the hash is cosmetic. Fix by **injecting the hasher**:
- Change `seedDemo(db, markdownToTiptap, hashPassword?)` — add an optional 3rd param `hashPassword: (plain: string) => Promise<string>`.
- Remove the top-level `import { hash } from '@node-rs/argon2'`. Default `hashPassword` to a **lazy** wrapper: `async (p) => (await import('@node-rs/argon2')).hash(p)` (runs only in node CLI, only when no hasher is injected).
- Node CLI seed (`packages/db/src/seed.ts`) keeps calling `seedDemo(db, markdownToTiptap)` → real argon2 via the lazy default.
- Demo passes a stub: `seedDemo(db, markdownToTiptap, async () => 'demo-no-login')`. No argon2 in the browser graph.
- Verify no other top-level node-only import remains in seed-data.ts (it imports `Db` type from root — type-only, fine; confirm it imports table objects from `@productmap/db` and repoint to `@productmap/db/schema` if it pulls pg).

## api.ts interception: late-bound `activeFetch`

`apps/web/src/lib/api.ts` does NOT use the `hc` typed callers for I/O — it calls the global `fetch` directly in `fetchJson()` and in `tryRefresh`/`useMe`/`useShareData`. Introduce:

```ts
let activeFetch: typeof fetch = (...a) => fetch(...a);
export function setActiveFetch(f: typeof fetch) { activeFetch = f; }
```

Route **every** I/O site through `activeFetch`. `enableDemo()` calls `setActiveFetch(demoFetch)` where `demoFetch(input, init)` normalizes the URL (`new URL(input, 'http://demo.local')`), injects the demo cookie header, and returns `app.fetch(new Request(url, init))`. Demo path must never 401, so `tryRefresh` never fires — but it too must go through `activeFetch` for safety.

## Frontend

- `/demo` public route → `DemoEntry`: lazy `import()` the demo bundle, `await enableDemo()`, then `navigate('/app')`.
- `auth.tsx`: when demo mode, short-circuit reactively — `queryClient.setQueryData(['me'], demoUser)` in `enableDemo()` and a `demoMode` check so `RequireAuth` never redirects.
- `DemoBanner` in the app shell when demo mode; hide login/register links and AI/export buttons.

## Stubs

- AI/copilot: `isAiEnabled()` is false in browser (no AWS env) → routes already return 503. Just ensure the lazy import (above) keeps `app` importable. Hide AI buttons in UI.
- Uploads: in-memory `Map<id, Blob>` + `URL.createObjectURL` for preview; cleared on reset.
- Doc export: hide the button; route may 501.

## Build/serve

Single bundle. Demo chunk lazy at `/demo`. Marketing prerender (`scripts/prerender.mjs` / `vite build --ssr`) must NOT import the demo/PGlite graph — keep `/demo` behind a `React.lazy` dynamic import so SSR/prerender never resolves it. Verify the main + landing entry chunks have no PGlite WASM reference.

## Task order

1. Foundation: schema-only subpath + repoint imports; driver-agnostic `db.ts` + `configureDb` wired into node `index.ts`; lazy node imports; config browser-safety prep. Prove: api typecheck + existing api tests green (prod unaffected).
2. Demo runtime (`apps/web/src/demo/`): migrations loader, `demoDb` (PGlite + configureDb), demo session/JWT, `demoFetch`, `enableDemo`. Prove: vitest builds `app` in-page, seeds, answers a real `GET` + `POST` feature.
3. api.ts `activeFetch` interception. Prove: demo client resolves from in-page `app`; no 401.
4. Frontend: `/demo`, auth short-circuit, banner, hidden chrome, lazy chunk + `define`.
5. Stubs: uploads in-memory.
6. Verification: zero-persistence reset test; CI purity guard; prod-unaffected build check; Playwright e2e (create feature, move horizon, edit doc, comment, vote); confirm demo WASM not in main chunk.
