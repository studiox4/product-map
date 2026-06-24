# Demo Mode — Foundation Pass Report

Status: **DONE**. Worktree `product-map-demo-mode`, branch `demo-mode`. The real
Hono `app` is now importable in a browser graph with no top-level node-only
imports, and production behavior is unchanged.

## Commits (logical, oldest → newest)

| hash | summary |
|------|---------|
| `04a8c9b` | refactor(db): add `@productmap/db/schema` subpath, repoint table imports |
| `b4e1c9c` | refactor(api): driver-agnostic `db.ts` with runtime injection |
| `2f44df5` | refactor(api): lazy-load node-only modules off the app graph |
| `553e7b6` | refactor(api): browser-safe config (Web Crypto + env guard) |
| `f2f377a` | refactor(db): inject password hasher into `seedDemo` |

---

## Change 1 — Schema-only subpath (no pg)

- **Created** `packages/db/src/schema-only.ts`:
  ```ts
  export * from './schema';
  import * as schema from './schema';
  export { schema };
  ```
- **`packages/db/package.json`** exports map: added `"./schema": "./src/schema-only.ts"`
  between `"."` and `"./seed-data"` (string form, mirrors the root export).
- **Repointed** every table-object import from `@productmap/db` → `@productmap/db/schema`
  across `apps/api/src/**`. Done with a sed loop over
  `grep -rl "from '@productmap/db'"`, excluding the four files that need manual
  handling (`db.ts`, `lib/scope.test.ts`, `routes/migration-backfill.test.ts`,
  `routes/overview.test.ts`).
- **Mixed imports split** (createDb stays on root, tables move to `/schema`):
  - `apps/api/src/lib/scope.test.ts`
  - `apps/api/src/routes/migration-backfill.test.ts`
- **Dynamic import repointed**: `apps/api/src/routes/overview.test.ts:17`
  `await import('@productmap/db')` → `'@productmap/db/schema'` (and dropped the
  now-unused `pool` from the `await import('../db')` destructure — see change 2).
- **`packages/db/src/seed-data.ts`**: table imports moved from `./index` →
  `./schema`; `type Db` kept on `./index` as `import type` (type-only, erased).
- `createDb` and `type { Db }` remain on the root `@productmap/db` everywhere
  (node entry, test harness, seed CLI).

Note on resolution: under the repo's tsconfig `paths`, `@productmap/db/*` →
`packages/db/src/*`, so `tsc`/`tsx` resolve `@productmap/db/schema` to the real
`schema.ts` (which has every table and no pg). The browser/runtime resolves the
package `exports` map → `schema-only.ts`. Both contain the same tables + the
`schema` namespace, so the two resolution paths agree.

## Change 2 — Driver-agnostic `db.ts` + runtime injection

- **`apps/api/src/db.ts`** rewritten: imports only `type { Db } from '@productmap/db'`
  (no `pg`, no `drizzle-orm/node-postgres`, no `schema`). Exposes
  `configureDb(d)`, `isDbConfigured()`, and a Proxy `db` that throws if
  unconfigured and binds functions. Cast is `as unknown as Record<...>` (tsc
  rejected the direct cast; functionally identical to the doc's `as any`).
- **`apps/api/src/index.ts`** (node entry): imports `createDb`, builds
  `const { db: nodeDb } = createDb(process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap')`
  and calls `configureDb(nodeDb)` immediately after `assertConfig()`, before
  `serve(...)`. The existing uploads `mkdirSync`/serveStatic stay (node entry,
  off the app graph).
- **No external `pool` consumers** beyond the test harness and `overview.test.ts`
  (which only destructured `pool` but never used it). The `pool` export is gone
  from `db.ts`.

### Test-harness DB configuration (the load-bearing decision)

`apps/api/src/test/helpers.ts` previously relied on `db.ts` building a shared
pool from `DATABASE_URL` at import time, and `closeTestDb` imported `{ pool }`
from `../db`. With injection that pool no longer exists, so the harness now
**replicates the node entry literally**:

```ts
import { createDb } from '@productmap/db';
import { configureDb } from '../db';
...
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { db: appDb, pool: appPool } = createDb(TEST_DATABASE_URL);
configureDb(appDb);
```

This recreates the exact pre-existing topology (the helper's own `getPool()` for
direct inserts + a separate app pool over `productmap_test`). It runs at
module top level — test files import helpers first, pg pools are lazy, and
handlers only touch `db` inside `it()` blocks (after `setupTestDb` creates the
DB). `closeTestDb` now `await appPool.end()` on the locally-built pool instead of
re-importing it. No assertion was weakened.

## Change 3 — Lazy node-only imports

- **`routes/documents.ts`**: removed top-level `import archiver`; added
  `const { default: archiver } = await import('archiver')` inside the
  `/export.zip` handler. (No `node:fs`/`node:path` were present in this file.)
- **`routes/uploads.ts`**: removed top-level `node:fs`, `node:fs/promises`,
  `node:path`, `node:url` imports and the module-load `mkdirSync` side effect
  (plus the unused exported `uploadsDir`). The POST handler now dynamically
  imports them and ensures the dir at request time.
- **`lib/ai.ts`**: `@ai-sdk/amazon-bedrock` + `@aws-sdk/credential-providers`
  moved into `defaultModelFactory` via `await import()`. Kept
  `import { streamText } from 'ai'` at top level (browser-safe, not gated).
  `isAiEnabled()` stays a pure sync env check.
- **`lib/auth/password.ts`**: removed top-level `@node-rs/argon2`; `hashPassword`
  (now `async`) and `verifyPassword` load it via `await import('@node-rs/argon2')`.

### Deviation: `createAiModel()` is now async (justified)

ARCH-DECISIONS says move the bedrock/aws imports "inside `createAiModel()`".
ESM dynamic import is async and there is no sync alternative that satisfies the
gate (`createRequire` would reintroduce a `node:module` top-level import). So
`defaultModelFactory` and `createAiModel()` became `async` (return
`Promise<LanguageModel | null>`), and the six call sites
(`ai.ts ×2`, `ideas.ts`, `copilot.ts ×2`, `decisions.ts`) now `await` —
all are already inside async Hono handlers, so this is free. The test seam
(`setAiModelFactory`) is unchanged: its parameter type stays
`(() => LanguageModel | null) | null`; only the internal `modelFactory` variable
widened to also accept a promise-returning factory. `await` on a sync mock's
return value is a no-op, so no test edits were needed (all 527 tests pass).
The imports physically land in `defaultModelFactory` (where bedrock is
constructed) rather than the thin `createAiModel` wrapper — functionally
identical for the gate.

## Change 4 — `config.ts` browser-safety

- Replaced `import { randomBytes } from 'node:crypto'` + `randomBytes(32).toString('hex')`
  with a `randomSecretHex()` helper using
  `globalThis.crypto.getRandomValues(new Uint8Array(32))` → hex.
- Added `const env = (k) => (typeof process !== 'undefined' && process.env ? process.env[k] : undefined)`
  and routed every `process.env.X` read through it (NODE_ENV, AUTH_SECRET,
  SMTP_*, ALLOW_OPEN_SIGNUP, TRUST_PROXY, APP_URL).
- Node behavior unchanged: `config.test.ts` (4 tests) passes, and `assertConfig`
  still throws in production when AUTH_SECRET is unset. The test suite always
  runs with `isProd === false` (every run logs the dev-secret warning), so the
  prod-throw path is preserved by **logic equivalence** rather than by a test:
  `NODE_ENV=production` + unset `AUTH_SECRET` → `isProd=true` → `authSecret=''`
  (falsy) → `if (cfg.isProd && !cfg.authSecret) throw` fires, identical to before.
- Note: `config.ts` is outside the gate's scanned dirs, so the gate stays green
  regardless — this change is still required for the demo graph and was made.

## Change 5 — Seed hasher injection

- **`packages/db/src/seed-data.ts`**: removed top-level
  `import { hash } from '@node-rs/argon2'`. Signature is now
  `seedDemo(db, markdownToTiptap, hashPassword = defaultHashPassword)`, where
  `defaultHashPassword = async (p) => (await import('@node-rs/argon2')).hash(p)`.
  The inline `await hash('devpassword123')` → `await hashPassword('devpassword123')`.
- **`packages/db/src/seed.ts`** (node CLI) unchanged: still calls
  `seedDemo(db, markdownToTiptap)` → uses the lazy argon2 default.

---

## Verification (the gate)

### Typecheck — PASS (both packages, no errors)

```
$ pnpm --filter @productmap/db exec tsc --noEmit     # exit 0, no output
$ pnpm --filter @productmap/api exec tsc --noEmit     # exit 0, no output
$ pnpm --filter @productmap/api build  (tsc -p tsconfig.json)  # exit 0
```

(There is no `typecheck` script in this repo; `tsc --noEmit` / the `build`
script are the equivalent. `pnpm install` was required first — the worktree had
no node_modules, which initially surfaced spurious "Cannot find type definition
file for 'node'" errors.)

### API test suite — PASS

```
 Test Files  34 passed (34)
      Tests  527 passed (527)
   Duration  58.50s
```

This exercises the injected `configureDb` path (every DB-backed route suite),
the browser-safe config (`config.test.ts`), lazy argon2 (`password.test.ts`),
and lazy fs in uploads (`uploads.test.ts`). `db` package has no test script.

### App graph node-free gate — PASS

```
$ grep -rn "^import .*\(node:\|'pg'\|@node-rs/argon2\|@aws-sdk\|@ai-sdk\|archiver\)" \
    apps/api/src/app.ts apps/api/src/routes apps/api/src/middleware apps/api/src/lib \
    | grep -v "import('" | grep -v "\.test\.ts:"
# (no output) — zero top-level offenders on the non-test app graph
```

The only matches without the `.test.ts` exclusion are test files
(`uploads.test.ts` node imports, `@ai-sdk/provider` type-only in ai/ideas/copilot
tests) — none are imported by `app.ts`, so they are not on the browser graph.

Scope caveat: this gate is a direct-file regex over the enumerated dirs, not a
transitive graph walk. It proves the offenders ARCH-DECISIONS enumerates (pg,
argon2, aws, ai-sdk, archiver, node:) are off the top level — the foundation
bar. Full in-browser import of `app` (and `schema-only.ts`'s first real
exercise via the bundler `exports` map — node/tsc resolve `paths` → real
`schema.ts`) is proven in Phase 2, not this pass.

## Deviations from ARCH-DECISIONS

1. `createAiModel()` made async (see Change 3) — only correct option given ESM
   dynamic import; contained to 6 `await` insertions, no test changes.
2. `db.ts` Proxy cast uses `as unknown as Record<string|symbol, unknown>` instead
   of the doc's `as any` — tsc strictness; behavior identical.
3. `config.ts` Web Crypto change is unconditional (not "lazy inside the dev-secret
   branch") because `globalThis.crypto.getRandomValues` is cross-runtime and
   needs no node import — matches the doc's own "config browser-safety" section
   (line 51), which supersedes the terser "lazy node imports" bullet (line 42).
