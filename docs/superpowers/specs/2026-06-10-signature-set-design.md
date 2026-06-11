# Signature Set — Award-Grade UI Design Addendum

**Date:** 2026-06-10 · **Extends:** all prior specs. Soft Studio remains the design language; this adds motion, keyboard power, theming, and two signature features. Existing UX guidelines stay binding. All existing tests stay green.

## Wave 1 — The Feel

### 1.1 Dark mode + theme system (foundation)
- Promote Soft Studio palette fully to CSS variables with `:root` (light) and `.dark` values. Dark is **"Studio Ink"**: field gradient `linear-gradient(160deg,#101418,#0d1117)`, cards `#161b22` with soft shadow `0 10px 28px rgba(0,0,0,.45)`, ink text `#e6ebf2`, body `#a9b4c2`, muted `#67737f`, action `#7aa7d9` with `#16283c` soft fill, sage/warm equivalents tuned for dark. Horizon bar hexes UNCHANGED (work on both fields); chip tints get dark variants via variables.
- Theme toggle in AppShell (sun/moon pill): light / dark / system; persisted `localStorage.pmTheme`; `prefers-color-scheme` respected for "system"; no flash (inline script in index.html sets class before paint).
- Gantt SVG + editor prose + preview pane all themed via the same variables (no hardcoded light values left — audit).

### 1.2 Command palette (⌘K)
- `cmdk` (shadcn Command dialog). Open: ⌘K / Ctrl+K. Sections:
  - **Navigate**: Overview, Board, Roadmap, Docs + every feature ("Feature: Rich markdown editor") + every doc ("Doc: … — PRD") — fuzzy search, data from existing queries.
  - **Create**: "New feature in Now/Next/Later…" (inline title input then create+navigate), "New doc…" (feature picker → template picker reusing existing dialog).
  - **Actions (context-aware)**: on a feature page/peek — "Move to Now/Next/Later", "Mark shipped", "🚀 Boost", "🧊 Cool"; in editor — "Export markdown", "Toggle comments".
  - **Theme**: "Switch to dark/light/system".
- `?` (when not typing in an input) opens a keyboard-shortcuts overlay (rounded-2xl card grid). `j/k` move selection in Docs table and board columns, `Enter` opens.
- Recents: last 5 visited features/docs at top of palette (localStorage).

### 1.3 Morph transitions (View Transitions API)
- `document.startViewTransition` wrapper around router navigations (helper `navigateWithTransition`); graceful no-op where unsupported.
- Shared-element morphs via `view-transition-name`:
  - Board card → feature page (card container ↔ page header block)
  - Docs table row / doc card → editor toolbar title
  - Landing panel feature row → board peek
- Default crossfade for all other navs, 180ms ease-out. Respect `prefers-reduced-motion` (disable morphs entirely).

### 1.4 Micro-delight pass
- Vote 🚀: 6-8 particle emoji burst from the button (tiny canvas or absolutely-positioned spans, 500ms, fire-and-forget). 🧊 gets a frost shimmer ring.
- Status → shipped: one-shot confetti (canvas-confetti, low count ~80, brand colors) on the feature page / peek.
- Drag: spring-feel settle on drop (CSS transition on transform with slight overshoot cubic-bezier(.34,1.56,.64,1)); board card drop pulses the destination column header dot.
- Hover-prefetch: on feature card / doc row hover, prefetch the detail query (TanStack `prefetchQuery`) — navigation feels instant.
- Staggered fade-up extended to board columns and docs table rows (40ms steps, only on first mount).
- All motion ≤500ms, transform/opacity only, gated by `prefers-reduced-motion`.

Deps added in Wave 1 foundation: `cmdk`, `canvas-confetti`, `@types/canvas-confetti`.

## Wave 2 — The Substance

### 2.1 Roadmap Time Machine 🏆
- **API**: `GET /api/activity?since=ISO` → workspace-wide activity (all features), ascending, joined actor; cap 1000. Activity payloads MUST carry enough to replay: `horizon_changed {from,to}`, `dates_changed {from:{startDate,endDate}, to:{…}}`, `status_changed {from,to}`, `feature_created {snapshot:{title,horizon,startDate,endDate,status}}`. Audit existing recording; backfill payload gaps.
- **Seed history**: seed script generates a plausible 3-month back-story (~18 activity rows with spread custom `created_at`s: features created over time, dates shifted, horizons promoted) so the Time Machine demos on fresh seed.
- **UI** (`/roadmap`): "History" pill toggles Time Machine mode — a scrub bar (range slider styled as a timeline with month ticks + event density dots) appears below the Gantt. Scrubbing reconstructs state at time T by replaying events from a base snapshot: bars animate position/width (300ms ease-out), features appear/disappear, horizon colors flip. Date label chip follows the thumb ("March 14"). Play ▸ button auto-advances (4s full sweep). Read-only while scrubbing; "Back to now" returns + re-enables editing. Pure client-side reconstruction from the activity list — no new writes.

### 2.2 Mission-control landing
- Panels gain a data-viz layer (all client-computed from existing `/api/overview` + new `/api/activity`):
  - **Velocity sparkline**: activity events per week, last 8 weeks (inline SVG path, action color).
  - **Horizon arc**: small donut of feature distribution (SVG, horizon colors).
  - **Activity heatmap**: GitHub-style 12-week calendar grid in a new "Pulse" panel (intensity = events/day, action-color scale, tooltip with count).
  - **AI digest card** (only when AI enabled): "This week in ProductMap" — `POST /api/ai/digest` summarizes last 7 days of activity (reuses SSE pipeline, ~120 words, cached in sessionStorage for the day). Hidden without key.
- Vision header gets product-accent gradient text on the H1 (subtle, two-stop from ink to action).

### 2.3 Editor soul
- **Block drag handles**: hover gutter handle (⋮⋮) per top-level block; drag to reorder (Tiptap node drag; custom lightweight implementation).
- **Callout block**: slash command `/callout` — tinted card with emoji picker (💡 default). Markdown round-trip: serializes to `> [!NOTE] emoji …`-style blockquote (`> 💡 text`); parser maps emoji-leading blockquotes back to callouts. Update markdown lib + round-trip tests.
- **Toggle block**: `/toggle` — collapsible summary/children. Serializes to `<details><summary>…</summary>…</details>` (HTML passthrough in markdown). Round-trip tested.
- **ToC rail**: right-floating minimal rail of dots+labels from H1-H3 (appears when doc has ≥3 headings), click scrolls smoothly, active section highlighted.
- **Doc covers**: optional gradient cover band (8 curated Soft Studio gradients, picker in toolbar ⋯ menu; stored in new `documents.cover` text column — tiny migration).
- **Reading time + word count** in toolbar meta line.
- **Reader view**: `/docs/:id/read` — print-beautiful render (wider type scale, serif optional…no, keep Schibsted; generous measure, cover band, no chrome) + `window.print()` styles. Linked from toolbar ("Reader").

## Acceptance criteria

W1-1: Theme toggle cycles light/dark/system, persists, no flash on reload; every route fully themed (no light-mode islands in dark — screenshot audit).
W1-2: ⌘K opens palette; fuzzy-finds features and docs; create-feature-in-Later via palette works end-to-end; `?` shows shortcuts; j/k+Enter navigate docs table.
W1-3: Board card → feature page navigation morphs (Chromium); reduced-motion disables it; non-supporting browsers fall back cleanly.
W1-4: 🚀 vote fires particle burst; shipped status fires confetti once; feature/doc hover prefetches (network tab shows query before click).
W2-1: Roadmap History mode scrubs smoothly; seeded history shows ≥3 visible changes across the sweep (bar moves, horizon flip, feature appears); Play sweeps in ~4s; Back to now restores live state.
W2-2: Landing shows sparkline, horizon arc, and heatmap with real data; AI digest streams when key present and is absent without it.
W2-3: Editor: drag-reorder blocks, callout and toggle blocks insert via slash menu and survive markdown export → import round-trip (unit-tested); ToC rail appears on the seeded PRD and tracks scroll; reader view renders with cover and prints clean.
W2-4: `pnpm -r exec tsc --noEmit`, `pnpm test`, `pnpm e2e` all green; existing 45 e2e untouched or updated only for intentional UX moves.

## Out of scope
Map Mode (own project next), sound design, public share links, framer-motion (CSS + View Transitions suffice).
