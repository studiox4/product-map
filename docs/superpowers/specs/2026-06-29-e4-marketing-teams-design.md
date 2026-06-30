# E4 — Marketing: "Built for teams" capability section

**Status:** Approved (brainstorm) — 2026-06-29
**Backlog:** `BACKLOG.md` E4
**Effort:** S — frontend/content only, no backend.

## Goal

The landing page sells the single-user product (roadmap, docs, releases, AI copilot) but says nothing about the multi-project / collaboration / public surfaces that have shipped (E1 multi-project + sharing, E3 dashboard, E5 public intake). Add a second row of capability cards — "Built for teams" — that tells the collaboration story with lightweight motion-illustrations, matching the existing marketing aesthetic.

## Scope decisions (locked in brainstorm)

| Decision | Choice |
|----------|--------|
| Format | Extend the FeatureHighlights area with a SECOND row of 4 cards under a "Built for teams" subheading (top 4 cards untouched) |
| Capabilities | All four: multi-project + switcher · roles + email invites · public roadmap sharing · public idea intake |
| Visual | Motion-illustration (CSS/SVG + the existing motion primitives) — NOT real screenshots |

## Constraints (from the marketing page's architecture)

- **Presentational only.** No router hooks, no react-query, no providers — Marketing.tsx client-renders bare at `/` and SSR-prerenders with no hydration mismatch. New components must hold to this (the only page-level runtime fetch is GitHubStars). Motion is fine: the page is already wrapped in `MotionProvider`, and the existing `motion/story/*` components animate under SSR-prerender — mirror them.
- Reuse existing primitives: `Reveal` (`motion/Reveal.tsx`), `MotionProvider`, `palette.ts`, and the `motion/story/*` pattern (`BoardToRoadmap`, `DocsType`, `ScenarioFork`).
- Match the existing card styling verbatim (`rounded-xl border border-border bg-card p-6 shadow-sm … hover:-translate-y-1`).

## Architecture

### New section component — `apps/web/src/components/marketing/TeamHighlights.tsx`
A `<section>` mirroring `FeatureHighlights` layout: a small subheading ("Built for teams" + one-line tagline), then a `grid sm:grid-cols-2 lg:grid-cols-4` of 4 cards. Each card = a motion-illustration (top), then title + body, wrapped in `Reveal` with staggered `delay={0.08 * i}`. Driven by a `CARDS` array `{ Illustration, title, body }` (same shape idiom as FeatureHighlights' `CARDS`).

### Four motion-illustration components — `apps/web/src/components/marketing/motion/team/`
Each is a small, self-contained CSS/SVG animation (one responsibility, ~a mock UI fragment), built like the `motion/story/*` components, SSR-safe, no external data:

1. **`SwitcherMock.tsx`** — a project-switcher dropdown: 3–4 project rows; the highlighted/selected row cycles or a checkmark moves. Sells "multiple projects, one workspace + a cross-project home."
2. **`RolesMock.tsx`** — three role chips (Owner / Editor / Viewer) that settle in, plus a faux email-invite input line ("teammate@company.com → Invite"). Sells "invite by email, owner/editor/viewer access."
3. **`ShareMock.tsx`** — a read-only share-link bar (`/share/…` with a copy affordance) + three section toggles (Roadmap / Board / Changelog) + an expiry pill. Sells "public read-only links, choose sections, set expiry."
4. **`IntakeMock.tsx`** — a minimal public intake form (title + description fields, Submit) with a submitted idea animating into an inbox row. Sells "a no-login form feeds your triage inbox."

Each illustration is decorative: `aria-hidden` where appropriate, with the card's title/body carrying the accessible meaning.

### Card copy (final)
1. **Multiple projects, one workspace** — "Run every roadmap from one place. Switch projects instantly and see what needs you across all of them on a single home."
2. **Your team, the right access** — "Invite teammates by email and give each the right access — owner, editor, or viewer."
3. **Share roadmaps, publicly** — "Publish a read-only link to your roadmap. Choose which sections show, set an expiry, and keep it out of search."
4. **Collect ideas from anyone** — "Drop a no-login intake form anywhere. Submissions land in your inbox to triage, promote, or dismiss."

### Wiring — `apps/web/src/routes/Marketing.tsx`
Insert `<TeamHighlights />` immediately after `<FeatureHighlights />` (before `<ScreenshotStrip />`). One import + one element.

## Testing

- **`TeamHighlights.test.tsx`** (mirror `FeatureHighlights.test.tsx`): renders the section heading + all four card titles + bodies; asserts four cards present.
- Each illustration component: a minimal smoke test that it renders without throwing (they're decorative; no behavior to assert beyond mount). Optionally fold into the section test if the mocks render inside it.
- **SSR safety:** the existing `routes/__tests__/marketing-ssr.test.tsx` + `App.marketing.test.tsx` already render the whole marketing page; confirm they still pass with the new section (no router/query/provider use introduced).

## Out of scope
- Real screenshots / app-capture (chose motion).
- A notifications card (not selected).
- Copy/SEO changes elsewhere, nav links, or footer changes.
- Any backend, data, or i18n.
