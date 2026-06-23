# Demo Mode — No-Auth, Nothing-Saves Product Demo

**Date:** 2026-06-23
**Status:** Approved design, ready for implementation plan

## Goal

Let anyone try Product Map with **no authentication and no registration**. Visitors can navigate the full app, create/edit/delete data, and get a real feel for the product. **Nothing persists** — every page load (or `/demo` entry) starts from a fresh, curated demo dataset. No real database is touched.

## Approach: Real backend in the browser (in-page)

The frontend talks to the API exclusively through the Hono typed client (`hc`) in `apps/web/src/lib/api.ts`. In demo mode we swap that client's `fetch` to call the **real Hono app** — the actual route logic — bound to an **in-memory PGlite (WASM Postgres)** database. No logic is re-implemented; the demo *is* the real backend, so it cannot drift from production behavior.

**No Service Worker.** Hono's `app.fetch(request)` is a plain `Request → Response` function that runs on the main thread. `hc(url, { fetch })` accepts a custom fetch. So interception is a single in-page swap — no SW registration, lifecycle, scope, or cache complexity. (Verified compatible with Hono `^4.6.14`.)

### Why this over the alternatives

- **Transport-layer mock (hand-written CRUD per entity):** rejected. Would re-implement ~13 entities' CRUD + filtering + scoping in TS and drift from the real API forever.
- **Real ephemeral server tenant (Neon branch reset):** rejected — requires a live demo backend to run and secure; user wants pure client-side.
- **Service Worker + PGlite:** rejected — same payoff as in-page interception but with SW lifecycle complexity and Vite-dev friction for no benefit.

### Flow

```
/demo route
  → set demoMode flag (in-memory)
  → create in-memory PGlite, run Drizzle migrations
  → seed curated demo project
  → build the real Hono app bound to that PGlite db
  → swap api.ts hc client: fetch = (req) => demoApp.fetch(req)
  → AuthProvider short-circuits to a hardcoded demo user
  → navigate to /app
```

### Reset semantics ("nothing saves")

PGlite is created **in-memory** (NOT `idb://...`, which would persist to IndexedDB and violate the requirement). Every `/demo` entry creates a fresh PGlite instance and reseeds. A browser refresh that re-runs `/demo` → clean slate. This must be verified end-to-end (refresh = identical starting state).

## Components

### 1. Demo runtime (`apps/web/src/demo/`)

- `demoDb.ts` — instantiate in-memory PGlite, run migrations, return a `drizzle-orm/pglite` db handle.
- `demoApp.ts` — build the real Hono app with the PGlite db injected and a demo-auth shim. Exposes `demoApp.fetch`.
- `seed.ts` — curated demo dataset (see Seed Data).
- `demoMode.ts` — module-level flag + `enableDemo()` entry used by the `/demo` route.

### 2. API client interception (`apps/web/src/lib/api.ts`)

When `demoMode` is on, construct the `hc` client with `{ fetch: demoFetch }` where `demoFetch(req) => demoApp.fetch(req)`. Production path unchanged (default `fetch`, credentials include).

### 3. Auth bypass

- **Backend (demo build):** a demo variant of `requireAuth` / membership middleware returns hardcoded claims `{ id: 'demo-user', role: 'admin' }` and treats the demo project as owner-accessible. Selected via Vite alias in the demo bundle, not a runtime branch in prod.
- **Frontend:** `AuthProvider` (`apps/web/src/lib/auth.tsx`) short-circuits `useMe()` to the demo user when `demoMode`, so `RequireAuth` never redirects to `/login`.

### 4. Demo entry + chrome

- New `/demo` public route registered in `apps/web/src/App.tsx`.
- Persistent "Demo" banner with copy: *nothing you do is saved — sign up to keep your work*, linking to `/register`.
- Login/register UI hidden or redirected to `/app` while in demo mode.

## Backend refactors (mechanism-independent — also benefit production)

These are required so the real backend can load in a browser. None change data model or behavior.

1. **Split `@productmap/db`.** Add a schema-only export path that does **not** import `pg` / `drizzle-orm/node-postgres`. Update the ~22 route files importing `@productmap/db` to import schema from the schema-only subpath. The driver factory (`createDb`) lives on its own subpath. *Largest task; purely mechanical.* (Root cause: today every route → `@productmap/db` → `pg` at import time, which breaks in-browser.)
2. **Lazy-load node-only modules** so they don't break at module load:
   - `apps/api/src/config.ts` — `node:crypto` `randomBytes` → lazy / dev-only.
   - `apps/api/src/routes/documents.ts` — `archiver` → dynamic `import()` inside the export handler.
   - `apps/api/src/routes/uploads.ts` — `mkdirSync` side-effect + `node:fs` → moved inside the handler.
   - `apps/api/src/lib/ai.ts` — `@ai-sdk/amazon-bedrock` + `@aws-sdk/credential-providers` → dynamic import, or Vite alias to a stub in the demo build.
3. **DB driver selection.** `apps/api/src/db.ts` stays `node-postgres` for prod; the demo bundle aliases the db module to a PGlite-backed handle (`drizzle-orm/pglite`). Vite alias — no runtime branch in prod.
4. **CI guard.** A build/lint check that fails if a node-only module-level import enters the demo-reachable path, so a future `import fs` can't silently break the demo.

## Scope: what's full-fidelity vs stubbed

**Full fidelity** (real route logic on PGlite) — the product's core value:
features, ideas, documents (CRUD/edit), releases, objectives, plans, comments, evidence, decisions, votes, overview, activity, share, templates, projects, copilot *nudges* (GET, no LLM).

**Stubbed** (~a third of surface, all non-core):

| Area | Demo behavior | Reason |
|------|---------------|--------|
| Auth login/register/change-password | Skipped; auto-logged-in as demo user; auth UI hidden | `@node-rs/argon2` is node-only |
| Uploads | In-memory blob map (`URL.createObjectURL` for preview) or skip-write + DB record only; cleared on reset | `node:fs` write |
| Doc ZIP export | Hidden or `501` | `archiver` + `node:fs` |
| AI / copilot chat + review | `503` or buttons hidden | AWS Bedrock unavailable in browser |
| Invite emails | Link-only (nodemailer already lazy) | no SMTP in browser |

Schema is 100% PGlite-compatible (enums, JSONB, check constraints, partial unique index, FKs, `gen_random_uuid()`, full-text search) — confirmed, no extensions required.

## Seed data

A curated demo project (authored, not random) so the product looks alive on first load:
~15 features spanning now/next/later and mixed statuses, a few inbox ideas, 2 releases, 2–3 objectives, 2–3 documents, plus a scattering of comments, votes, and activity. Authored once as a seed module run on `/demo` boot.

## Testing / verification

- **Reset:** refresh `/demo` → byte-identical starting state; mutations from a prior session are gone.
- **Full-fidelity routes:** create/edit/delete a feature, move horizons on the roadmap, edit a doc, vote, comment — all succeed in-memory.
- **Stubbed routes:** AI buttons hidden/503; export hidden; uploads preview without persisting; no login redirect.
- **Prod untouched:** production build still uses node-postgres + real auth; demo aliases apply only to the demo bundle. CI guard green.
- **Bundle:** PGlite WASM (~3MB) loads only on `/demo`, not on the marketing landing or normal app.

## Open implementation questions (resolve during planning)

- Exact Vite mechanism for the demo bundle (separate entry vs. conditional alias set) and how `/demo` lazy-loads it.
- Whether uploads use an in-memory blob map vs. skip-write only.
- Migration execution in-browser: run Drizzle migration SQL against PGlite at boot vs. a prebuilt SQL snapshot for faster cold start.
