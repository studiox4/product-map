# Marketing site — premium motion & animated-SVG redesign

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Branch / worktree:** `worktree-marketing-premium-motion`
**Scope owner skill at implementation:** `frontend-design` ("our front-end designer")

## Context

The public marketing landing (`productmap.x4.studio`) is a Vite + React, Tailwind,
SSR-prerendered page. Sections (in order): `MarketingNav`, `Hero`,
`FeatureHighlights`, `ScreenshotStrip`, `EthosBand`, `GitHubStars`,
`MarketingFooter` (all under `apps/web/src/components/marketing/`, composed in
`apps/web/src/routes/Marketing.tsx`).

The page is prerendered to static HTML via `vite build --ssr
src/entry-marketing.tsx` + `scripts/prerender.mjs`. There is **no QueryProvider /
router** in the marketing tree (it is a bare presentational component), which is
why `MarketingNav` does auth detection with a raw `fetch`. Any motion work must
preserve this: **the prerendered HTML must render complete and correct with
JavaScript disabled.**

Current theme: custom CSS variables ("Soft Studio Palette") in
`apps/web/src/index.css` — `--pm-action: #4338ca` (light) / `#8b83f5` (dark),
`--pm-ink`, `--pm-body`, etc. Existing CSS animations: `fade-up`, `shimmer`,
`dot-pulse`, plus a `prefers-reduced-motion: reduce` block that disables all
animation. Fonts: Bricolage Grotesque (display) / Schibsted Grotesk (sans).

No motion library is currently installed.

### Logo status (pre-work verification — no action needed)

The Stagger brand mark is correct everywhere in code and assets:
`BrandMark.tsx` inline SVG is byte-identical to canonical
`docs/brand/stagger-assets/icon.svg` (four staggered gantt rects, `#4338CA` /
`#6D63F0`). Raster assets (favicons, apple-touch, og-cover) were pixel-inspected
and all show the Stagger mark. Both live headers (`productmap.x4.studio` and the
Railway demo) render the correct mark. The user's "wrong logo in header" sighting
on the marketing landing was a stale browser/CDN cache — no code change required.
(The stale memory note `phase-3-marketing-pending-assets` is now outdated.)

## Goal

Make the marketing site feel premium through motion and custom animated SVGs that
tell the product story, while keeping the real product screenshots as proof. This
is a **motion + SVG + icon layer**, NOT a layout/copy rebuild. Sections, copy, and
structure stay; we add choreography and brand-tied graphics.

## Decisions (from brainstorming)

- **Ambition:** Motion polish + animated story SVGs (medium). Not a full visual rebuild.
- **Hero:** Animated SVG leads the right column (ties to the Stagger logo).
  Real `hero.png` relocates into the proof strip.
- **Motion tech:** `framer-motion`, accepting ~45kb gzip on the marketing bundle,
  with explicit SSR/prerender guarding.
- **Story SVGs:** keep all three (board→roadmap, docs, AI copilot).
  - *Implementation note (2026-06-23):* the AI-copilot pulse is delivered by the
    animated `CopilotIcon` in the FeatureHighlights grid (no AI screenshot row
    exists to host a separate accent), so the standalone `CopilotPulse` story SVG
    was dropped as redundant rather than left unwired.

## Architecture

### 1. Motion infrastructure (`apps/web/src/components/marketing/motion/`)

- Add `framer-motion` dependency. **Use `LazyMotion` + the `m` component with the
  `domAnimation` feature set — NOT the full `motion` API.** This ships a tiny core
  and lazy-loads features, keeping the same `whileInView` / hover / `pathLength`
  vocabulary at a fraction of the initial JS. The landing page is the most
  perf/SEO-sensitive page (currently near-zero JS), so the bundle check (see
  Testing) must confirm the real delta, not assume the ~45kb full-API figure.
- **`Reveal.tsx`** — single reusable scroll-reveal primitive wrapping
  `m.div` with `whileInView`, `viewport={{ once: true, margin }}`, and an
  optional `stagger` prop for child sequencing. This is the single source of
  motion truth; sections compose it rather than hand-rolling variants.
- **SSR/prerender safety (critical invariant + concrete mechanism):**
  - The prerendered HTML must render complete and visible with JS disabled. The
    naive `whileInView` pattern bakes `initial={{ opacity: 0 }}` into the static
    HTML → blank sections for no-JS users and crawlers, defeating prerendering.
  - **Rule that satisfies both prerender-visible AND animate-in:**
    - **Above-the-fold (hero):** animate **on mount**. The hidden initial state
      is applied client-side only (after mount) — SSR ships the finished layout;
      the entrance plays once JS hydrates.
    - **Below-the-fold (everything reached by scroll):** use `whileInView`, but
      set the hidden state **after mount** (client-only). Because these sections
      are off-screen at load, applying hidden-then-reveal causes no visible
      flash, and SSR still ships them visible.
  - `prerender.mjs` keeps its fail-loud guards (title, root marker, non-empty
    HTML) **plus a new assertion that `marketing.html` contains the hero headline
    and each section's text with JS off.** Per advisor: write this assertion
    FIRST (TDD) so an `opacity: 0`-in-prerender regression cannot slip through.
- **Reduced motion:** respect `prefers-reduced-motion` via framer-motion's
  `useReducedMotion()`; reveal/parallax/SVG sequences collapse to their static
  final frame. Complements the existing CSS reduced-motion block.

### 2. Hero animated Stagger SVG (`Hero.tsx` + new `HeroGraphic.tsx`)

- New `HeroGraphic.tsx`: an inline SVG built from the **same four-rect geometry
  as `BrandMark`** (brand cohesion), scaled up into a hero composition.
- On load (client only): bars draw / stagger in (echoes the logo), then a subtle
  perpetual float and a faint playhead/cursor sweep across the gantt.
- `Hero.tsx` right column swaps `hero.png` → `HeroGraphic`. Headline + subhead +
  CTA buttons get a staggered fade-up on mount.
- `hero.png` is **not deleted** — it moves into the proof strip (see §4).

### 3. Story SVGs (`apps/web/src/components/marketing/motion/story/`)

Three lightweight animated SVGs, each revealed on scroll (via `Reveal`),
interleaved with the existing real screenshots in `ScreenshotStrip`:

- **`BoardToRoadmap.tsx`** — now/next/later cards slide and snap into gantt bars.
- **`DocsType.tsx`** — a markdown/PRD block "types" a few lines on reveal.
- **`CopilotPulse.tsx`** — spark/pulse motion on an idea-inbox glyph.

Each SVG sits adjacent to its corresponding real screenshot (`board.png`,
`roadmap.png`, `feature.png`): **SVG tells the story, PNG proves it's real.**
Exact placement (above / beside / as an entrance overlay for each strip row) is a
layout detail for the implementation plan.

### 4. Proof strip

The three real screenshots (`board.png`, `roadmap.png`, `feature.png`) plus the
relocated `hero.png` remain as the credibility layer — alternating slide-in
reveals with soft parallax on the framed images. Copy/eyebrows/bullets unchanged.

### 5. Branded feature icons (`FeatureHighlights.tsx`)

Replace the four lucide icons (Roadmap & horizons, Feature hub + docs, Releases,
AI copilot) with custom Stagger-family SVG icons. Each micro-animates on viewport
entry and on hover; cards also get a hover lift.

### 6. Section choreography summary

| Section | Motion |
|---|---|
| Hero | `HeroGraphic` draw-in + float + sweep; staggered headline/CTA fade-up |
| FeatureHighlights | staggered card reveal; custom icon entry + hover micro-motion + card lift |
| ScreenshotStrip + story SVGs | alternating slide-in; soft parallax on frames; story SVG reveals |
| EthosBand | reveal; optional subtle gradient shift |
| GitHubStars | count-up animation on the star number |
| Footer | static |

### 7. Dark mode parity

Verify every new SVG and motion treatment reads correctly against the existing
dark palette (`--pm-action` softens to `#8b83f5`). SVGs should reference theme
tokens / `currentColor` where practical rather than hardcoding, so both modes
stay correct.

## Out of scope (YAGNI)

- No layout, copy, section-order, or routing changes.
- No new sections.
- No visual-system rebuild (typography scale, new gradients/grain/depth beyond
  the optional Ethos gradient shift).
- No changes to the authenticated app shell.
- No logo/asset changes (already correct).
- No redeploy as part of this work (separate ops step once merged).

## Implementation sequencing (de-risk the subjective goal)

"Premium feel" lives in motion quality, which no text spec or screenshot can
verify — only the user's eyes on real motion. So the plan is sequenced to
calibrate early, before building everything:

1. Motion infra (`LazyMotion`/`m`, `Reveal`) + the **prerender text assertion
   first (TDD)**.
2. **Build the hero `HeroGraphic` SVG only**, wire it in, run the site.
3. **Checkpoint:** user reviews the actual hero motion; calibrate the motion
   language / pacing / intensity bar.
4. Only then build the two remaining story SVGs, branded feature icons, and the
   per-section choreography to the calibrated bar.

This avoids building 5+ animated components and discovering the motion language
isn't what the user pictured.

## Testing & verification

- **Prerender integrity:** after build, assert `dist/marketing.html` contains the
  hero headline and each section's text with JS off (extends existing
  `prerender.mjs` guards).
- **Hydration:** load the prerendered page and confirm no React hydration
  mismatch warnings in console.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, confirm all
  sections render their static final frame (no animation, no blank states).
- **Visual check:** Playwright screenshots of each section in light and dark mode.
- **Bundle:** measure the real gzip delta from `LazyMotion`/`m` (expected well
  under the ~45kb full-API figure); confirm it lazy-loads and does not regress
  first paint on the landing page.

## Components to create / modify

**Create:**
- `apps/web/src/components/marketing/motion/Reveal.tsx`
- `apps/web/src/components/marketing/motion/HeroGraphic.tsx`
- `apps/web/src/components/marketing/motion/story/BoardToRoadmap.tsx`
- `apps/web/src/components/marketing/motion/story/DocsType.tsx`
- `apps/web/src/components/marketing/motion/story/CopilotPulse.tsx`
- Custom feature-icon SVG components (4)

**Modify:**
- `apps/web/src/components/marketing/Hero.tsx`
- `apps/web/src/components/marketing/FeatureHighlights.tsx`
- `apps/web/src/components/marketing/ScreenshotStrip.tsx`
- `apps/web/src/components/marketing/EthosBand.tsx`
- `apps/web/src/components/marketing/GitHubStars.tsx`
- `apps/web/scripts/prerender.mjs` (add text-presence guard)
- `apps/web/package.json` (framer-motion)
