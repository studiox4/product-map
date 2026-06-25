# Open-Core Edition Architecture — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorm) — foundation scope
**Topic:** Split Product Map into a free open-source Community core and a private, paid edition that powers a hosted cloud and is sellable for self-hosting, without paid code ever appearing in the public repo.

---

## 1. Problem & goals

Product Map is an open-source planning/roadmap tool. We want to:

1. Keep the **public repo open source** (Apache-2.0) — including the in-browser demo — so people can adopt, self-host, and contribute.
2. Build a **paid "Team" edition** (small companies leaving Jira) that powers a **hosted cloud** AND is **sellable for self-hosting**.
3. Keep all **paid code and commercial architecture out of the public GitHub repo** — it must live elsewhere.
4. Design so a **Startup** and **Enterprise** edition can follow later without re-architecting.

Non-goals for this item: building the actual paid features, billing, hosted prod infra, or the pricing/billing UI. This item delivers the **foundation** only.

### Decisions locked during brainstorm

| Decision | Choice |
|---|---|
| Commercial model | Open-core + sellable edition. Build **Team** edition now; Startup/Enterprise later. |
| Composition | **Extension seams + private repo.** Core publishes packages + seam contracts; private repo registers into them. No forking. |
| Core license | **Apache-2.0** (max adoption). Moat = private edition + hosted convenience + brand. |
| Paid feature set (Team) | AI Copilot/advanced AI; **external integrations + notification delivery** (Slack/email/Jira/GitHub/webhooks); Analytics + unlimited scale. **SSO/RBAC/orgs AND in-app notification core stay FREE.** |

### Free vs paid — the governing principle

> **Everything a team needs to plan and ship together is free forever.** We charge for (a) what costs *us* money to run (hosted cloud), (b) automation that replaces coordination work (AI, external integrations), and (c) cross-org scale and insight (analytics, lifting free-tier caps).

Two rules that flow from this and prevent re-litigation on every new feature:

1. **Collaboration primitives are free.** Auth, orgs, RBAC, comments, voting, and **in-app notifications** are how a team works together — never paywalled.
2. **Nothing already free becomes paid.** Once a capability ships in the Community core it stays in the Community core. (In-app notification core shipped free in E2a / PR #21 — it stays free. Only *external delivery* of those notifications and third-party integrations are paid.)
| Marketing site | **All marketing → private.** Public `/` becomes a minimal OSS landing; polished site + funnel deploys to productmap.com from the private repo. |
| Scope of this item | **Foundation only**, proven with one trivial gated stub. |

---

## 2. Repo & distribution topology

```
PUBLIC repo (productmap)               PRIVATE repo (productmap-cloud)
├ Apache-2.0                           ├ proprietary
├ apps/api      (Hono core)            ├ consumes public core via pinned submodule / git-dep
├ apps/web      (React core)           ├ ee/api/         paid Hono plugins
├ packages/                            ├ ee/web/         paid React slot-fills
│   ├ db        core migrations        ├ ee/db/          paid migrations (namespaced)
│   ├ shared    types                  ├ ee/entitlements/ billing + license-key providers
│   ├ sdk  ← NEW: seam contracts       ├ marketing/      productmap.com site + funnel
│   ├ web-ui ← shared UI primitives    ├ app/            the deployable cloud image
│   └ templates                        └ (this is what runs on prod)
└ (no paid code, ever)
```

**Invariants:**

- Core **boots and runs fully with zero paid packages present.** Seams degrade to no-ops.
- The **demo / PGlite path is untouched** by this work.
- The deployable cloud artifact is built **only** in the private repo. Core's `apps/*` remain runnable standalone (Community + demo).
- The private repo is a **consumer** — it never patches core; it registers into it.
- The cloud `app/` is a **thin shell** that mounts core + plugins, not a reimplementation of `apps/api` / `apps/web`. Otherwise Community and Cloud behavior drift.

---

## 3. The five seams (core work, all PUBLIC)

Each seam = an interface in `@productmap/sdk` + a registry the core calls at startup/render. Paid repo implements; core ships no implementations. Seams are designed against all three known paid features even though none are built here, to minimize later seam churn.

> Before F1, grep for the job/scheduling pattern E2a (PR #21) may already have introduced; the `JobQueue` seam should match it, not reinvent it. External notification *delivery* (paid) builds on the free in-app notification core via this seam.

### Seam 1 — Server plugin registry (`apps/api`)
On boot, core calls `registerPlugins(app, ctx)`. Each plugin receives the Hono `app` + a context (`db`, `auth`, `entitlements`, `jobs`) and mounts routes/middleware under a reserved prefix `/api/ee/*`. Community boot finds zero plugins → nothing mounts. The `/api/ee/*` prefix is reserved in core so core routes never collide with paid routes.

### Seam 2 — Background-jobs seam
Core has no job runner today. Add a thin `JobQueue` interface in `sdk` (`enqueue`, `registerWorker`, `schedule`) + a default in-process/cron implementation in core (used by nothing in Community). Paid integrations/notifications register workers. This prevents the paid repo from bolting on its own divergent scheduler and gives a single place to later swap in a durable queue.

### Seam 3 — Client slot registry (`apps/web`)
Core renders named slots at defined mount points, e.g. `<Slot id="copilot.panel" />`, `<Slot id="settings.integrations" />`, `<Slot id="nav.analytics" />`. The paid repo registers lazy-loaded components into slots. An empty slot renders nothing. Slot fills are code-split so the **Community bundle never carries paid JS**. Slot ids are a documented, versioned contract.

This is **build-time composition, not a runtime plugin host**: the cloud web build imports the paid modules so they self-register before first render. F1 must nail registration *timing*; resist any drift toward a runtime loader (YAGNI until a third-party marketplace exists).

### Seam 4 — Entitlement gate (server + client)
A single API in `sdk`: `entitlements.can(feature)` and `entitlements.limit(key)`, backed by a pluggable **provider** selected at boot. Every paywall — server route guard, client slot visibility, limit enforcement — goes through this one gate. (Providers in §4.)

### Seam 5 — Migration namespacing (`packages/db`)
Core migrations stay `0000…NNNN` tracked in the existing migrations table. Paid migrations live in the private `ee/db/` directory, tracked in a **separate `ee_migrations` table** with a distinct prefix, so the two streams never collide or renumber each other. The core migrator only ever touches the core stream; the paid edition runs both (core first, then `ee`). **`ee` migrations must be strictly additive and must never alter core tables** — core has zero visibility into what `ee` depends on, and public contributors can change core schema blind to the paid edition. "Core schema stability for `ee`" is an invisible contract the additive-only rule protects.

---

## 4. Entitlement & licensing system

One gate, three providers (chosen at boot):

| Provider | Used by | Source of truth |
|---|---|---|
| `CommunityProvider` | public core / demo | static: core features on, paid off, free-tier caps |
| `LicenseKeyProvider` | self-hosted **Team** edition | signed offline key (Ed25519) — features + limits + expiry baked in, verified against a public key shipped in the paid bundle |
| `BillingProvider` | your **cloud** | live subscription state (Stripe → entitlements cache) — *later epic* |

- **Offline-first license keys:** customer pastes a key; the edition verifies the signature locally — no mandatory phone-home. Optional periodic online refresh can come later.
- **Uniform entitlement shape:** `{ features: Set<string>, limits: { projects, seats, … }, expiresAt }`. `can()`/`limit()` never know which provider answered.
- **Fail-safe:** invalid/expired key → silently falls back to Community tier; never bricks an install.
- **Key-signing tooling** (private keypair, key generator) lives **only** in the private repo. Public repo ships only signature *verification* + the `CommunityProvider`.
- **The license key is an honesty/convenience speed-bump, not DRM.** The self-hosted Team edition ships its full source to the customer's infra; a determined self-hoster can patch the check. That is expected and fine — do not invest in "securing" the Team edition. The real moat is the hosted cloud (code never leaves us) + the license agreement + brand. Corollary: client-side `entitlements.can()` is UX-only; the **server guard is the real gate**.

---

## 5. Build, release & dependency flow

**Keep it simple: there is exactly one consumer of the seams (our own private repo), and we own both repos.** That removes the need for a published registry, strict semver negotiation, and a separately-published conformance kit — all of which exist to coordinate with consumers you *can't* change synchronously. We bump both repos ourselves.

- **Distribution:** the private repo pulls the public repo as a **git submodule pinned to a tag** (or a pnpm git-dependency on a commit ref) and builds the cloud image from source. Move the pin when you want core changes. No private npm registry needed for foundation.
- **Conformance = the private integration build.** Building the full cloud (core + stub + paid features) and running its tests in private CI catches any seam breakage loudly — no separately-published test-kit.
- **Two CI pipelines:**
  - Public CI: lint/test/build core + demo + minimal landing. Tag releases.
  - Private CI: pull pinned core, run paid + integration tests, build the cloud image, deploy.
- **Local dual-repo dev:** check out both; `pnpm link` / workspace-override the private repo at a local core checkout so both are developed together instantly.
- **Defer the publishing apparatus** (versioned packages, registry, strict semver, published conformance kit) until a *second, external* consumer of the SDK exists — i.e. the plugin-marketplace future, explicitly out of scope. Adopting it now is premature for one first-party consumer.

---

## 6. Decomposition (ordered sub-epics)

Each sub-epic gets its own spec → plan → build cycle.

1. **F1 — SDK + seam contracts** *(public)*. Create `@productmap/sdk`: interfaces for plugin registry, job queue, slot registry, entitlement provider, migration namespacing. Pure types + registries, no impls. Designed against all three known paid features.
2. **F2 — Wire seams into core** *(public)*. Core calls registries at boot/render; ship `CommunityProvider`; reserve `/api/ee/*`; add named `<Slot>` mount points; `JobQueue` default impl; `ee_migrations` support. **Gate: core boots, runs, and all tests pass with zero plugins; demo path untouched.**
3. **F3 — CI & dual-repo wiring** *(public + private setup)*. Public CI builds/tests core + demo + tags releases. Establish the submodule/git-dep pin and local dual-repo dev flow. **No registry / no published conformance kit** (deferred — see §5).
4. **F4 — Private repo skeleton** *(private)*. Scaffold `productmap-cloud`, consume pinned core, wire `LicenseKeyProvider` + key-signing tooling, and build **one trivial gated stub** (e.g. an analytics widget in the `nav.analytics` slot behind `entitlements.can('analytics')`) that exercises all five seams end-to-end. The private integration build *is* the conformance check.

**F5 — Marketing migration** *(independent track, runs in parallel; not a seam dependency)*. Orthogonal to F1–F4 — it relocates working, SEO-bearing, recently-polished code, so sequence it on its own to avoid coupling architecture work to migration regressions. Move `routes/Marketing.tsx`, `FeaturePage.tsx`, `components/marketing`, `components/landing` to the private repo; public `/` → minimal OSS landing; demo entry stays public.

> **F5 is bigger than a move.** Fully privatizing marketing means the private site needs `components/ui`, so `web-ui` must be **extracted into a shared package** — and with Tailwind that also means sharing Tailwind config + content globs + design tokens across repos (the classic shared-UI-extraction time-sink). Size F5 accordingly; do *not* assume it's a file relocation.

### Explicitly OUT of this item (later epics)
The three real paid features (AI copilot; external integrations + notification *delivery*; analytics); Stripe/`BillingProvider`; hosted prod infra; pricing page; billing UI; Startup/Enterprise tiers.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Seam churn** — a missing seam forces a core change later. | Design F1 against all three known paid features even though we don't build them; treat the seam set as the deliverable, not the stub. |
| **Demo / Community regressions** from seam wiring. | "Boots and tests green with zero plugins" gate in F2; demo path explicitly untouched. |
| **Migration-stream collisions.** | F2 proves core + `ee` migrators run independently against separate tracking tables. |
| **Hidden coupling** — paid code reaching into core internals over time. | Paid code imports only `@productmap/sdk` + the public package entrypoints; treat core internals as off-limits. The private integration build catches drift when a relied-on internal changes. |
| **Over-engineering** — building marketplace/runtime-plugin complexity not needed for one first-party edition. | Seams are compile-time/boot-time registration, not a runtime plugin loader. YAGNI on a marketplace until a second consumer exists. |

---

## 8. Roadmap management going forward

- The **public roadmap/backlog** continues in this repo (it's the OSS project). Each foundation sub-epic (F1–F5) is tracked here as it touches public code.
- **Paid feature epics** are tracked in the private repo, referenced from the public roadmap only as "Cloud/Team" line items without implementation detail.
- The **free/paid principle in §1 is the primary roadmap-governance artifact.** Publish it (CONTRIBUTING + a docs page) so every new feature has a pre-decided home and the boundary isn't re-litigated per feature. It also gives a clean answer when an external contributor PRs a feature that belongs in the paid edition: the principle decides it, not an awkward case-by-case decline.
- The **"nothing already free becomes paid" rule is load-bearing** — it is what prevents accidental clawbacks (the exact trap notifications nearly fell into).
- The **seam set (`@productmap/sdk`) is the integration boundary** between the two roadmaps: a public change that alters a seam is flagged, and we move the private repo's pin deliberately. Since we own both repos, coordination is a pin bump, not a registry negotiation.
- Keep it simple: no registry, no second consumer, no marketplace, no runtime plugin host until a concrete external need exists.
