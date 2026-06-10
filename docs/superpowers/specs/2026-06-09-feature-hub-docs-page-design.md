# Feature Hub + Docs Page — Design Addendum

**Date:** 2026-06-09 · **Extends:** `2026-06-09-product-map-demo-design.md` (Soft Studio design language applies throughout)

User feedback driving this: the feature sheet is too thin to manage a feature; doc states/types need stronger color semantics; docs have no browsing surface. Pattern chosen: **peek sheet + full feature page** (Linear-style) and a **filterable docs table with preview pane**.

## Identity (no auth — demo)

- `users` table: `id uuid pk, name text, color text, created_at`. No passwords/sessions — v2 auth replaces creation flow only.
- First run: web app checks `localStorage.pmUserId`; if absent (and no users exist), a welcome dialog asks for a name, POSTs `/api/users`, stores the id. The api client sends `x-user-id` on every request; server middleware resolves it (fallback: first seeded user).
- `created_by`/`updated_by uuid` (FK users, nullable) added to `features` and `documents`. `features.description_md text not null default ''`.
- `feature_collaborators (feature_id, user_id, pk both)` — auto-add anyone who edits a feature or its docs; manual add/remove on the feature page.
- `activity (id, feature_id FK, actor_id FK users, kind text, payload jsonb, created_at)` — server-side recording on: feature created, horizon changed, status changed, dates changed, description edited, doc created, doc status changed, doc renamed. Kinds: `feature_created | horizon_changed | status_changed | dates_changed | description_edited | doc_created | doc_status_changed | doc_renamed`.

## Color semantics (single source: `packages/shared`)

```ts
export const DOC_TYPE_COLORS: Record<DocType, { chip: string; edge: string }> = {
  prd:           { chip: 'bg-[#dcebff] text-[#2b557e]', edge: '#2b557e' },
  tech_spec:     { chip: 'bg-[#efe3fb] text-[#6d3f9e]', edge: '#6d3f9e' },
  brd:           { chip: 'bg-[#d9f2f0] text-[#0e7490]', edge: '#0e7490' },
  feature_brief: { chip: 'bg-[#e4f0e4] text-[#3c6b46]', edge: '#3c6b46' },
};
export const DOC_STATUS_COLORS: Record<DocStatus, string> = {
  draft:     'bg-[#f1f3f5] text-[#5a6b80]',
  in_review: 'bg-[#fdf0e3] text-[#9a6428]',
  final:     'bg-[#e4f0e4] text-[#3c6b46]',
};
export const USER_COLORS = ['#2b557e', '#3c6b46', '#9a6428', '#6d3f9e', '#0e7490', '#9a5a3c']; // assigned round-robin
```

DocTypeChip + status chips everywhere consume these (board cards, docs table, feature page, editor toolbar, attention panel).

## API additions

```
GET    /api/users                          → User[]
POST   /api/users        {name}            → User (color auto-assigned)
PATCH  /api/users/:id    {name?}           → User
GET    /api/features/:id/activity          → ActivityItem[] (joined actor name/color, newest first, cap 50)
PUT    /api/features/:id/collaborators     {userIds: string[]} → 204
GET    /api/documents?all=true             → DocumentListItem[]  (meta + featureTitle + featureHorizon + wordCount)
PATCH  /api/features/:id  gains {descriptionMd?}
```

`x-user-id` middleware on all mutating routes → sets created_by/updated_by, records activity, auto-adds collaborator.

## Web surfaces

**Peek sheet (slim, from board/gantt card click)** — title (inline edit), horizon + status pills (editable dropdowns), date inputs, docs list (type-colored chips) + "New doc", creator line ("Added by Corban · Jun 9"), primary "Open feature ↗" → `/features/:id`. Delete moves to full page.

**Feature page `/features/:id`** — breadcrumb (Board / Now); title in Bricolage 32; horizon/status pills. Two-column: main = description block (inline markdown-lite editing: textarea that renders via marked on blur, soft wash card), docs grid (cards with type-colored top edge, status pill, word count, updated; dashed "+ New doc" card), activity feed (avatar dot, actor, verb, relative time). Right rail = People (creator + collaborators with avatar circles, add/remove popover), Dates (start/end), Horizon select, Delete (confirm). v2 comments/votes land on this page.

**Docs page `/docs`** (nav gains "Docs" between Board and Roadmap) — toolbar: type filter pills, status filter pills, search input (client-side over title+featureTitle), "+ New doc" (picks feature then template). Table columns: Title, Type, Status, Feature, Updated (sortable: title/updated). Row click → preview pane (Sheet, right, 520px): doc title, type+status pills, feature link, rendered markdown (marked → sanitized HTML with prose styles, read-only), "Open in editor →" primary pill. Empty + loading + error states per UX guidelines.

## Testing

- Unit: color maps complete for all enum values; activity recording per mutation kind (api tests); users routes; documents?all=true shape.
- E2E updates: board flows route through peek sheet (date inputs remain in peek — existing AC flows keep passing); new specs: feature page (open from peek, edit description, activity shows event, collaborator visible), docs page (filter by type, search, preview pane opens, open-in-editor navigates), first-run profile dialog (clear localStorage → name prompt → attributed creation).
- All existing 25 e2e + unit suites stay green (selectors updated only where UX intentionally moved).

## Acceptance criteria

1. Fresh seed + cleared localStorage → welcome dialog once; name persists; subsequent feature/doc creations show "Added by <name>".
2. Board card click → peek opens <300ms; "Open feature ↗" → full page with description, docs grid, people, dates, activity.
3. Editing horizon/status/dates/description anywhere writes an activity entry visible on the feature page feed.
4. `/docs` lists every doc with correct type/status colors; type+status filters AND search compose; sort by updated works.
5. Doc row click → preview pane renders the doc's markdown read-only with correct prose styling; "Open in editor" lands in the full editor.
6. Doc type/status colors identical across board chips, docs table, feature page, editor toolbar (single shared source).
7. `pnpm test` and `pnpm e2e` fully green.
