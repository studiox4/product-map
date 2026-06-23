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

## Architecture

### 1. Motion infrastructure (`apps/web/src/components/marketing/motion/`)

- Add `framer-motion` dependency.
- **`Reveal.tsx`** — single reusable scroll-reveal primitive wrapping
  `motion.div` with `whileInView`, `viewport={{ once: true, margin }}`, and an
  optional `stagger` prop for child sequencing. This is the single source of
  motion truth; sections compose it rather than hand-rolling variants.
- **SSR/prerender safety (critical invariant):**
  - Motion components must render their **final, visible** state during SSR —
    never an `opacity: 0` / offset initial that would ship a blank prerender.
    Use the framer-motion `initial={false}`-style gating, or a `mounted` flag
    that starts `true` on the server and only enables entrance animation after
    client mount. Net effect: JS-off prerender shows the finished layout;
    JS-on animates in.
  - `prerender.mjs` must continue to pass its fail-loud guards (title, root
    marker, non-empty HTML). Add a check after implementation that the rendered
    `marketing.html` contains the hero/section text (not just empty motion
    wrappers).
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

## Testing & verification

- **Prerender integrity:** after build, assert `dist/marketing.html` contains the
  hero headline and each section's text with JS off (extends existing
  `prerender.mjs` guards).
- **Hydration:** load the prerendered page and confirm no React hydration
  mismatch warnings in console.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, confirm all
  sections render their static final frame (no animation, no blank states).
- **Visual check:** Playwright screenshots of each section in light and dark mode.
- **Bundle:** confirm the framer-motion addition is within the expected ~45kb
  gzip and lazy/code-split where it doesn't regress first paint.

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
