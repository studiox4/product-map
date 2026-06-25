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
| Paid feature set (Team) | AI Copilot/advanced AI; Integrations + notifications; Analytics + unlimited scale. **SSO/RBAC/orgs stay FREE in core.** |
| Marketing site | **All marketing → private.** Public `/` becomes a minimal OSS landing; polished site + funnel deploys to productmap.com from the private repo. |
| Scope of this item | **Foundation only**, proven with one trivial gated stub. |

---

## 2. Repo & distribution topology

```
PUBLIC repo (productmap)               PRIVATE repo (productmap-cloud)
├ Apache-2.0                           ├ proprietary
├ apps/api      (Hono core)            ├ depends on @productmap/* via private registry
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

---

## 3. The five seams (core work, all PUBLIC)

Each seam = an interface in `@productmap/sdk` + a registry the core calls at startup/render. Paid repo implements; core ships no implementations. Seams are designed against all three known paid features even though none are built here, to minimize later seam churn.

### Seam 1 — Server plugin registry (`apps/api`)
On boot, core calls `registerPlugins(app, ctx)`. Each plugin receives the Hono `app` + a context (`db`, `auth`, `entitlements`, `jobs`) and mounts routes/middleware under a reserved prefix `/api/ee/*`. Community boot finds zero plugins → nothing mounts. The `/api/ee/*` prefix is reserved in core so core routes never collide with paid routes.

### Seam 2 — Background-jobs seam
Core has no job runner today. Add a thin `JobQueue` interface in `sdk` (`enqueue`, `registerWorker`, `schedule`) + a default in-process/cron implementation in core (used by nothing in Community). Paid integrations/notifications register workers. This prevents the paid repo from bolting on its own divergent scheduler and gives a single place to later swap in a durable queue.

### Seam 3 — Client slot registry (`apps/web`)
Core renders named slots at defined mount points, e.g. `<Slot id="copilot.panel" />`, `<Slot id="settings.integrations" />`, `<Slot id="nav.analytics" />`. The paid repo registers lazy-loaded components into slots. An empty slot renders nothing. Slot fills are code-split so the **Community bundle never carries paid JS**. Slot ids are a documented, versioned contract.

### Seam 4 — Entitlement gate (server + client)
A single API in `sdk`: `entitlements.can(feature)` and `entitlements.limit(key)`, backed by a pluggable **provider** selected at boot. Every paywall — server route guard, client slot visibility, limit enforcement — goes through this one gate. (Providers in §4.)

### Seam 5 — Migration namespacing (`packages/db`)
Core migrations stay `0000…NNNN` tracked in the existing migrations table. Paid migrations live in the private `ee/db/` directory, tracked in a **separate `ee_migrations` table** with a distinct prefix, so the two streams never collide or renumber each other. The core migrator only ever touches the core stream; the paid edition runs both (core first, then `ee`).

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

---

## 5. Build, release & dependency flow

- **Versioning:** core publishes `@productmap/{sdk,shared,db,web-ui,api-core}` on semver tags. The private repo pins exact versions and bumps deliberately. **SDK seam contracts follow semver strictly** — a breaking seam change is a major bump, signalled to the private repo.
- **Distribution:** private GitHub Packages registry (or git submodule on tags as a fallback). No publishing to public npm required.
- **Two CI pipelines:**
  - Public CI: lint/test/build core + demo + minimal landing; publish packages on tag.
  - Private CI: consume packages, run paid tests, build the cloud image, deploy.
- **Seam conformance test-kit:** core publishes a conformance suite; the private repo runs it against its provider/plugin impls so a core upgrade that breaks a seam fails *its* CI loudly, not in prod.
- **Local dual-repo dev:** the private repo can `pnpm link` / workspace-override to a local checkout of core, so both are developed together without publishing every change.

---

## 6. Decomposition (ordered sub-epics)

Each sub-epic gets its own spec → plan → build cycle.

1. **F1 — SDK + seam contracts** *(public)*. Create `@productmap/sdk`: interfaces for plugin registry, job queue, slot registry, entitlement provider, migration namespacing. Pure types + registries, no impls. Designed against all three known paid features.
2. **F2 — Wire seams into core** *(public)*. Core calls registries at boot/render; ship `CommunityProvider`; reserve `/api/ee/*`; add named `<Slot>` mount points; `JobQueue` default impl; `ee_migrations` support. **Gate: core boots, runs, and all tests pass with zero plugins; demo path untouched.**
3. **F3 — Packaging & CI** *(public)*. Publish packages on tags; ship the conformance test-kit; extract shared `web-ui` primitives if needed for the marketing move.
4. **F4 — Private repo skeleton** *(private)*. Scaffold `productmap-cloud`, consume packages, wire `LicenseKeyProvider` + key-signing tooling, and build **one trivial gated stub** (e.g. an analytics widget in the `nav.analytics` slot behind `entitlements.can('analytics')`) that exercises all five seams end-to-end.
5. **F5 — Marketing migration** *(public removal + private add)*. Move `routes/Marketing.tsx`, `FeaturePage.tsx`, `components/marketing`, `components/landing` to the private repo; public `/` → minimal OSS landing; shared `components/ui` primitives stay public and are imported. Demo entry stays public.

### Explicitly OUT of this item (later epics)
The three real paid features (AI copilot, integrations/notifications, analytics); Stripe/`BillingProvider`; hosted prod infra; pricing page; billing UI; Startup/Enterprise tiers.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Seam churn** — a missing seam forces a core change later. | Design F1 against all three known paid features even though we don't build them; treat the seam set as the deliverable, not the stub. |
| **Demo / Community regressions** from seam wiring. | "Boots and tests green with zero plugins" gate in F2; demo path explicitly untouched. |
| **Migration-stream collisions.** | F2 proves core + `ee` migrators run independently against separate tracking tables. |
| **Hidden coupling** — paid code reaching into core internals over time. | Only `@productmap/sdk` + published packages are importable from private; core internals are not published. Conformance kit catches drift. |
| **Over-engineering** — building marketplace/runtime-plugin complexity not needed for one first-party edition. | Seams are compile-time/boot-time registration, not a runtime plugin loader. YAGNI on a marketplace until a second consumer exists. |

---

## 8. Roadmap management going forward

- The **public roadmap/backlog** continues in this repo (it's the OSS project). Each foundation sub-epic (F1–F5) is tracked here as it touches public code.
- **Paid feature epics** are tracked in the private repo, referenced from the public roadmap only as "Cloud/Team" line items without implementation detail.
- The **seam contract (`@productmap/sdk`) is the integration boundary** and the unit of coordination between the two roadmaps: public changes that affect a seam are flagged as such and versioned; the private roadmap consumes seam versions.
- Keep it simple: no second consumer, no marketplace, no runtime plugin host until a concrete need exists.
