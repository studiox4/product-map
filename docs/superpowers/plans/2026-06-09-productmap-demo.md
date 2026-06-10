# ProductMap Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is designed for parallel execution: tasks within a phase are independent once the prior phase's interfaces exist.

**Goal:** Working single-user local demo of ProductMap: markdown/doc editor with templates, now-next-later board, draggable Gantt, landing dashboard, AI doc generation — per spec `docs/superpowers/specs/2026-06-09-product-map-demo-design.md`.

**Architecture:** pnpm monorepo. `apps/api` (Hono + Drizzle + node-postgres) exposes typed REST + SSE; `apps/web` (Vite + React + Tailwind + Shadcn + TanStack Query) consumes it via `hono/client`. Postgres runs in local Postgres.app. Tiptap JSON is the document source of truth; markdown derived server-side on save.

**Tech Stack:** TypeScript 5, pnpm, Hono 4, Drizzle ORM + drizzle-kit, node-postgres (pg), zod 3, Vite 5, React 18, React Router 6, TanStack Query 5, Tailwind 3, shadcn/ui, @dnd-kit/core, Tiptap 2, prosemirror-markdown, marked, date-fns, @anthropic-ai/sdk, Vitest, Playwright.

---

## Execution phases (dependency graph)

```
Phase 0  Scaffold (sequential, blocks everything)
Phase 1  Foundations (parallel): shared | db | templates | markdown-lib
Phase 2  API (parallel after 1):  features/products routes | documents/uploads/export | overview/AI
Phase 3  Web (parallel after 2):  shell+landing | board | gantt | editor+AI-UI
Phase 4  E2E + acceptance loop (sequential)
```

Phase 1 tasks share NO files. Phase 2 tasks each own distinct route files; `apps/api/src/app.ts` merges them (defined in Phase 0 with route mount stubs so no merge conflicts). Phase 3 tasks each own distinct route components; shell defined first in the same task batch provides layout slots.

---

## UX Guidelines (binding for all Phase 3 work)

**Layout & rhythm**
- Max content width 1280px, centered; pages pad `px-6 py-8`.
- Spacing scale: only Tailwind 1/2/3/4/6/8/12/16. No arbitrary pixel values except Gantt geometry.
- Cards: `rounded-lg border bg-card shadow-sm`. No double borders; no shadow+border heavier than `shadow-sm` except open dialogs/popovers.

**Color & meaning**
- Horizon colors are semantic and app-wide consistent: now=`green-600`, next=`amber-500`, later=`indigo-500` (bars, badges, column headers, Gantt). Defined once as `HORIZON_COLORS` in `packages/shared`, consumed everywhere — never restated inline.
- Status badges: idea=slate, planned=blue, in_progress=amber, shipped=green. Doc status: draft=slate outline, in_review=amber, final=green.
- Neutral UI: Shadcn default slate theme, light mode only for demo.

**Interaction states — every interactive element MUST have**
- Visible hover (`hover:bg-accent` or opacity shift), focus ring (`focus-visible:ring-2`), disabled style, and cursor change.
- Drag affordances: draggables get `cursor-grab`/`active:cursor-grabbing`; while dragging, source gets `opacity-50`, valid drop targets get a visible highlight ring.
- All mutations optimistic; on failure: revert + destructive toast naming the thing that failed ("Couldn't move 'Auth v2' — restored").

**Feedback & state coverage — every view MUST handle**
- Loading: skeleton blocks matching final layout (no spinners-only pages).
- Empty: friendly empty state with a primary action (e.g. board column: "Nothing here yet — + Add feature").
- Error: inline error card with retry button (route-level error boundary as backstop).
- Saving: editor shows "Saving…" → "Saved" indicator (right of toolbar); on failure a persistent amber "Unsaved changes — retrying" banner. Never silent data loss.

**Editor feel**
- Placeholder text in empty docs: "Type '/' for commands…".
- Slash menu opens within 16ms of `/`, filters as you type, arrow-key navigable, Enter inserts, Esc closes.
- Typing latency must stay <16ms/frame: document updates debounced 800ms before PATCH; never re-render whole editor on save state change.

**Motion**
- Transitions ≤150ms ease-out, on transform/opacity/colors only. Drag uses @dnd-kit transforms (no layout thrash). No bounce/spring effects.

**Keyboard**
- Dialogs/popovers: Esc closes, focus trapped, focus returns to trigger. Board card: Enter opens detail panel. Editor: Cmd+B/I, Cmd+Z work (Tiptap defaults preserved).

**Copy tone**
- Sentence case everywhere. Buttons are verbs ("Add feature", "Export markdown", "Draft with AI"). No lorem ipsum anywhere — seed data is ProductMap's own roadmap.

---

## Acceptance Criteria (the loop exits when ALL pass)

Functional (verified by Playwright CLI against the running app):
- **AC1 Setup:** `pnpm i && pnpm db:migrate && pnpm db:seed && pnpm dev` from fresh clone (Postgres.app running, db `productmap` exists) yields working app at http://localhost:5173 with zero console errors on `/`.
- **AC2 Landing:** `/` shows: editable vision header; compact Gantt hero rendering ≥6 seeded feature bars colored by horizon with today-line; Now/Next/Later panels each listing seeded features (top 3 + "+N more" link); Attention panel listing ≥1 draft doc and ≥1 dateless feature, each item navigating on click.
- **AC3 Create flow:** From `/board`: create feature "Demo Feature X" in Later → card appears without reload → open card → create PRD from template → editor opens pre-filled with PRD skeleton (headings present) → type text, insert a table and a task list via slash menu → "Saved" indicator appears → reload → content persists.
- **AC4 Board↔everything sync:** Drag "Demo Feature X" Later→Now on `/board` → lands in Now column; `/` Now panel includes it; `/roadmap` bar (after scheduling) is green.
- **AC5 Gantt:** `/roadmap` renders bars for all dated features + unscheduled tray for dateless ones. Drag a bar right by ~1 month → toast confirms, reload → dates persisted. Resize via right edge → end_date changes persist. Drag feature from tray onto timeline → it gains dates.
- **AC6 Export:** Editor "Export .md" downloads markdown containing the doc's headings; `GET /api/export.zip` returns a zip with one folder per feature containing its docs as `.md`.
- **AC7 Images:** Paste/upload an image in editor → renders inline → persists across reload (served from `/uploads/`).
- **AC8 AI present:** With `ANTHROPIC_API_KEY` set: empty doc shows "Draft with AI"; brief → content streams into editor visibly progressively, ends with structured doc. (E2E test mocks the SSE endpoint; live key tested manually once.)
- **AC9 AI absent:** Without key: no AI affordances visible anywhere; everything else fully works.
- **AC10 Tests green:** `pnpm test` (all unit+integration) and `pnpm e2e` (Playwright) pass.

UX (verified by Playwright assertions + screenshot review):
- **AC-UX1:** Every route shows skeletons while loading (throttled-network check) — no blank white flashes.
- **AC-UX2:** Board drag shows grab cursor, drop highlight, and card moves optimistically (<100ms perceived).
- **AC-UX3:** Empty board column shows empty state with "Add feature" action.
- **AC-UX4:** Killing the API mid-edit produces the amber unsaved-changes banner; restoring API clears it and saves (manual/scripted check).
- **AC-UX5:** All horizon color usage matches `HORIZON_COLORS` (spot-check board headers, badges, Gantt bars in screenshots).
- **AC-UX6:** Keyboard: Esc closes the new-doc dialog; slash menu navigable by arrows+Enter.

---

## Locked interfaces (Phase 1 deliverables — later phases import, never redefine)

### `packages/shared/src/constants.ts`
```ts
export const HORIZONS = ['now', 'next', 'later'] as const;
export type Horizon = (typeof HORIZONS)[number];
export const FEATURE_STATUSES = ['idea', 'planned', 'in_progress', 'shipped'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export const DOC_TYPES = ['prd', 'brd', 'tech_spec', 'feature_brief'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_STATUSES = ['draft', 'in_review', 'final'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const HORIZON_COLORS: Record<Horizon, { badge: string; bar: string; header: string }> = {
  now:   { badge: 'bg-green-100 text-green-800',   bar: '#16a34a', header: 'border-green-600' },
  next:  { badge: 'bg-amber-100 text-amber-800',   bar: '#f59e0b', header: 'border-amber-500' },
  later: { badge: 'bg-indigo-100 text-indigo-800', bar: '#6366f1', header: 'border-indigo-500' },
};
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  prd: 'PRD', brd: 'BRD', tech_spec: 'Tech spec', feature_brief: 'Feature brief',
};
```

### `packages/shared/src/schemas.ts` (zod — request bodies)
```ts
import { z } from 'zod';
import { HORIZONS, FEATURE_STATUSES, DOC_TYPES, DOC_STATUSES } from './constants';

export const featureCreate = z.object({
  title: z.string().min(1).max(200),
  horizon: z.enum(HORIZONS),
});
export const featureUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  horizon: z.enum(HORIZONS).optional(),
  status: z.enum(FEATURE_STATUSES).optional(),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  sortOrder: z.number().int().optional(),
}).refine(d => !(d.startDate && d.endDate) || d.startDate <= d.endDate,
  { message: 'startDate must be on or before endDate' });
export const documentCreate = z.object({
  featureId: z.string().uuid(),
  type: z.enum(DOC_TYPES),
  title: z.string().min(1).max(200),
  fromTemplate: z.boolean().default(true),
});
export const documentUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  contentJson: z.record(z.unknown()).optional(),  // Tiptap doc JSON
  status: z.enum(DOC_STATUSES).optional(),
});
export const productUpdate = z.object({
  name: z.string().min(1).optional(),
  vision: z.string().optional(),
  aboutMd: z.string().optional(),
});
export const generateDoc = z.object({
  docType: z.enum(DOC_TYPES),
  featureId: z.string().uuid(),
  brief: z.string().min(1).max(2000),
});
```

### `packages/shared/src/api-types.ts` (response shapes)
```ts
import type { Horizon, FeatureStatus, DocType, DocStatus } from './constants';

export interface Product { id: string; name: string; vision: string; aboutMd: string; }
export interface Feature {
  id: string; productId: string; title: string; horizon: Horizon; status: FeatureStatus;
  startDate: string | null; endDate: string | null; sortOrder: number;
  createdAt: string; updatedAt: string;
}
export interface DocumentMeta {
  id: string; featureId: string; type: DocType; title: string; status: DocStatus;
  createdAt: string; updatedAt: string;
}
export interface DocumentFull extends DocumentMeta { contentJson: unknown; contentMd: string; }
export interface FeatureWithDocs extends Feature { documents: DocumentMeta[]; }
export type AttentionItem =
  | { kind: 'draft_doc' | 'in_review_doc'; documentId: string; featureId: string; title: string; docType: DocType }
  | { kind: 'missing_dates' | 'no_docs'; featureId: string; title: string };
export interface OverviewResponse {
  product: Product;
  features: FeatureWithDocs[];
  attention: AttentionItem[];
}
```

### `packages/db/src/schema.ts` (Drizzle)
```ts
import { pgTable, uuid, text, date, timestamp, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const horizonEnum = pgEnum('horizon', ['now', 'next', 'later']);
export const featureStatusEnum = pgEnum('feature_status', ['idea', 'planned', 'in_progress', 'shipped']);
export const docTypeEnum = pgEnum('doc_type', ['prd', 'brd', 'tech_spec', 'feature_brief']);
export const docStatusEnum = pgEnum('doc_status', ['draft', 'in_review', 'final']);

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  vision: text('vision').notNull().default(''),
  aboutMd: text('about_md').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const features = pgTable('features', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  horizon: horizonEnum('horizon').notNull().default('later'),
  status: featureStatusEnum('status').notNull().default('idea'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  type: docTypeEnum('type').notNull(),
  title: text('title').notNull(),
  contentJson: jsonb('content_json').notNull().default({ type: 'doc', content: [] }),
  contentMd: text('content_md').notNull().default(''),
  status: docStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const uploads = pgTable('uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### `packages/templates/src/index.ts` shape
```ts
import type { DocType } from '@productmap/shared';
export interface DocTemplate {
  type: DocType;
  name: string;            // "Product requirements (PRD)"
  description: string;     // one-liner for the picker
  markdownBody: string;    // full markdown skeleton with ## sections
  promptHints: string;     // guidance prepended to the AI generation prompt
}
export const TEMPLATES: Record<DocType, DocTemplate> = { /* all four, real content */ };
```
Template skeletons (real section headings, written in full in the task):
- **PRD:** Overview / Problem & opportunity / Goals & success metrics / Non-goals / Users & use cases / Requirements (Must/Should/Won't) / UX notes / Risks & open questions / Launch checklist
- **BRD:** Executive summary / Business objectives / Background / Stakeholders / Scope (in/out) / Business requirements / Cost-benefit / Constraints & assumptions / Approval
- **Tech spec:** Summary / Context / Goals & non-goals / Proposed design / Alternatives considered / Data model changes / API changes / Security & privacy / Rollout plan / Open questions
- **Feature brief:** Problem / Hypothesis / Proposed solution (1 paragraph) / Success metric / Effort guess (S/M/L) / Links

### API route contracts (apps/api — mounted in `app.ts`)
```
GET    /api/overview                 → OverviewResponse
PATCH  /api/products/:id             body productUpdate → Product
GET    /api/features                 → FeatureWithDocs[]
POST   /api/features                 body featureCreate → Feature (201)
GET    /api/features/:id             → FeatureWithDocs
PATCH  /api/features/:id             body featureUpdate → Feature
DELETE /api/features/:id             → 204
GET    /api/documents?featureId=     → DocumentMeta[]
POST   /api/documents                body documentCreate → DocumentFull (201; contentJson from template when fromTemplate)
GET    /api/documents/:id            → DocumentFull
PATCH  /api/documents/:id            body documentUpdate → DocumentMeta (server derives contentMd)
DELETE /api/documents/:id            → 204
GET    /api/documents/:id/export.md  → text/markdown attachment
GET    /api/export.zip               → application/zip (folder per feature slug, .md per doc)
POST   /api/uploads                  multipart {file, documentId?} → { id, url } (url = /uploads/<storedname>)
GET    /api/ai/status                → { enabled: boolean }   (enabled = !!process.env.ANTHROPIC_API_KEY)
POST   /api/ai/generate-doc          body generateDoc → SSE: events `chunk` {text}, `done` {}; 503 if disabled
```
Errors: zod failure → 400 `{ error: 'validation', issues }`; missing row → 404 `{ error: 'not_found' }`; unexpected → 500 `{ error: 'internal', requestId }`. Central `app.onError`.

### Markdown conversion `apps/api/src/lib/markdown.ts`
```ts
export function tiptapToMarkdown(doc: unknown): string;   // Tiptap JSON → markdown
export function markdownToTiptap(md: string): unknown;    // markdown → Tiptap JSON
```
Implementation: build a server-side Tiptap extension list (StarterKit + Table kit + TaskList/TaskItem + Image + Link) shared by both directions. `markdownToTiptap`: `marked.parse()` → HTML → `generateJSON(html, extensions)` (`@tiptap/html`). `tiptapToMarkdown`: `generateHTML(json, extensions)` → `turndown` with GFM plugin (tables, task lists, strikethrough). Round-trip tests are the spec.

---

## Phase 0 — Scaffold (one agent, sequential)

### Task 0: Monorepo skeleton, toolchain, app shells

**Files (create):** root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`, `.gitignore` (append), `apps/api/{package.json,tsconfig.json,src/index.ts,src/app.ts,src/db.ts,vitest.config.ts,.env.example}`, `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.tsx,src/App.tsx,src/index.css,tailwind.config.ts,postcss.config.js,components.json}`, `packages/{shared,db,templates}/{package.json,tsconfig.json,src/index.ts}`, `playwright.config.ts`, `e2e/.gitkeep`.

- [ ] Root `package.json` scripts:
  ```json
  {
    "scripts": {
      "dev": "concurrently -n api,web \"pnpm --filter @productmap/api dev\" \"pnpm --filter @productmap/web dev\"",
      "build": "pnpm -r build",
      "test": "pnpm -r test",
      "e2e": "playwright test",
      "db:migrate": "pnpm --filter @productmap/db migrate",
      "db:seed": "pnpm --filter @productmap/db seed",
      "db:reset": "pnpm --filter @productmap/db reset"
    }
  }
  ```
- [ ] `pnpm-workspace.yaml`: `packages: ['apps/*', 'packages/*']`. Package names: `@productmap/api`, `@productmap/web`, `@productmap/shared`, `@productmap/db`, `@productmap/templates`.
- [ ] `tsconfig.base.json`: strict true, `moduleResolution: bundler`, `target: ES2022`, paths for `@productmap/*` → package `src`.
- [ ] `apps/api/src/app.ts`: create Hono app with `app.route()` mount points for `featuresRoutes`, `productsRoutes`, `documentsRoutes`, `uploadsRoutes`, `overviewRoutes`, `aiRoutes` — each initially an empty `new Hono()` exported from its own file under `src/routes/` (six stub files now ⇒ Phase 2 agents never touch the same file). Add central `onError` + `notFound` handlers per error contract. Export `type AppType`.
- [ ] `apps/api/src/index.ts`: `serve({ app, port: 3000 })` (`@hono/node-server`); serve `/uploads/*` static from `<repo>/uploads`.
- [ ] `apps/api/src/db.ts`: pg `Pool` from `process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap'`, export `db = drizzle(pool, { schema })` importing schema from `@productmap/db`.
- [ ] `apps/web`: Vite + React + TS template; `server.proxy = { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000' }`. Tailwind init; shadcn/ui init (slate, CSS variables); install Button, Dialog, DropdownMenu, Popover, Badge, Toast/Sonner, Input, Textarea, Select, Skeleton, Card components now.
- [ ] `playwright.config.ts`: `webServer` array starting api (`pnpm --filter @productmap/api dev`) and web (`pnpm --filter @productmap/web dev`), baseURL `http://localhost:5173`, test dir `e2e/`, chromium only.
- [ ] `.env.example`: `DATABASE_URL=postgres://localhost:5432/productmap`, `ANTHROPIC_API_KEY=` (blank).
- [ ] Verify: `pnpm i` clean; `pnpm dev` boots both; `curl localhost:3000/api/healthz` (add trivial healthz route) → `{"ok":true}`; web shows placeholder App.
- [ ] Commit: `chore: scaffold pnpm monorepo with api/web/shared/db/templates`.

---

## Phase 1 — Foundations (4 parallel tasks; no shared files)

### Task 1A: `packages/shared` — constants, zod schemas, api types

**Files:** Create `packages/shared/src/{constants.ts,schemas.ts,api-types.ts,index.ts}`, `packages/shared/src/schemas.test.ts`, `packages/shared/vitest.config.ts`.

- [ ] Write failing tests first (`schemas.test.ts`): featureUpdate rejects `startDate > endDate`; accepts equal dates; accepts null dates; featureCreate rejects empty title; documentUpdate accepts partial bodies; generateDoc rejects 2001-char brief. Run `pnpm --filter @productmap/shared test` → FAIL (modules missing).
- [ ] Implement files exactly per "Locked interfaces" above; `index.ts` re-exports all.
- [ ] Tests pass. Commit: `feat(shared): constants, zod schemas, api types`.

### Task 1B: `packages/db` — schema, migrations, seed

**Files:** Create `packages/db/src/{schema.ts,index.ts,migrate.ts,seed.ts,reset.ts}`, `packages/db/drizzle.config.ts`, generated `packages/db/migrations/*`. Package scripts: `migrate`/`seed`/`reset` run the respective tsx scripts; `generate` runs drizzle-kit.

- [ ] `schema.ts` exactly per locked interface. `index.ts` exports schema + a `createDb(connectionString)` factory.
- [ ] `drizzle.config.ts` → dialect postgresql, out `./migrations`. Run `pnpm --filter @productmap/db generate` → SQL migration emitted. `migrate.ts` uses drizzle-orm migrator.
- [ ] `seed.ts` (idempotent: wipes tables then inserts): product "ProductMap" with vision "Roadmaps and docs your security team will let you run." + aboutMd paragraph. 8 features dogfooding this build: Now: "Rich markdown editor" (in_progress, dated this month), "Now-next-later board" (in_progress, dated); Next: "Gantt roadmap" (planned, dated next month), "AI doc drafting" (planned, dated); Later: "Comments & review", "Up/down voting", "Realtime collaboration (Yjs)", "ECS deployment" (idea, no dates → feeds unscheduled tray + attention). Docs: PRD (draft) + tech spec (in_review) on "Rich markdown editor"; feature_brief (final) on "Gantt roadmap" — contentJson built via simple hardcoded Tiptap JSON paragraphs (do NOT depend on markdown lib; keep Phase 1 tasks independent), contentMd set to matching markdown string.
- [ ] Verify: `createdb productmap || true; pnpm db:migrate && pnpm db:seed` then `psql productmap -c "select count(*) from features"` → 8. Commit: `feat(db): drizzle schema, migrations, dogfood seed`.

### Task 1C: `packages/templates` — four real templates

**Files:** Create `packages/templates/src/{index.ts,templates.test.ts}`, vitest config.

- [ ] Failing test: TEMPLATES has all 4 DOC_TYPES; every markdownBody starts with an H1 placeholder line `# {{title}}` and contains ≥4 `## ` sections; every promptHints non-empty; PRD body contains "## Requirements", tech_spec contains "## Proposed design", brd contains "## Business objectives", feature_brief contains "## Success metric".
- [ ] Write full real markdown skeletons per the section lists in "Locked interfaces" (each section heading followed by a one-line italic hint, e.g. `*What problem are we solving and for whom?*`). promptHints per type, e.g. PRD: "Write a complete PRD. Be specific about user problems and measurable success metrics. Mark requirements Must/Should/Won't. Keep it under 800 words."
- [ ] Tests pass. Commit: `feat(templates): PRD, BRD, tech spec, feature brief templates`.

### Task 1D: markdown conversion lib

**Files:** Create `apps/api/src/lib/markdown.ts`, `apps/api/src/lib/markdown.test.ts`, `apps/api/src/lib/tiptap-extensions.ts`.

- [ ] Failing round-trip tests first: for each fixture md — heading+paragraph+bold/italic/code; nested bullet+ordered lists; GFM table 3×3; task list (checked+unchecked); fenced code block with language; blockquote; image `![alt](/uploads/x.png)`; link — assert `tiptapToMarkdown(markdownToTiptap(md))` normalizes equal (compare after trimming trailing whitespace per line, collapsing >2 blank lines). Plus: `markdownToTiptap('')` → empty doc node; `tiptapToMarkdown(emptyDoc)` → ''.
- [ ] Implement per locked interface (marked → generateJSON; generateHTML → turndown+gfm). Deps: `@tiptap/html`, `@tiptap/starter-kit`, table/task extensions, `marked`, `turndown`, `turndown-plugin-gfm`, `@joplin/turndown-plugin-gfm` if needed for task lists.
- [ ] Tests pass. Commit: `feat(api): tiptap json <-> markdown conversion`.

---

## Phase 2 — API (3 parallel tasks; each owns its route files; integration tests hit real `productmap_test` DB, truncated in beforeEach via helper `apps/api/src/test/helpers.ts` created in Task 2A)

Shared pattern for all: route file owns one resource; tests use `app.request()` (Hono test client) with `DATABASE_URL` pointed at `productmap_test`; test setup runs migrations once.

### Task 2A: products + features routes (+ test harness)

**Files:** Create `apps/api/src/test/helpers.ts` (createdb-if-missing `productmap_test`, run migrations, `truncateAll()`), `apps/api/src/routes/{products.ts,features.ts}` (replace stubs), tests `apps/api/src/routes/{products,features}.test.ts`.

- [ ] Failing tests: POST /api/features 201 + defaults (horizon from body, status idea, sortOrder 0); GET list returns FeatureWithDocs with empty documents array; PATCH horizon/status/dates (valid + 400 on inverted dates + 404 unknown id); DELETE 204 then GET 404 (and cascades docs); PATCH /api/products/:id updates vision. Sort: list ordered by horizon (now,next,later) then sortOrder then createdAt.
- [ ] Implement with `zValidator` from `@hono/zod-validator` using shared schemas; `updatedAt = now()` on PATCH.
- [ ] Tests pass. Commit: `feat(api): products and features routes with integration tests`.

### Task 2B: documents + uploads + export

**Files:** Replace stubs `apps/api/src/routes/{documents.ts,uploads.ts}`; tests for both; uses Task 1D markdown lib + Task 1C templates. Dep: `archiver` for zip, `nanoid` for stored filenames.

- [ ] Failing tests: POST /api/documents with fromTemplate:true → contentJson non-empty (template body with `{{title}}` replaced by doc title, converted via markdownToTiptap) and contentMd contains '## '; fromTemplate:false → empty doc. PATCH with contentJson → response ok AND a follow-up GET shows derived contentMd containing typed text (server-side conversion in same transaction). Status transitions draft→in_review→final. export.md: content-type text/markdown, content-disposition attachment, body === contentMd. export.zip: 200, content-type zip, unzip in test (use `adm-zip`) → contains `<feature-slug>/<doc-slug>.md`. POST /api/uploads with a png buffer → 201 {id,url}; GET url via static serve → bytes match; rejects mime not in png/jpeg/gif/webp → 400 (SVG deliberately rejected: script-bearing SVG served same-origin = stored XSS); >10MB → 413.
- [ ] Implement. Upload storage: `<repo>/uploads/<nanoid>.<ext>`; ensure dir exists at boot.
- [ ] Tests pass. Commit: `feat(api): documents CRUD, markdown export, uploads`.

### Task 2C: overview + AI

**Files:** Replace stubs `apps/api/src/routes/{overview.ts,ai.ts}`; tests; `apps/api/src/lib/ai.ts`.

- [ ] Failing tests — overview: returns product + features with nested docs + attention items: seedlike fixtures produce `draft_doc` for draft docs, `in_review_doc`, `missing_dates` for dateless features, `no_docs` for docless features; no duplicates; ordered (docs first, then features). AI: GET /api/ai/status `{enabled:false}` when env unset; POST generate-doc → 503 when disabled. With `ANTHROPIC_API_KEY=test` + mocked Anthropic client (inject via `ai.ts` factory): SSE response streams ≥2 `chunk` events then `done`; prompt passed to client contains template promptHints + markdownBody + brief + feature title.
- [ ] Implement `ai.ts`: `createAiClient()` returns null if no key; `generateDocStream({docType, brief, feature})` calls `client.messages.stream` with model `claude-sonnet-4-6`, max_tokens 4000, system = "You write product documents in clean markdown. Follow the provided template structure exactly. No preamble — output starts with the H1." user = promptHints + skeleton + feature context + brief. Route wraps in Hono `streamSSE`.
- [ ] Tests pass. Commit: `feat(api): overview aggregate and AI doc generation (SSE)`.

---

## Phase 3 — Web (4 parallel tasks; file ownership disjoint; ALL must follow UX Guidelines section)

Shared foundations live in Task 3A and are interface-stable for 3B-D (they may build against them before 3A merges since props are specified here):
- `src/lib/api.ts`: `export const api = hc<AppType>('/')` + typed fetch helpers + TanStack Query hooks: `useOverview()`, `useFeatures()`, `useFeature(id)`, `useUpdateFeature()` (optimistic: cancels queries, snapshots, rolls back on error, invalidates on settle), `useCreateFeature()`, `useDocument(id)`, `useUpdateDocument()`, `useCreateDocument()`, `useAiStatus()`.
- `src/components/HorizonBadge.tsx` `{horizon}`; `src/components/StatusBadge.tsx` `{status}`; `src/components/DocTypeChip.tsx` `{type}`.
- Layout: `src/components/AppShell.tsx` — top nav (logo "ProductMap", links Overview `/`, Board `/board`, Roadmap `/roadmap`), `<Outlet/>`, `<Toaster/>`.

### Task 3A: app shell, api hooks, landing page

**Files:** Create `src/lib/api.ts`, `src/lib/utils.ts`, `src/components/{AppShell,HorizonBadge,StatusBadge,DocTypeChip}.tsx`, `src/routes/Landing.tsx`, `src/components/landing/{VisionHeader,GanttHero,HorizonPanel,AttentionPanel}.tsx`, router setup in `App.tsx`.

- [ ] Router: `/` Landing, `/board` lazy BoardPage, `/roadmap` lazy RoadmapPage, `/docs/:id` lazy DocPage (3B-D own those files; until they land, lazy stubs render "coming soon").
- [ ] Landing per spec layout B: VisionHeader (h1 product name + click-to-edit vision via inline input, PATCH product, toast on save); GanttHero (read-only SVG: rows = dated features, x-scale spanning min(startDate)−7d → max(endDate)+7d, bars filled `HORIZON_COLORS[h].bar`, today vertical line, bar click → `/roadmap`); three HorizonPanels (top 3 by sortOrder, "+N more" → `/board`, feature click → `/board` with `?feature=` opening detail panel); AttentionPanel (icon per kind, click → doc editor or board detail).
- [ ] States: skeletons (header line + hero block + 4 panel blocks) while `useOverview` loads; error card with retry; panels show empty text when no features.
- [ ] Component tests (Vitest + Testing Library, msw mock of /api/overview): renders seeded fixture → all 4 panels, hero bar count matches dated features, attention items navigate (assert router location).
- [ ] Commit: `feat(web): app shell, typed api hooks, landing dashboard`.

### Task 3B: board (now-next-later) + feature detail panel + new-doc dialog

**Files:** Create `src/routes/Board.tsx`, `src/components/board/{BoardColumn,FeatureCard,FeatureDetailPanel,NewFeatureDialog,NewDocDialog}.tsx`.

- [ ] Board: 3 `BoardColumn`s (header: horizon label + count, top border color per HORIZON_COLORS.header). dnd-kit `DndContext` + `useDroppable` per column + `useSortable` cards; drop on column → optimistic `useUpdateFeature` horizon PATCH; failure → revert + toast.
- [ ] FeatureCard: title, StatusBadge, DocTypeChips for its docs; Enter/click opens FeatureDetailPanel (Sheet from right). `?feature=<id>` URL param opens panel (deep-link from landing).
- [ ] FeatureDetailPanel: editable title (blur saves), status Select, date inputs (two `<input type=date>`, save on change, validation error inline if inverted), docs list (click → `/docs/:id`), "New doc" → NewDocDialog (radio list of 4 templates from DOC_TYPE_LABELS + descriptions + "Blank", title input prefilled `<feature title> — <type label>`, Create → POST → navigate to `/docs/:id`), Delete feature (confirm dialog).
- [ ] NewFeatureDialog from column footer "+ Add feature": title input → POST with column's horizon.
- [ ] Empty column state per UX guidelines. Loading skeleton: 3 columns × 2 card blocks.
- [ ] Component tests (msw): drag simulated via dnd-kit test utils or direct mutation call assert optimistic cache update + rollback on 500; new-doc dialog Esc closes, focus returns.
- [ ] Commit: `feat(web): now-next-later board with drag, detail panel, doc creation`.

### Task 3C: Gantt roadmap page

**Files:** Create `src/routes/Roadmap.tsx`, `src/components/gantt/{GanttChart,GanttBar,GanttHeader,UnscheduledTray,gantt-math.ts,gantt-math.test.ts}`.

- [ ] `gantt-math.ts` pure + unit-tested FIRST (TDD anchor): `dateToX(date, viewStart, pxPerDay)`, `xToDate(x, ...)` (snap to day), `barRect(feature, ...)`, `clampDrag(...)`; tests cover snapping, min 1-day width, today-line position.
- [ ] GanttChart: SVG, `pxPerDay=4` (≈window: 6 months), month labels + week gridlines (GanttHeader), row per dated feature (label left gutter 200px, bar in plot), today-line red. Bar drag (pointer events: pointerdown capture → move Δx → ghost position; pointerup → PATCH both dates shifted) ; right-edge resize handle (8px hit area, `cursor-ew-resize`) → PATCH endDate; min width 1 day. Optimistic; toast "Moved 'X' to <range>" on success, revert+error toast on fail.
- [ ] UnscheduledTray below: dateless features as chips, draggable onto plot (drop x → startDate at snapped date, endDate +14d default).
- [ ] Bar click (no drag, <5px movement) → opens same FeatureDetailPanel (import from board components) — acceptable cross-import, it's a shared component; move it to `src/components/FeatureDetailPanel.tsx` if 3B hasn't already (coordinate: 3B owns the file, 3C imports only).
- [ ] Scroll-into-view + highlight pulse when arriving with `?feature=` (from landing hero click).
- [ ] Component tests: gantt-math fully; render with fixture → bar count/colors; drag math unit-level (simulate pointer events on bar, assert PATCH payload dates).
- [ ] Commit: `feat(web): interactive svg gantt with drag, resize, unscheduled tray`.

### Task 3D: document editor + AI drafting UI

**Files:** Create `src/routes/Doc.tsx`, `src/components/editor/{Editor,EditorToolbar,SlashMenu,slash-items.ts,AiDraftCard,useAutosave.ts}`.

- [x] Tiptap setup: StarterKit, Table(+Row/Cell/Header, resizable), TaskList/TaskItem(nested), Image, Link(openOnClick false), Placeholder("Type '/' for commands…"). Content from `useDocument(id)` contentJson; `onUpdate` → `useAutosave` (debounce 800ms → PATCH contentJson; exposes state `idle|saving|saved|error`).
- [x] SlashMenu via `@tiptap/suggestion` on `/`: items in `slash-items.ts`: Heading 1/2/3, Bullet list, Numbered list, Task list, Table 3×3, Code block, Quote, Image (opens file picker → POST /api/uploads → insert node with returned url), Divider. Filter on query, arrows+Enter+Esc per UX guidelines.
- [x] Toolbar: back link (← feature title), editable doc title (PATCH on blur), DocTypeChip, status Select (PATCH), autosave indicator ("Saving…"/"Saved"/amber banner on error per UX guidelines), "Export .md" button → opens `/api/documents/:id/export.md`.
- [x] Paste/drop image: upload via same endpoint, insert inline.
- [x] AiDraftCard: rendered inside editor area only when (doc is empty: contentJson has no text content) AND `useAiStatus().enabled`. Textarea "Describe the feature in a sentence or two" + "Draft with AI" button → POST generate-doc, read SSE via fetch ReadableStream; accumulate markdown; every chunk: replace editor content with `markdownToTiptap`-equivalent — client-side: insert as markdown via `marked` → HTML → `editor.commands.setContent(html)` (Tiptap parses HTML natively; identical extension set). On `done`: trigger autosave. Abort button while streaming; partial kept on abort/timeout(30s) + retry toast.
- [x] Component tests (msw): autosave fires once per burst (fake timers); save error shows banner; slash menu filters; AI card hidden when status disabled; SSE mock streams → editor content grows.
- [x] Commit: `feat(web): tiptap editor with slash menu, autosave, uploads, AI drafting`.

---

## Phase 4 — E2E, acceptance loop, polish (sequential)

### Task 4A: Playwright E2E suite

**Files:** Create `e2e/{landing.spec.ts,board.spec.ts,gantt.spec.ts,editor.spec.ts,export.spec.ts,ai.spec.ts,ux.spec.ts}`, `e2e/helpers.ts` (resetDb via `pnpm db:reset && pnpm db:seed` in globalSetup).

- [ ] Implement specs mapping 1:1 to AC2–AC9 and AC-UX1/2/3/6 as written in the Acceptance Criteria section (each AC bullet = at least one `test()`); AI spec mocks SSE via `page.route('/api/ai/**')`.
- [ ] `pnpm e2e` green. Commit: `test(e2e): playwright suite covering acceptance criteria`.

### Task 4B: Acceptance verification loop

- [ ] Run full matrix: `pnpm test`, `pnpm e2e`, then manual-style Playwright CLI drive-through of every AC with screenshots saved to `docs/superpowers/verification/`.
- [ ] Any failure → fix → rerun. Loop until all green.
- [ ] AC1 cold-start check: kill servers, `pnpm db:reset && pnpm db:seed && pnpm dev`, screenshot `/` with zero console errors.
- [ ] Screenshot review against UX guidelines (AC-UX5 color audit, spacing, states).
- [ ] Commit: `chore: acceptance verification artifacts`.

---

## Self-review notes
- Spec coverage: every spec section maps to a task (storage→1B, templates→1C, conversion→1D, API→2A-C, views→3A-D, error handling→UX guidelines+route contracts, testing→per-task TDD+4A, AC→Phase 4). Export.zip, uploads, AI degrade all present.
- Cross-task type consistency enforced by "Locked interfaces" — implementers import from `@productmap/shared`, never redefine.
- FeatureDetailPanel ownership: 3B creates `src/components/board/FeatureDetailPanel.tsx`; 3C imports it. Coordinated explicitly to avoid duplicate implementations.
