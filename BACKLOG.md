# ProductMap Backlog

Demo shipped (see `docs/superpowers/specs/2026-06-09-product-map-demo-design.md`). This is the v2+ queue, ordered roughly by dependency and value. The seed data mirrors the top of this list on the in-app roadmap (Later column) — the app dogfoods its own future.

## Must — committed next (added 2026-06-23)

The three epics below are the committed priorities. Auth + multi-project core already shipped (see E1), so this is now finishers + two new surfaces. Build order: **E3 Dashboard first** (fixes the multi-project discoverability pain + anchors next-actions), then **E1 gaps** and **E2 notifications** (E3 surfaces both). E2 is the only **L**; E1 ≈ **M**, E3 ≈ **M**.

### E1 — Multi-project: gaps + discoverability

**Core is already SHIPPED** (migrations 0010–0012, `routes/projects.ts`, `ProjectSwitcher.tsx`, `settings/ProjectTab.tsx`): `projects` table, full project-scoping FK on 8 tables + membership-gated routes, roles owner/editor/viewer, email invites (create/revoke/accept API + TTL), public roadmap share tokens (mint/revoke/read), switcher dropdown + settings UI. The problem is users **can't find it** and a few finishers are missing.

Remaining work:

- **Discoverability (the real pain)** — switcher is buried; surface project context + switching prominently. Mostly solved by **E3 Dashboard** (home that shows all your projects). Cross-link the two.
- **Favorite / pin** — add `favorite` (schema + `/favorite` route + switcher UI); pin to top.
- **Archive** — soft-delete: add `archivedAt` (hidden, restorable, read-only); today delete is **hard-delete only** — add trash + restore window.
- **Public share polish** — currently `kind: 'roadmap'` only, all-or-nothing, manual-revoke. Add: selective section visibility (docs/board/roadmap), `noindex`, optional time-bound expiry. (Folds **D8 Broadcast** link.)
- **Invite accept UI** — accept API exists, no frontend component.
- **Activity scoping** — `activity` is feature-scoped, not project-scoped; add `projectId` so E3 cross-project feed works.
- Stretch: 4th `admin` role, ownership transfer, duplicate-project. (Defer — owner/editor/viewer covers most.)

### E2 — Notifications

A notifications panel plus multi-channel delivery and per-user/admin settings.

- **Event model** — `notifications` per user with read/unread + mark-all-read; bell badge + toast (in-app).
- **Event types** — comments to me, **@mentions**, new docs on followed projects, status changes, assigned-to-you, project invite, comment resolved, release published.
- **Channels** — in-app, **email digest**, **Slack**, **MS Teams**; per-user **channel × event-type preference matrix**.
- **Digest** — cadence (instant / daily / weekly), quiet hours, timezone.
- **Email infra** — SES (matches v2.5 AWS deploy), templates, unsubscribe, bounce handling.
- **Integrations** — Slack OAuth app (DM + channel routing); Teams connector/webhook; **admin** workspace-level integration config + secrets + enable/disable.
- **Anti-spam** — batching / grouping; generic outbound webhooks for extensibility.

### E3 — Dashboard

A personal home: what to do next and status across the projects you care about.

- **Next actions** — derived from notifications (awaiting your review, @mentions, open comments on you).
- **Follow ≠ favorite** — *follow* = subscribe to a project's notifications; *favorite* = pin for quick access.
- **My work** — items assigned to me, awaiting my review, my open comment threads.
- **Project status** — rollup across followed/favorited projects: features by status, upcoming releases, stale / blocked / overdue items.
- **Glue** — cross-project activity feed, recent-projects jump-back-in, global search entry (#13), quick-create, empty/onboarding states.

### E4 — Marketing: multi-project feature section

Multi-project is shipped but under-sold externally. Add a homepage section (and/or `Roadmap.tsx` marketing route) showing it in detail: many projects, roles/invites, public share links. Use real screenshots (switcher, members, share). **S** — content/design, no backend. Pairs with E1 discoverability so in-app matches the pitch.

### E5 — Public idea intake form (per project, unauthenticated)

A per-project public form where **anyone — no login** — can submit an idea, landing in that project's idea inbox for triage. Turns the roadmap into a two-way channel with customers/teammates without giving them accounts. Builds on the E1 public share-token machinery (extend it with an `intake` token kind alongside `roadmap`).

- **Public form** — per-project shareable URL (e.g. `/p/<token>/submit`); mint/revoke an `intake` share token from project settings. Renders a bare, unauthenticated page (no app shell): title, description, optional submitter name/email, project-configurable extra fields.
- **Unauthenticated submit** — `POST` (no session) creates an idea in the **target project's** inbox as `new`/untriaged, tagged source=`public`, with submitter contact stored if given. Scope strictly to the token's project — never trust a project id from the client.
- **Abuse protection (required for an open endpoint)** — per-IP + per-token rate limiting, honeypot field, optional CAPTCHA/Turnstile, `noindex`, and an optional moderation queue (hold public submissions for owner/editor approval before they hit the inbox).
- **Triage** — submissions appear in the existing idea inbox; owner/editor promotes to a feature or dismisses. Optional: email the submitter on status change if they left contact.
- **Config** — per-project toggle (off by default), custom intro copy, required/optional fields, moderation on/off.

Depends on E1 (share tokens, project scoping) and the AI-copilot idea inbox. **M** — one new token kind + one public route + a small public page + spam hardening. Pairs with E2 (notify owners of new public submissions).

---

## v2 — Team-ready

| # | Feature | What it is | Approach / why it's quick | Effort |
|---|---------|------------|---------------------------|--------|
| 1 | Users & auth | Accounts, sessions, who-did-what | Add `users` table + session middleware in Hono (e.g. lucia or hand-rolled cookie sessions). Schema already FK-ready. Single-tenant, invite-only — no signup flow needed. | M |
| 2 | ~~Comments & review~~ | **SHIPPED 2026-06-10** — threaded doc+feature comments, resolve flow, attention integration | spec: `docs/superpowers/specs/2026-06-10-comments-voting-design.md` | ✓ |
| 3 | ~~Up/down voting~~ | **SHIPPED 2026-06-10** — 🚀 Boost / 🧊 Cool, score sort on board | same spec | ✓ |
| 4 | Realtime collaboration | Multi-user live editing, Notion/Figma style | Tiptap → Yjs binding (`@tiptap/extension-collaboration`); Hono websocket server in `apps/api` (or sidecar `apps/sync`), y-postgres persistence. Replaces last-write-wins autosave — this is why contentJson is already the source of truth. | L |
| 5 | Presence cursors | See teammates' cursors and selections live | Falls out of Yjs awareness protocol once #4 lands. | S (after #4) |

## v2.5 — Production deploy

| # | Feature | Approach | Effort |
|---|---------|----------|--------|
| 6 | S3 uploads | Swap local `uploads/` write for S3 PUT; `path` column already abstract. Serve via CloudFront or presigned URLs (also fixes uploads living on one container). | S |
| 7 | ECS + RDS deploy | Dockerfile (api serves built web assets — already designed for single container), task def, RDS Postgres, migrations on deploy. | M |
| 8 | Workspace export to git | Cron or button: `export.zip` content pushed to a git repo as `.md` tree — the security-friendly escape hatch. | S |

## v3 — Depth

| # | Feature | Approach | Effort |
|---|---------|----------|--------|
| 9 | More doc templates | RFC, ADR, release notes, user-research summary, retro, OKR sheet — pure data additions to `packages/templates`, zero schema work. | S |
| 10 | AI assist suite | Inline rewrite/summarize selection, feasibility-question generator, doc review pass. Reuses the SSE pipeline from generate-doc. | M |
| 11 | Doc wiki-links & backlinks | `[[doc]]` mentions via Tiptap suggestion (same machinery as slash menu); backlink index queryable from contentJson. | M |
| 12 | Gantt dependencies & milestones | `feature_dependencies` table; arrow rendering in the existing SVG layer; milestone = zero-length bar. | M |
| 13 | Search | Postgres full-text over `content_md` (it's maintained on every save precisely for this). | S |
| 14 | ~~Multi-product workspaces~~ | **Absorbed into E1 — Multi-project (Must section).** | → E1 |

Effort: S ≈ a day, M ≈ 2–4 days, L ≈ 1–2 weeks (single dev + agents).

## Dream tier (ideated 2026-06-12 — not yet committed)

| # | Idea | One-liner | Builds on | Effort |
|---|------|-----------|-----------|--------|
| D1 | Idea Inbox | Raw-idea intake queue → triage → vote → promote to feature w/ AI brief | votes, templates, AI gen | M |
| D2 | Evidence layer | Customer quotes/research/ticket counts attached to features — the "why" with receipts | feature hub | M |
| D3 | Decision log | First-class decisions; AI suggests extraction from comment threads; decision replay | comments, activity, Bedrock | M |
| D4 | Dependencies & risk | Feature dependency edges, Gantt arrows, blocked-by badges, critical path, risk notes | gantt svg | M |
| D5 | AI PM copilot | PRD rubric grading, cross-doc contradiction detection, split suggestions, stale nudges, workspace-grounded chat (RAG over content_md) | Bedrock + AI SDK tool calling | L |
| D6 | Capacity honesty | S/M/L sizing + capacity line on Gantt + overcommit warnings | gantt, features | S/M |
| D7 | Releases & changelog | Milestones grouping shipped features; auto-assembled release notes; changelog page | templates, statuses | M |
| D8 | Broadcast | Read-only shareable roadmap link (→ folded into E1 public sharing) + "what changed" markdown email/export (→ E2 digest) | digest, export | → E1/E2 |
| D9 | Outcomes (OKR-lite) | Objectives w/ target metrics; features ladder up; outcome-grouped views | features | M |

Recommended first three: D1 (completes the funnel), D3 (unique — nobody has it), D5 review-mode slice (scribe → colleague).
