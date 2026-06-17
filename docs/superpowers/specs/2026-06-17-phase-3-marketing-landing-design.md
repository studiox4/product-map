# Phase 3 — Public Marketing Landing (Design)

**Date:** 2026-06-17
**Status:** Draft for review
**Depends on:** Phase 2 (multi-project + membership + invites) — merged.

## Goal

Give ProductMap a credible public face: a marketing landing at `/` that any unauthenticated visitor sees, while the application moves under an auth-gated `/app/*` prefix. The landing is crawlable (prerendered HTML + Open Graph tags) and reuses the existing app design language. Preserve the offline / air-gapped / markdown-is-yours ethos and keep existing public share + invite links working.

## Background / current state

- The app is a Vite + React SPA (`apps/web`) with an authed dashboard currently rendered at `/` (`routes/Landing.tsx`, inside `AuthedShell` → `ActiveProjectProvider` → first-run gate).
- Public, non-app routes today: `/login`, `/register`, `/share/:token`, `/invite/:token`. Everything else is auth-gated.
- **There is no production web-serving path yet.** The API (`apps/api`, Hono) serves only `/uploads` via `@hono/node-server/serve-static`; there is no Dockerfile and no SPA static handler. Dev runs vite (5173) + api (3411) separately.
- This means a prerendered `/` has nothing to serve it in production — so a *minimal* production static-serving path is in scope (see §4).

## Decisions (locked during brainstorm)

1. **App moves to `/app/*`**; marketing owns `/`. (Chosen over auth-conditional `/` and a `/welcome` path — cleanest separation, conventional landing at root.)
2. **Prerender `/` to static HTML** + Open Graph tags; the rest stays a client SPA. (Chosen over OG-tags-only client render and full SSR.)
3. **Sections:** hero (split layout) + feature highlights + product screenshots + open-source ethos + GitHub social proof + footer. (Self-host quickstart cut.)
4. **Hero primary CTA = "Deploy your own / GitHub"** (project-homepage framing); secondary = "Sign in" → `/login`.
5. **Hero layout = split** (text + CTAs left, framed app screenshot right).
6. **Logged-in `/` behavior:** `/` renders marketing for everyone; the nav adapts ("Sign in" when logged out, "Open app" → `/app` when logged in). No auto-redirect.
7. **Minimal production serving in scope:** the API gains a static handler so a single self-hosted process serves the prerendered `/` + the SPA.

## Architecture

Three units, each independently testable:

### Unit A — Route migration (`/` → `/app/*`)
- All authed routes gain the `/app` prefix. `App.tsx`: the `RequireAuth → ActiveProjectProvider → AuthedShell` subtree mounts at `/app/*`; `Marketing` mounts at `/`.
- Authed route map after migration: `/app` (dashboard, today's `Landing`), `/app/board`, `/app/roadmap`, `/app/features/:id`, `/app/releases`, `/app/releases/:id`, `/app/outcomes`, `/app/docs`, `/app/docs/:id`, `/app/docs/:id/read`, `/app/inbox`, `/app/settings/*`.
- Public/unprefixed (unchanged): `/login`, `/register`, `/share/:token`, `/invite/:token`. New public: `/` (marketing).
- All internal navigation updated: `<Link>`, `<NavLink>`, `navigate(...)`, command-palette route table (`components/command/`), recents, `AppShell` nav links, the `?new=1` switcher link, and any hardcoded paths.
- Redirect semantics:
  - `RequireAuth` unauth → `/login` (unchanged).
  - Post-auth default redirect target: `safeNext` fallback changes from `/` to **`/app`** (Login.tsx + Register.tsx). `?next=` still honored (already same-origin-guarded).
  - `AcceptInvite` success → `/app` (was `/`), keeping `pm.activeProjectId` set.
- **Boundary:** this is mechanical but wide. A dedicated task sweeps targets + updates tests/e2e. No behavior change beyond the prefix.

### Unit B — Marketing page (`/`)
- `routes/Marketing.tsx` — a **presentational** page (no router hooks, no react-query, no providers) so it prerenders cleanly with no hydration mismatch.
- Section components under `components/marketing/`:
  - `MarketingNav` — logo + right-side auth-adaptive link (Sign in / Open app) + GitHub link. Auth state via a bare `fetch('/api/auth/me')` in a mount effect (NOT `useMe` — Marketing has no QueryProvider); default/logged-out renders "Sign in", upgrades to "Open app" → `/app` if the fetch returns a session. Non-blocking; see §note.
  - `Hero` — split: left headline/subhead/CTAs (primary `Deploy your own` → the GitHub repo's README/deploy section — a real URL, no in-app deploy-docs page exists yet; secondary `Sign in` → `/login`), right framed screenshot.
  - `FeatureHighlights` — 3–4 cards (roadmap & horizons, feature hub + docs, releases, AI copilot).
  - `ScreenshotStrip` — framed static images from `apps/web/public/marketing/` (real app views: board, roadmap, feature page).
  - `EthosBand` — offline / air-gapped / markdown-is-yours / license callout.
  - `GitHubStars` — fetches `api.github.com/repos/<owner>/<repo>` on mount, shows star count; **graceful static fallback** number on fetch failure/offline (air-gapped instances won't reach GitHub). Excluded from prerendered HTML (dynamic-only).
  - `MarketingFooter` — GitHub, docs, license, "powered by ProductMap".
- Reuses existing tokens/primitives (`Button`, surface/ink colors, card shadows, horizon accents). No new design system.
- **Repo coordinates** (owner/repo for GitHub links + stars) come from a single constant (e.g. `REPO_URL` in shared or a web config), not scattered literals.

### Unit C — Prerender + production serving
- **Prerender build step — toolchain matters.** A bare `node` import of the `Marketing` TSX tree will throw the moment a component imports CSS/SVG/asset files (it will — we reuse app tokens/primitives). So the prerender uses a proper SSR build, not a hand-rolled `node` script: either an SSR entry built with `vite build --ssr` (then `renderToString` the SSR bundle in a post-build step) or `vite-react-ssg`. The plan picks one and states the exact commands; the implementer must NOT attempt a raw `node import('./Marketing.tsx')`. The step writes a static `dist/index.html` for `/` containing:
  - the rendered marketing markup,
  - `<head>` Open Graph + Twitter card + description/title meta (see OG-URL note below),
  - the normal Vite asset tags (so the SPA still boots and takes over client-side).
  - The SPA entry for client routes is served from a distinct shell (e.g. keep Vite's generated `index.html` as the app shell, write the prerendered marketing to a separate file the server maps to `/`) — chosen concretely in the plan; the invariant is: **exact `/` serves prerendered marketing HTML; `/app/*` and other client routes serve the SPA shell.**
- **Open Graph absolute URLs.** Scrapers require absolute `og:url` / `og:image`, but each self-hosted instance has a different domain unknown at `vite build` time. Decision: **bake a canonical project domain** (a single `MARKETING_SITE_URL` constant) into the prerendered `og:url`/`og:image`. Rationale: previews matter most when the *project* is shared, not an arbitrary instance; relative/instance-host injection at serve time is deferred (out of scope). The OG image is a static asset committed under `apps/web/public/marketing/`.
- **Production static serving (API):** add a static handler in `apps/api` that, after the `/api/*` and `/uploads/*` routes:
  - serves built assets from the web `dist/`,
  - returns the prerendered marketing HTML for exact `GET /`,
  - history-fallback: any other non-API, non-file GET returns the SPA shell.
  - Gated so it does not shadow `/api/*`. Active only when a built `dist/` is present (env/flag), so dev is unaffected.
- **Dev unchanged:** vite client-renders `/` (Marketing component) via the SPA router; prerender affects only built output + crawlers.

## Data flow

- Marketing page: static content; the only runtime fetch is `GitHubStars` → `api.github.com` (client-only, cached in memory, fallback on error). No app API calls, no auth.
- Prerender: build-time only; reads the Marketing component, writes HTML. No runtime data.
- Serving: request → API matches `/api/*` / `/uploads/*` first → else static handler (`/` = marketing HTML, files = assets, else = SPA shell).

## Error handling

- `GitHubStars` fetch failure (offline / rate-limited / air-gapped) → render a static fallback count and the repo link; never block or error the page.
- Static handler when `dist/` absent (pure dev/API-only run) → handler is inactive; `/` is served by vite in dev. No crash.
- Prerender script failure → fails the build loudly (CI catches), never ships a half-written `index.html`.

## Testing strategy

- **Unit (web):** Marketing renders all six sections; hero CTAs target GitHub repo + `/login`; nav link is "Sign in" when logged out; `GitHubStars` shows fallback on fetch reject and the live count on success.
- **Routing (web):** `/app/*` is auth-gated (unauth → `/login`); `/` renders marketing without providers; `/share/:token` + `/invite/:token` remain public; post-login default lands on `/app`.
- **Prerender (build):** the prerender script emits `dist/index.html` containing the hero headline text and the OG/Twitter meta tags (assert against built output).
- **Serving (api):** static handler returns marketing HTML at `/`, SPA shell at `/app/board`, and leaves `/api/*` responses untouched; inactive when `dist/` absent.
- **e2e:** existing specs updated to `/app/*` paths; new spec — logged-out visit to `/` shows the hero + "Deploy your own" CTA; clicking "Sign in" lands on `/login`. (Note: e2e runs against the vite **dev** server = client render — it does NOT exercise the prerender/serve path. See the required integration check below.)
- **REQUIRED — build→prerender→serve integration check (the feature's actual value path).** The prerender's whole point is crawlable HTML in the *raw* HTTP response, and the dev-server e2e never hits that path. A dedicated check must: run `pnpm build` (which MUST invoke the prerender), boot the API with `dist/` present, then assert via raw HTTP (no JS execution): `GET /` body contains the hero headline text AND the `og:title`/`og:url` meta tags; `GET /app/board` returns the SPA shell (no marketing markup); `GET /api/healthz` still responds. This is a required task in the plan, not optional polish — without it "crawlable" is asserted by construction, not verified.

## Out of scope (explicit)

- Full deploy story (Dockerfile, reverse proxy, TLS, CDN) — only the minimal in-process static handler ships here.
- Self-host quickstart section (cut in brainstorm).
- SSR/hydration of the app itself.
- Sitemap.xml / robots.txt automation (can be a trivial follow-up; OG tags + crawlable `/` are the credibility bar for v1).
- Marketing CMS / editable content — sections are coded.

## Risks

- **Migration breadth:** the `/app/*` sweep touches many files, tests, and e2e specs. Mitigation: a single focused task with a full grep sweep + green test suite as the gate.
- **Prerender/serving seam:** distinguishing exact-`/` marketing vs SPA-shell fallback is the subtle part. Mitigation: the serving invariant is stated above and gets dedicated serving tests; keep Marketing presentational to avoid hydration issues.
- **Air-gapped GitHub stars:** must degrade silently — covered by the fallback requirement + test.

## Note — auth-adaptive nav on a prerendered page

The prerendered `/` HTML is generated logged-out (build time), so it ships the "Sign in" link. After the SPA boots client-side, the nav may upgrade to "Open app" if a session is detected. This is a progressive enhancement, not a correctness requirement; the prerendered baseline (Sign in + GitHub) is always valid. Keep the auth check cheap and non-blocking so it never delays first paint.
