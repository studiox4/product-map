# Phase 2 — Multiple Projects + Per-Project Membership — Design

**Date:** 2026-06-16
**Status:** Approved design (post-advisor). Next: writing-plans (staged 2a → 2b → 2c).
**Parent:** `2026-06-16-open-source-roadmap-design.md` (Phase 2).
**Depends on:** Phase 1 auth (merged). Phase 0 OSS foundation (merged) — note the `products`→`projects` rename was NOT done in Phase 0; it happens here in 2a.

---

## 1. Goal

Turn the single-project install into a multi-project workspace where users access only the projects they belong to, with per-project roles, while an instance admin retains super-admin oversight. The defining success criterion is **true project isolation**: no user, through any path or request body, can read or mutate data in a project they don't belong to.

## 2. Current state (verified — see `tenancy-scoping-reality` memory)

- Only `features` carries `productId`. **Globally-scoped today (no path to a project):** `ideas`, `releases`, `objectives`, `plans`, `templates`, `share_tokens`. Orphan-prone: `documents` (release-notes docs have no `featureId`/`ideaId`), `decisions` (nullable `featureId`).
- FK web between domain tables (the cross-project leak surface): `features.releaseId`, `features.objectiveId`, `featureDependencies(blockerId, blockedId)`, `planEntries.featureId`, `documents.featureId/ideaId`, `ideas.promotedFeatureId`, `releases.notesDocId`, `decisions.sourceCommentId`, `comments.featureId/documentId`, `votes.featureId`, `evidence.featureId`.
- Phase 1: instance role `admin | member`; `requireAuth` (claim-backed, no per-request DB read); `requireAdmin`; routes flat (`/api/features`, etc.); seed creates one product + several users (all `corbanb@gmail.com`-style local users).

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Instance admin scope | **Super-admin** — implicit owner on ALL projects. |
| Templates | **Workspace-global** — NOT project-scoped. |
| Invites | **Link-based always + email when SMTP configured**; owner/admin can also add existing users directly. |
| Upgrade migration | Backfill: **all current users = members of the existing project; instance admin = owner**. |
| Request scoping | **URL-nested**: project-scoped resources under `/api/projects/:projectId/...`. |
| Roles | `owner | editor | viewer` (viewer strictly read-only in v1). |
| Project unit rename | `products` → `projects` (done in 2a). |

## 4. Same-project integrity model (the load-bearing primitive)

Membership on `:projectId` is **necessary but not sufficient**. Two additional classes must be closed or projects are not actually isolated:

**(a) Nested-resource IDOR.** `requireMembership(:projectId)` says nothing about whether a path id (`/projects/:pid/features/:featureId`) actually lives in `:pid`. A member of A could pass A's `:pid` and B's `:featureId`.

**(b) Cross-project FK references in bodies.** A mutation body can reference another project's id: `PUT /projects/A/releases/:id/features {featureIds:[<B feature>]}`, `PATCH .../features/:id {objectiveId:<B objective>}`, dependency edges, plan entries, `documents.featureId`, `ideas.promotedFeatureId`. These pass membership and silently splice B's data into A.

**Primitive (first-class deliverable):**
```
loadScoped(table, id, projectId) -> row | throws 404
// returns the row only if row.projectId === projectId (super-admin still bound to the
// project in the URL; super-admin ≠ cross-project mixing). Used for EVERY path id
// AND every body-supplied entity id before it is persisted.
```
- Apply `loadScoped` to every nested path id and every body-referenced id (release members, feature objective/release, dependency blocker/blocked, plan entries, doc feature/idea, promoted feature, decision source-comment).
- **DB hardening where feasible:** composite uniqueness / `CHECK` or composite foreign keys keyed on `(id, projectId)` so a cross-project reference fails at write time even if a handler forgets. Where a true composite FK is impractical, `loadScoped` + a test is the guarantee.
- This primitive + its tests are a named deliverable of 2b, not an afterthought.

## 5. Data model

- **Rename** `products`→`projects`; `*.product_id`→`project_id`; update shared types, seed, all refs.
- **`memberships`**: `{ userId FK→users cascade, projectId FK→projects cascade, role memberRole, createdAt }`, PK `(userId, projectId)`. enum `member_role = owner | editor | viewer`.
- **Add `projectId`** (FK→projects, `on delete cascade`) to: `ideas`, `releases`, `objectives`, `plans`, `share_tokens`, `documents`, `decisions`. (`features` already scoped via the rename.) **`templates` stays global.**
- **Backfill (2a):** every existing row in those tables → the single existing project; then `NOT NULL`. `memberships`: insert (every existing user, existing project, role) with the instance admin as `owner`, others `editor` (members keep edit ability they effectively had).
- **Indexes:** `(projectId)` on each scoped table; `(projectId, ...)` composite where queries filter+sort.

## 6. Roles (capability matrix)

| Capability | viewer | editor | owner | super-admin |
|---|---|---|---|---|
| Read project content | ✓ | ✓ | ✓ | ✓ (any project) |
| CRUD content (features/docs/ideas/releases/objectives/plans/comments/votes/evidence/decisions/deps) | — | ✓ | ✓ | ✓ |
| Manage members (invite/remove/role) | — | — | ✓ | ✓ |
| Rename / delete project, transfer ownership | — | — | ✓ | ✓ |

- **viewer** is strictly read-only in v1 (no vote/comment) — revisit later.
- **Last-owner guard:** cannot remove or demote the final `owner` of a project; super-admin is the recovery path.

## 7. Routing (URL-nested) + middleware

- **Project-scoped** under `/api/projects/:projectId/...`: `features`, `ideas`, `releases`, `objectives`, `plans`, `documents`, `decisions`, `evidence`, `comments`, `activity`, `overview`, `copilot`, `share`.
- **Top-level:** `/api/auth/*`, `/api/admin/*`, `/api/users`, `/api/templates` (global), `/api/uploads`, and project management (§8).
- **`requireMembership(minRole)`** middleware on `/api/projects/:projectId/*`: resolves `:projectId`; allows if the user is a member with `role >= minRole` OR super-admin; else **404** (not 403 — don't leak project existence). Attaches `currentProjectId` + effective role. Writes require `editor`; member-management requires `owner`.
- **Hot-path note (deliberate):** project-scoped routes now do a membership lookup per request — a conscious change from Phase 1's zero-DB-read auth. `requireAuth` stays claim-only; `requireMembership` adds one indexed lookup. Accepted.

## 8. Project management + invites API

- `GET /api/projects` — projects the user is a member of (super-admin: all).
- `POST /api/projects` — create; creator becomes `owner`.
- `GET /api/projects/:id` · `PATCH` (rename) · `DELETE` — owner/super-admin.
- `GET /api/projects/:id/members` · `POST` (add existing user + role) · `PATCH /members/:userId` (role) · `DELETE /members/:userId` — owner/super-admin; enforce last-owner guard.
- **Invites:** `POST /api/projects/:id/invites` `{ role, email? }` → role-embedded token. `GET /api/invites/:token` (preview project + role). `POST /api/invites/:token/accept` (authenticated user joins). `DELETE /api/projects/:id/invites/:token` (revoke).
  - **Invite security:** token random + unguessable; **expiry** (default 7 days, configurable); **revocable**; when created with `email`, the invite is **email-bound** (only that email may accept) and sent via SMTP if configured; links without email are role-bearing and expirable — document the exposure and default expiry.

## 9. Uploads (scope decision)

Uploads stay **global, public-by-unguessable-path** in v1 (as in Phase 1). Cross-project upload isolation is **out of scope** for Phase 2; documented as a known limitation and a future hardening item.

## 10. Web

- **Project switcher** in nav (memberships; super-admin sees all). Active project id threads into all data hooks → `/api/projects/:pid/...`.
- **First-run:** "create your first project" when the user has no memberships.
- **Accept-invite page** `/invite/:token`.
- **Project settings:** rename, members (add/role/remove), invites (link + email when available), delete (owner/super-admin only).
- **Role-aware UI:** viewers see read-only (mutations hidden/disabled); reflect server authz, don't replace it.

## 11. Migration (safe + reversible)

- **Idempotent.** Add `projectId` **nullable** → backfill to the existing project → set `NOT NULL` only after backfill. Same staged add for `memberships`.
- Backfill verified: all existing users present as members; instance admin = owner; row counts per scoped table match pre-migration.
- Tested against a single-product seed fixture. **Rollback documented** (down-migration drops the added columns/table; data loss limited to membership rows).
- The rename runs as its own behavior-neutral step within 2a.

## 12. Build sequence — three shippable stages (each leaves suite + build green, app usable)

- **2a — Data migration (additive, no behavior change).** Rename; add `projectId` columns + `memberships`; backfill; `NOT NULL`; `loadScoped` helper skeleton. **Must merge without touching route paths.** Suite green.
- **2b — Authorization + scoping.** URL-nested routes; `requireMembership`; project CRUD + members; `loadScoped` applied to every path + body id; super-admin; last-owner guard. Split by route group if the diff is large — do not ship one 3000-line PR.
- **2c — Invites + web.** Invite link/email API; switcher, settings, role-aware UI, accept-invite page, first-run.

## 13. Strong goals (definition of done — each testable)

1. **Zero cross-project access, proven by tests:** (a) role × action matrix per project; (b) member-of-A gets **404** on B's resources via path id; (c) member-of-A gets **404/422** when a request **body** references a B-owned id. (c) is the commonly-missed case.
2. **Same-project invariant enforced, not hoped:** DB `CHECK`/composite key where feasible + `loadScoped` everywhere else + a write-time-rejection test for a cross-project reference.
3. **Migration safe + reversible:** idempotent, nullable→backfill→NOT NULL, membership backfill verified, tested on a single-product fixture, rollback documented.
4. **Green between stages:** 2a/2b/2c each leave full suite + build green and the app usable; 2a is purely additive.
5. **No Phase-1 regressions:** auth, output scrubbing, no-enumeration, and the public share read all still pass; share read now resolves token→project and a test proves a token never returns another project's data.
6. **Per-stage DoD written into the plan** so it can't drift.

## 14. Testing

- Authorization matrix: role × action × resource, per project, incl. super-admin override.
- Cross-project isolation: path-id IDOR (404), body-reference rejection (404/422), `loadScoped` unit tests.
- Migration: backfill correctness on a single-product fixture; `NOT NULL` only after backfill; idempotency.
- Invites: create → accept → membership; expiry; revoke; email-binding; wrong-email rejection.
- Last-owner guard: demote/remove final owner rejected.
- Phase-1 regression: full existing suite re-scoped + share-token-project-isolation test.

## 15. Risks

- Largest diff to date (every project-scoped route path + web client + tests). Mitigate via 2a-additive-first and splitting 2b by route group.
- Migration correctness on real data; mitigated by staged nullable→backfill→NOT NULL + fixture tests.
- Share token now project-scoped — public read path must resolve token→project and leak nothing else.
- Active-project threading through the web client.

## 15b. Phase 2b must-fix carryovers (surfaced by the 2a final review)

These are harmless under a single project but **will silently resolve the wrong project once multiple exist** — 2b must replace them when wiring real project scoping:

- **Remove `apps/api/src/lib/project.ts` (`getDefaultProjectId`)** — replace every caller with the URL-derived project from `requireMembership`.
- **`apps/api/src/routes/features.ts` (~:86) and `routes/ideas.ts` (~:327)** select a project via `projects … limit(1)` with **no `ORDER BY`** — unify on the real scoping resolver (the `:projectId` from the route).
- **`apps/api/src/routes/share.ts` (`GET /:token/data`, ~:41)** ignores `tokenRow.projectId` and reads `projects … limit(1)` — must read the **token's own `projectId`** so a share link returns only its project's data (ties to strong-goal §13.5).

## 16. Open questions (resolve in planning)

- Composite-FK vs `CHECK` vs helper-only per cross-reference (decide per table in 2b; default helper + index, add DB constraint where cheap).
- Invite token lifetime default (proposed 7 days) + whether links are single-use or multi-use-until-expiry (proposed multi-use + revocable; email-bound when email supplied).
- Project deletion semantics: hard delete (cascade) vs soft archive (proposed hard delete via cascade in v1; archive later).
