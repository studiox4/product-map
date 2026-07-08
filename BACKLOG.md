# ProductMap Backlog

Demo shipped (see `docs/superpowers/specs/2026-06-09-product-map-demo-design.md`). This is the v2+ queue, ordered roughly by dependency and value. The seed data mirrors the top of this list on the in-app roadmap (Later column) — the app dogfoods its own future.

## Must — committed next (added 2026-06-23, closed out 2026-07-08)

E1/E3/E4/E5 all **SHIPPED** — verified against code on main (post-#31, commit 58fe696):

- **E1 — Multi-project: gaps + discoverability** — SHIPPED. Favorite/pin (`project_favorites`, `routes/projects.ts:88`), archive (`archivedAt`), share-token polish (selective `sections` + `expiresAt`, `schema.ts:346-353`), invite accept UI (`AcceptInvite.tsx`), activity `projectId` scoping (`schema.ts:140-145`, migration 0015) — all live. Remaining stretch (4th `admin` role, ownership transfer, duplicate-project) stays deferred.
- **E3 — Dashboard** — SHIPPED. `/app` route wired, `dashboard.ts` implements favorites∪memberships rollup.
- **E4 — Marketing: multi-project feature section** — SHIPPED (#26) — "Built for teams" section.
- **E5 — Public idea intake form** — SHIPPED (#24) — `intake.ts` route, `IntakePage.tsx`, moderation queue.

E2 — Notifications moved to backlog below (channel delivery on hold, see v2 table).

---

## v2 — Team-ready

| # | Feature | What it is | Approach / why it's quick | Effort |
|---|---------|------------|---------------------------|--------|
| 1 | Users & auth | Accounts, sessions, who-did-what | Add `users` table + session middleware in Hono (e.g. lucia or hand-rolled cookie sessions). Schema already FK-ready. Single-tenant, invite-only — no signup flow needed. | M |
| 2 | ~~Comments & review~~ | **SHIPPED 2026-06-10** — threaded doc+feature comments, resolve flow, attention integration | spec: `docs/superpowers/specs/2026-06-10-comments-voting-design.md` | ✓ |
| 3 | ~~Up/down voting~~ | **SHIPPED 2026-06-10** — 🚀 Boost / 🧊 Cool, score sort on board | same spec | ✓ |
| 4 | Realtime collaboration | Multi-user live editing, Notion/Figma style | Tiptap → Yjs binding (`@tiptap/extension-collaboration`); Hono websocket server in `apps/api` (or sidecar `apps/sync`), y-postgres persistence. Replaces last-write-wins autosave — this is why contentJson is already the source of truth. | L |
| 5 | Presence cursors | See teammates' cursors and selections live | Falls out of Yjs awareness protocol once #4 lands. | S (after #4) |
| 6 | Notifications: channel delivery (E2) | In-app core already SHIPPED (#21, #25) — event model, types, bell/dashboard, dedupe. **On hold**: email digest, Slack, MS Teams delivery + per-user channel×event preference matrix, digest cadence/quiet-hours, SES infra, Slack OAuth app, admin integration config, anti-spam batching. | L, blocked on SES/Slack-OAuth infra |

## v2.5 — Production deploy

| # | Feature | Approach | Effort |
|---|---------|----------|--------|
| 6 | S3 uploads | Swap local `uploads/` write for S3 PUT; `path` column already abstract. Serve via CloudFront or presigned URLs (also fixes uploads living on one container). | S |
| 7 | ECS + RDS deploy | Dockerfile (api serves built web assets — already designed for single container), task def, RDS Postgres, migrations on deploy. | M |
| 8 | Workspace export to git | Cron or button: `export.zip` content pushed to a git repo as `.md` tree — the security-friendly escape hatch. | S |
| 9 | Railway one-click deploy + template listing | `railway.json` already exists (demo deploy). Harden for template use: `template.yaml`/Railway template config, env var docs + sane defaults (DATABASE_URL auto-provision, secrets), README deploy button, submit to Railway template gallery for discoverability. | S |

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
