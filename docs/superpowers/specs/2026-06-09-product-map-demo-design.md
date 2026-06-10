# ProductMap — Single-User Demo Design

**Date:** 2026-06-09
**Status:** Approved design, pre-implementation
**Scope:** Local, single-user demo of a self-hosted product management tool. Goal: win team buy-in to replace Jira/Notion (blocked by security constraints).

## What the demo proves

The core loop: write a feature doc from a template → place the feature on the roadmap → see it reflected on the landing page, the now-next-later board, and the Gantt — all backed by the same data.

Out of scope for the demo (parked for v2, schema leaves room): comments, upvotes/downvotes, users/auth, realtime collaboration (Yjs/websockets), presence, S3 uploads, ECS deployment.

## Stack

- TypeScript monorepo, pnpm workspaces, TS project references
- API: Hono (Node) + Drizzle ORM + node-postgres
- DB: local Postgres via desktop Postgres.app (`DATABASE_URL=postgres://localhost:5432/productmap`); RDS Postgres later — same dialect, no migration rework
- Web: Vite + React 18 + Tailwind + Shadcn + TanStack Query + React Router + @dnd-kit
- Editor: Tiptap (ProseMirror) — clean upgrade path to Yjs CRDT collab in v2
- AI: Anthropic SDK, server-side only

## Repo layout

```
product-map/
├── apps/
│   ├── api/          # Hono server, REST routes, AI endpoint
│   └── web/          # Vite + React app
├── packages/
│   ├── db/           # Drizzle schema, migrations, client factory, seed
│   ├── shared/       # zod schemas, types, constants (horizons, doc types)
│   └── templates/    # doc templates: markdown skeleton + metadata + promptHints
├── docs/
├── pnpm-workspace.yaml
└── package.json
```

- `apps/api` exports `AppType`; web consumes it via `hono/client` for end-to-end type safety (no codegen).
- Dev: `pnpm dev` runs both (concurrently); Vite :5173 proxies `/api` → Hono :3000.
- Prod (later): api serves web's built assets — single ECS container.
- `packages/db` is separate from api so seed scripts and future workers (websocket server) reuse the schema.
- `packages/templates`: each template is a TS object `{ type, name, description, markdownBody, promptHints }` — one source feeds both the "new doc" picker and the AI generation prompt.

## Data model

Postgres, 4 tables for the demo:

```
products    id, name, vision, about_md, created_at
features    id, product_id→, title, horizon ENUM(now|next|later),
            status ENUM(idea|planned|in_progress|shipped),
            start_date, end_date, sort_order, created_at, updated_at
documents   id, feature_id→, type ENUM(prd|brd|tech_spec|feature_brief),
            title, content_json JSONB, content_md TEXT,
            status ENUM(draft|in_review|final), created_at, updated_at
uploads     id, document_id→, filename, mime, path, created_at
```

Decisions:

- **Feature = container; docs attach to features** (many docs per feature). Roadmap views show features; click through to docs.
- **`content_json` (Tiptap JSON) is the source of truth; `content_md` derived on every save** (via `prosemirror-markdown`). "Markdown files" are an export format, not storage. Lossless editor round-trip; markdown always current for export and future search.
- **Gantt and now-next-later both derive from `features`** — no separate roadmap tables, so the views cannot drift. Drag a bar = update dates; move a card = update horizon.
- One `products` row in demo; table exists so multi-product later is data, not migration.
- Uploads go to local `uploads/` dir, path stored in DB; S3 swap later changes no schema.
- "Needs attention" panel is a query, not a table: docs in draft/in_review + features missing dates or docs. v2 `comments` joins in.
- v2 tables (not built): `comments`, `votes`, `users` — all FK cleanly to documents/features.

## API surface

All JSON, zod-validated at the boundary using schemas from `packages/shared`:

```
GET    /api/overview                    # landing payload: product, features, attention items
GET    /api/products/:id                PATCH /api/products/:id

GET    /api/features                    POST   /api/features
GET    /api/features/:id                PATCH  /api/features/:id     # horizon, dates, status, title
DELETE /api/features/:id

GET    /api/documents?featureId=        POST   /api/documents        # from template type
GET    /api/documents/:id               PATCH  /api/documents/:id    # autosave
DELETE /api/documents/:id
GET    /api/documents/:id/export.md     # markdown download
GET    /api/export.zip                  # whole workspace as .md tree

POST   /api/uploads                     # multipart, returns URL for editor embed
GET    /uploads/*                       # static serve

POST   /api/ai/generate-doc             # {docType, featureId, brief} → SSE markdown stream
```

- Autosave: editor debounces 800ms → PATCH; server derives `content_md` in the same transaction. Last-write-wins is fine single-user; CRDT replaces this layer in v2.
- AI generation: server-side Anthropic call (key in api env only, never in browser). Prompt = template `promptHints` + skeleton + user's one-line brief + feature context. SSE streams into the editor live. No key configured → 503; UI hides the button entirely.
- `GET /api/overview` is one aggregate call so the landing renders in a single round-trip.

## Frontend

React Router, 4 routes:

| Route | View |
|---|---|
| `/` | Landing — "roadmap hero" layout |
| `/board` | Now-Next-Later board |
| `/roadmap` | Full-page Gantt |
| `/docs/:id` | Document editor |

**Landing `/`** — vision header (inline-editable) → compact read-only Gantt hero (click bar → `/roadmap` scrolled to feature) → row of 4 panels: Now / Next / Later (top 3 features each, "+N more" → `/board`) + Attention panel (click-through to doc/feature).

**Board `/board`** — 3 columns of feature cards (title, status badge, doc-type chips). @dnd-kit drag between columns → PATCH horizon. Card click → side panel: feature detail, dates, docs list, "New doc from template" picker (4 templates + blank), AI entry point.

**Roadmap `/roadmap`** — custom SVG Gantt: month/week header, row per feature, bars colored by horizon, today-line. Drag bar = move dates; drag edges = resize; PATCH on drop. Dateless features sit in an "unscheduled" tray; drag in to schedule.

**Editor `/docs/:id`** — Tiptap rich block editor: headings, lists, task lists, tables, code blocks, blockquotes, images (upload), link embeds, slash-command menu. Toolbar: doc-type badge, status dropdown, "Export .md", autosave indicator. Empty doc offers "Draft with AI" → one-line brief → SSE stream fills the editor.

**Plumbing** — TanStack Query for all server state; optimistic updates on drag operations. Shadcn: Dialog, Popover, DropdownMenu, Badge, Toast. Horizon colors consistent app-wide: now=green, next=amber, later=indigo.

## Doc templates

Shipping in demo: **PRD, BRD, Tech Spec, Feature Brief** (one-pager: problem, hypothesis, success metric — the unit on now-next-later cards).

Future template candidates (roadmap, not demo): RFC, ADR, release notes, user-research summary, retro, OKR sheet.

## Error handling

- API: zod parse failures → 400 with field errors; central Hono `onError` → `{error, requestId}`; DB down → 503 with clear message.
- Web: TanStack Query retries network errors (2x); failed mutation → toast + optimistic rollback (drag snaps back). Autosave failure → persistent "unsaved changes" banner with retry — never silent data loss. Route-level error boundary.
- AI: 30s timeout / abort keeps partial text, toast offers retry. Missing key degrades to hidden feature, not a broken one.

## Testing

- Unit (Vitest): `packages/shared` schemas; Tiptap JSON ↔ markdown round-trip (riskiest pure logic — tables, task lists, nested lists).
- API (Vitest + Hono test client): real local Postgres test DB, truncated between tests. CRUD, overview aggregate, export.
- E2E (Playwright): create feature → new doc from template → rich edit → board shows it → drag to Now → drag Gantt bar → reload, dates persist → export .md. AI mocked.
- TDD during implementation. `pnpm test` green = done (CI later).

## Acceptance criteria

1. Fresh clone + Postgres.app running + `pnpm i && pnpm db:migrate && pnpm db:seed && pnpm dev` → working app in under 5 minutes.
2. Landing shows vision, live Gantt hero, now/next/later panels, and attention panel — all from seed data (seed dogfoods ProductMap's own roadmap: features 1–8 across horizons).
3. Create a feature → attach a PRD from template → edit richly (slash menu, table, image upload) → autosaves.
4. Drag a card Later→Now: board, landing, and Gantt all reflect the change.
5. Drag/resize a Gantt bar: dates persist across reload.
6. Export a single doc and the whole workspace as markdown.
7. With an Anthropic key set: "Draft with AI" streams a complete PRD from a one-line brief.
8. Without the key: app fully functional, AI affordances hidden.

## v2 roadmap (parked, design leaves room)

users/auth → comments (threaded, on docs and features) → votes (up/down on features for prioritization) → realtime collab (Yjs over websockets, replacing last-write-wins autosave) → presence cursors → S3 uploads → ECS/RDS deploy → additional templates (RFC, ADR, release notes, retro) → AI assist suite (inline rewrite, summarize, feasibility-question generator).
