# ProductMap Backlog

Demo shipped (see `docs/superpowers/specs/2026-06-09-product-map-demo-design.md`). This is the v2+ queue, ordered roughly by dependency and value. The seed data mirrors the top of this list on the in-app roadmap (Later column) — the app dogfoods its own future.

## v2 — Team-ready

| # | Feature | What it is | Approach / why it's quick | Effort |
|---|---------|------------|---------------------------|--------|
| 1 | Users & auth | Accounts, sessions, who-did-what | Add `users` table + session middleware in Hono (e.g. lucia or hand-rolled cookie sessions). Schema already FK-ready. Single-tenant, invite-only — no signup flow needed. | M |
| 2 | Comments & review | Threaded comments on docs and features; "needs attention" gets real | `comments` table (FK to document/feature + author + parent_id). Attention panel query already structured to join new sources. Tiptap supports inline comment marks later; start with doc-level threads. | M |
| 3 | Up/down voting | Vote on features to drive prioritization | `votes` table (user_id + feature_id + direction, unique pair). Sort board columns by score. Tiny API + UI surface. | S |
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
| 14 | Multi-product workspaces | `products` table already plural; add product switcher + scope queries. | M |

Effort: S ≈ a day, M ≈ 2–4 days, L ≈ 1–2 weeks (single dev + agents).
