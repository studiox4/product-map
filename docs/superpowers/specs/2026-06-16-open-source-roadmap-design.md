# Open-Source Roadmap — Design / Decomposition

**Date:** 2026-06-16
**Status:** Approved decomposition. Each phase below is a separate sub-project that will get its own `spec → plan → implementation` cycle in a later session.
**Scope note:** This document is a roadmap, not a single implementation spec. It decomposes "make ProductMap open-sourceable" into sequenced, independently-shippable phases.

---

## 1. Goal

Take ProductMap from a single-tenant, no-auth demo to a credible open-source, self-hosted product that supports real authentication, multiple projects per install with per-project access control, and a public marketing landing page — without losing the offline / air-gapped, markdown-is-yours ethos that defines the project.

## 2. Current state (verified 2026-06-16)

- **Monorepo:** `apps/web` (Vite + React + TanStack Query + Tiptap), `apps/api` (Hono, zod-validated REST), `packages/{shared,db,templates}`. Postgres via Drizzle. Two prior "dream tier" feature waves shipped (ideas inbox, evidence/decisions, releases, objectives, roadmap scenario plans, copilot, share links).
- **No real authentication.** `apps/api/src/middleware/current-user.ts` resolves the `x-user-id` header to a user row, falling back to the first seeded user on any mutation. Read requests skip resolution entirely. "Login" = type your name; `users` table is `{ id, name, color, createdAt }` — no email, no password.
- **Tenancy is latent, not real.** A `products` table exists and `features.productId` already scopes features to a product, but the seed creates exactly one product and the UI assumes it. There is no project create/list/switch, and no membership or access-control layer. `products` route only exposes `PATCH /:id`.
- **Sharing exists.** `share_tokens` table + `/share` routes already provide public read-only links — reusable foundation for Phase 3 and dream item #6.
- **AI is Bedrock-only.** Drafting + copilot run on Claude via Amazon Bedrock (Vercel AI SDK), gated on AWS credentials. No path for self-hosters without AWS.
- **OSS hygiene:** strong README + screenshots already present. Missing: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, Dockerfile/compose, CI, `.env.example`, CHANGELOG.

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tenancy model | **Per-project membership** (roles: owner / editor / viewer) | One shared install, many projects, access controlled per project. Sweet spot for self-hosted teams; avoids SaaS-style org overhead. |
| Authentication | **Email + password (argon2) by default**, optional env-gated GitHub/Google OAuth, httpOnly cookie sessions | Works offline / air-gapped (matches the security-constrained pitch); OAuth is opt-in convenience, not a dependency. |
| Marketing page | **Public route in the existing web app** at `/`; app moves to `/app` | Less infra than a separate site; reuses the existing build. SEO handled via prerender/SSG of the landing route. |
| License | **Apache-2.0** | Max adoption + enterprise-safe + explicit patent grant. Accepts that closed SaaS forks are permitted. |
| Project unit naming | **Rename `products` → `projects`** (table, FKs, code, shared types, seed) | Clearer long-term vocabulary; done now while the codebase is small rather than after more routes accrete. Medium churn, ~20+ references. |

## 4. Phases

Phases are ordered by dependency. Phase 0 can run in parallel with Phase 1 design. Phases 1 → 2 → 3 are strictly sequential (each depends on the prior). A curated slice of Phase 4 folds in before public launch.

### Phase 0 — OSS readiness foundation
*Size: small. Risk: low. Start early, parallelizable.*

The hygiene that makes the repo credible the moment it goes public.

- `LICENSE` (Apache-2.0), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue + PR templates.
- **`Dockerfile` + `docker-compose.yml`** — app + Postgres, one-command up. The single biggest adoption lever for a "self-hosted" tool.
- **CI** (GitHub Actions): lint, typecheck, unit tests, e2e, build. Publish a container image to GHCR on tagged release.
- `.env.example`, a configuration reference in docs, `CHANGELOG.md`, semver release process.

**Acceptance:** a stranger can clone, `docker compose up`, and reach a running instance; CI is green on PRs; license + contribution docs are present.

### Phase 1 — Authentication & identity *(keystone)*
*Size: large. Risk: high (breaking change to the actor model). Everything downstream depends on this.*

- `users` gains `email` (unique) + `password_hash` (argon2). New `sessions` table; auth via httpOnly, SameSite cookie.
- **CSRF protection** (cookie sessions require it) and **rate limiting** on auth endpoints.
- Signup / login / logout flows; first-run **admin bootstrap** (first registered user, or env-seeded admin).
- Optional, env-gated **GitHub / Google OAuth** (`GITHUB_CLIENT_ID` / `GOOGLE_CLIENT_ID`).
- Optional **SMTP** for password reset; air-gapped fallback = admin-set passwords.
- Replace the `currentUser` middleware: resolve user from session, reject unauthenticated mutations (and gate reads once Phase 2 lands). Remove the `x-user-id` fallback.

**Acceptance:** no request is attributed to a fallback user; sessions persist across reloads; OAuth works when configured and is hidden when not; auth endpoints are rate-limited and CSRF-safe.

**Dependencies:** none (keystone). **Blocks:** Phases 2 and 3.

### Phase 2 — Multi-project + membership
*Size: large. Risk: high (data-model + authorization change touching every route).*

- Rename `products` → `projects` (schema, FKs, shared contracts, seed, routes, web). Migration handles existing data.
- New `memberships(userId, projectId, role)` with role enum `owner | editor | viewer`.
- Project **create / list / switch** — a switcher in the nav; first-run "create your first project" flow.
- **Authorize and scope every query** by project membership. This is the bulk of the work: every existing route currently assumes one global project and an always-present user.
- **Invites:** by email when SMTP is configured, otherwise a shareable invite link carrying a role.

**Acceptance:** a user sees only projects they are a member of; role is enforced on every mutation (viewer cannot edit, etc.); switching projects re-scopes all views; invites grant the correct role.

**Dependencies:** Phase 1. **Blocks:** Phase 3 gating semantics.

### Phase 3 — Public marketing landing
*Size: medium. Risk: medium (routing + SEO). The visual phase — Visual Companion offered during its brainstorm.*

- Public `/` landing: hero, feature highlights, animated/static screenshots, quickstart, self-host CTA, GitHub stars.
- App moves to `/app`; `/app/*` is auth-gated. Existing share-token pages remain public.
- SEO: prerender / SSG the landing route; Open Graph tags; sitemap.

**Acceptance:** unauthenticated visitors see the landing at `/`; `/app/*` redirects to login; the landing is crawlable (prerendered HTML, OG tags present); share links still work unauthenticated.

**Dependencies:** Phase 1 (auth gating), Phase 2 (project context post-login).

### Phase 4 — Dream polish *(curated before launch)*
*Each item is independently optional; pick what earns its place. Ranked by first-impression impact.*

1. **Provider-agnostic AI** — today AI is Bedrock-only; most self-hosters lack AWS. Add bring-your-own-key support for the Anthropic API, OpenAI, and Ollama. **Strongly recommended for launch** — current state is an adoption blocker.
2. **Global search** across docs, features, and ideas.
3. **In-app notifications** (mentions, comment replies, invites); SMTP optional, in-app is the floor.
4. **Empty / onboarding states** for a fresh install with no seed data.
5. **Command palette** (⌘K navigation + actions).
6. **Public read-only roadmap share** — extend existing `share_tokens` to a public project roadmap view ("powered by ProductMap").
7. **API tokens (PAT)** for programmatic / integration access.
8. **Dark mode** + accessibility pass.
9. **Webhooks / Slack** notifications on changes.

**Recommended launch slice:** #1 (provider-agnostic AI) and #4 (onboarding) are near-mandatory; #2, #5, #6 are high-leverage if time allows.

## 5. Sequencing

```
Phase 0 ─┐ (parallel)
         ├─> Phase 1 (auth, keystone) ─> Phase 2 (projects + membership) ─> Phase 3 (marketing)
Phase 4 ──── curated slice folded in before public launch ───────────────────────────────────^
```

Recommended order: **0 → 1 → 2 → 3**, Phase 0 begun in parallel with Phase 1 design, dream slice (esp. #1, #4) merged before the repo is announced.

## 6. Cross-cutting risks

- **Authorization is the highest-risk surface.** Once multi-user + public, every route needs membership/role checks. Phase 2 should include an explicit authorization test matrix (role × action × resource).
- **Auth is a breaking change.** Phase 1 removes the `x-user-id` fallback; the seed, e2e tests, and dev workflow all assume an always-present user today and must be migrated.
- **The `products` → `projects` rename** touches ~20+ files; do it as the first commit of Phase 2 with a data migration, in isolation, before adding membership logic.
- **Don't lose the offline ethos.** Every new dependency (SMTP, OAuth, cloud AI) must be optional and env-gated, with a working air-gapped fallback.

## 7. Open questions (resolve at each phase's own brainstorm)

- Session storage: DB-backed `sessions` table vs signed stateless cookies. (Lean DB-backed for revocation.)
- First-run admin bootstrap mechanics: first-registered-user-is-admin vs env-seeded credentials.
- Invite link security: single-use vs reusable, expiry, role embedding.
- Marketing landing: prerender tooling choice (vite-ssg / react-static / hand-rolled) — decide in Phase 3 brainstorm.
- Provider-agnostic AI: unify on the Vercel AI SDK's provider abstraction vs a thin internal adapter.

## 8. Next step

Per-phase deep specs are deferred. When ready, brainstorm **Phase 1 (Auth)** first — it is the keystone and unblocks Phases 2 and 3 — producing its own design doc and implementation plan.
