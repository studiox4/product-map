# Marketing Premium Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a premium motion + animated-SVG layer to the marketing landing (`productmap.x4.studio`) that tells the product story, keeping real screenshots as proof.

**Architecture:** `framer-motion` via `LazyMotion`/`m` (small bundle). A single SSR-safe `Reveal` primitive drives all scroll choreography. Custom animated SVGs (hero Stagger graphic + 3 story graphics + 4 feature icons) carry the narrative. Prerender stays JS-off-visible, guarded by a test written first.

**Tech Stack:** React 18, TypeScript, Tailwind, framer-motion (`LazyMotion` + `m` + `domAnimation`), Vitest + Testing Library, Vite SSR prerender.

## Global Constraints

- **Bundle:** import from `framer-motion` using `LazyMotion`, `m`, `domAnimation` ONLY. NEVER import the full `motion` component. The landing page is the most perf-sensitive page.
- **SSR-visible invariant:** the prerendered `render()` output (and `dist/marketing.html`) MUST contain all section text AND MUST NOT contain any `opacity:0` / `opacity: 0` inline style. Hidden initial states are applied client-side only, after mount.
  - Above-the-fold (hero): animate **on mount**.
  - Below-the-fold (scroll-reached): `whileInView`, hidden state set **after mount**.
- **Reduced motion:** every motion component honors `useReducedMotion()` → renders its static final frame (no animation, no blank state).
- **No layout/copy changes:** sections, order, copy, eyebrows, bullets unchanged. Motion + SVG + icon layer only.
- **Theme tokens:** SVGs reference theme colors via `currentColor` or the CSS vars `--pm-action` (`#4338ca` light / `#8b83f5` dark) and the Stagger pair `#4338CA` / `#6D63F0`. Verify both light and dark.
- **Test command:** `npm --prefix apps/web test` (Vitest, jsdom). Run from repo root.
- **Stagger geometry (canonical, reuse for hero):** four rects in a `0 0 120 120` viewBox:
  `(x18 y22 w66)`, `(x34 y44 w48)`, `(x18 y66 w38)`, `(x44 y88 w52)`, all `h14 rx7`; colors `#4338CA, #6D63F0, #4338CA, #6D63F0`.

---

### Task 1: SSR-visible regression guard (write the gate FIRST)

This test passes immediately (page has no motion yet) — it is the TDD guard that fails the moment a later task bakes `opacity:0` into the prerender.

**Files:**
- Test: `apps/web/src/routes/__tests__/marketing-ssr.test.tsx` (create)

**Interfaces:**
- Consumes: `render` from `@/entry-marketing`, `HERO_HEADLINE` from `@/lib/marketing`.
- Produces: nothing (guard only).

- [ ] **Step 1: Write the test**

```tsx
// apps/web/src/routes/__tests__/marketing-ssr.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@/entry-marketing';
import { HERO_HEADLINE } from '@/lib/marketing';

describe('marketing SSR/prerender output', () => {
  const html = render();

  it('ships the hero headline visible (text present in static HTML)', () => {
    expect(html).toContain(HERO_HEADLINE);
  });

  it('ships every section heading in the static HTML', () => {
    expect(html).toContain('The whole loop, in one place'); // ScreenshotStrip
    expect(html).toContain('Roadmap &amp; horizons'); // FeatureHighlights (HTML-escaped &)
  });

  it('never bakes a hidden initial state into the prerender', () => {
    // The framer-motion SSR trap: initial={{opacity:0}} renders inline
    // style="opacity:0" → blank for no-JS users and crawlers.
    expect(html).not.toMatch(/opacity:\s*0(?!\.)/);
  });
});
```

- [ ] **Step 2: Run it — expect PASS (guard in place)**

Run: `npm --prefix apps/web test -- marketing-ssr`
Expected: 3 passing. (If `render` import path differs, fix the import to match `entry-marketing.tsx`'s actual export — it exports `render`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/__tests__/marketing-ssr.test.tsx
git commit -m "test: guard marketing prerender stays JS-off-visible (no opacity:0)"
```

---

### Task 2: Motion foundation — LazyMotion provider + SSR-safe Reveal

**Files:**
- Create: `apps/web/src/components/marketing/motion/useEntrance.ts`
- Create: `apps/web/src/components/marketing/motion/MotionProvider.tsx`
- Create: `apps/web/src/components/marketing/motion/Reveal.tsx`
- Create: `apps/web/src/components/marketing/motion/__tests__/Reveal.test.tsx`
- Modify: `apps/web/src/routes/Marketing.tsx` (wrap in `MotionProvider`)
- Modify: `apps/web/package.json` (add framer-motion)

**Interfaces:**
- Produces:
  - `useEntrance(): boolean` — `false` during SSR + first client render, `true` after mount. Gate hidden initial states behind it.
  - `<MotionProvider>{children}</MotionProvider>` — wraps the tree in `LazyMotion` (`domAnimation`, `strict`).
  - `<Reveal as? delay? y? className?>{children}</Reveal>` — below-the-fold scroll reveal. Renders children visible during SSR; after mount, animates from `{opacity:0, y}` to `{opacity:1, y:0}` on `whileInView` (`once:true`). Collapses to static when reduced motion.

- [ ] **Step 1: Install framer-motion**

Run: `npm --prefix apps/web install framer-motion@^11`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the Reveal test**

```tsx
// apps/web/src/components/marketing/motion/__tests__/Reveal.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionProvider } from '../MotionProvider';
import { Reveal } from '../Reveal';

describe('Reveal', () => {
  it('renders its children (content is never gated away)', () => {
    render(
      <MotionProvider>
        <Reveal>
          <p>visible content</p>
        </Reveal>
      </MotionProvider>,
    );
    expect(screen.getByText('visible content')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test — expect FAIL (modules missing)**

Run: `npm --prefix apps/web test -- Reveal`
Expected: FAIL — cannot resolve `../MotionProvider` / `../Reveal`.

- [ ] **Step 4: Implement `useEntrance`**

```ts
// apps/web/src/components/marketing/motion/useEntrance.ts
import { useEffect, useState } from 'react';

/**
 * false during SSR and the first client render; true after mount.
 * Gate every hidden motion initial state behind this so the prerendered HTML
 * ships the FINAL, visible state (no opacity:0 baked in).
 */
export function useEntrance(): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);
  return entered;
}
```

- [ ] **Step 5: Implement `MotionProvider`**

```tsx
// apps/web/src/components/marketing/motion/MotionProvider.tsx
import { LazyMotion, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';

/** Wraps the marketing tree so `m.*` components lazy-load DOM animation
 *  features. Keeps the landing bundle small (no full `motion` import). */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
```

- [ ] **Step 6: Implement `Reveal`**

```tsx
// apps/web/src/components/marketing/motion/Reveal.tsx
import { m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useEntrance } from './useEntrance';

interface RevealProps {
  children: ReactNode;
  /** stagger offset in seconds */
  delay?: number;
  /** initial y offset in px */
  y?: number;
  className?: string;
}

/**
 * Below-the-fold scroll reveal. SSR-safe: until mount (useEntrance) the element
 * has NO hidden initial, so the prerender ships it visible. After mount it adopts
 * the hidden state and animates in on viewport entry. Reduced motion → static.
 */
export function Reveal({ children, delay = 0, y = 16, className }: RevealProps) {
  const entered = useEntrance();
  const reduce = useReducedMotion();

  if (!entered || reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
```

- [ ] **Step 7: Wrap Marketing in MotionProvider**

In `apps/web/src/routes/Marketing.tsx`, import `MotionProvider` and wrap the root `<div>`:

```tsx
import { MotionProvider } from '@/components/marketing/motion/MotionProvider';
// ...
export default function Marketing() {
  return (
    <MotionProvider>
      <div className="min-h-screen bg-background text-foreground">
        {/* ...existing nav/main/footer unchanged... */}
      </div>
    </MotionProvider>
  );
}
```

- [ ] **Step 8: Run tests — expect PASS (Reveal + SSR guard)**

Run: `npm --prefix apps/web test -- Reveal marketing-ssr`
Expected: all passing. The SSR guard must still pass (Reveal renders bare `<div>` during SSR → no `opacity:0`).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/marketing/motion apps/web/src/routes/Marketing.tsx apps/web/package.json apps/web/package-lock.json
git commit -m "feat: SSR-safe motion foundation (LazyMotion provider + Reveal)"
```

---

### Task 3: Animated Stagger hero graphic — CALIBRATION CHECKPOINT

Build ONLY the hero graphic, wire it, then stop for the user to judge real motion before building the rest (per spec sequencing).

**Files:**
- Create: `apps/web/src/components/marketing/motion/HeroGraphic.tsx`
- Create: `apps/web/src/components/marketing/motion/__tests__/HeroGraphic.test.tsx`
- Modify: `apps/web/src/components/marketing/Hero.tsx`
- Modify: `apps/web/src/components/marketing/ScreenshotStrip.tsx` (add hero.png as a 4th proof row — optional; see Step 6)

**Interfaces:**
- Consumes: `useEntrance`, `m`, `useReducedMotion`.
- Produces: `<HeroGraphic className? />` — self-contained animated SVG; renders the four Stagger bars visible during SSR, animates draw-in + float on mount.

- [ ] **Step 1: Write the test**

```tsx
// apps/web/src/components/marketing/motion/__tests__/HeroGraphic.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../MotionProvider';
import { HeroGraphic } from '../HeroGraphic';

describe('HeroGraphic', () => {
  it('renders four Stagger bars as SVG rects', () => {
    const { container } = render(
      <MotionProvider>
        <HeroGraphic />
      </MotionProvider>,
    );
    expect(container.querySelectorAll('rect').length).toBe(4);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (HeroGraphic missing)**

Run: `npm --prefix apps/web test -- HeroGraphic`
Expected: FAIL — cannot resolve `../HeroGraphic`.

- [ ] **Step 3: Implement HeroGraphic (starter motion — calibrate at checkpoint)**

```tsx
// apps/web/src/components/marketing/motion/HeroGraphic.tsx
import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from './useEntrance';

const BARS = [
  { x: 18, y: 22, w: 66, fill: '#4338CA' },
  { x: 34, y: 44, w: 48, fill: '#6D63F0' },
  { x: 18, y: 66, w: 38, fill: '#4338CA' },
  { x: 44, y: 88, w: 52, fill: '#6D63F0' },
] as const;

/**
 * Hero centerpiece. Same four-rect Stagger geometry as BrandMark, scaled up.
 * SSR ships the bars fully visible (no hidden initial until mount); on mount the
 * bars stagger/draw in via scaleX from the left, then breathe. Reduced motion →
 * static bars.
 */
export function HeroGraphic({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="Animated ProductMap roadmap bars"
    >
      {BARS.map((b, i) => (
        <m.rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={14}
          rx={7}
          fill={b.fill}
          style={{ transformOrigin: `${b.x}px ${b.y + 7}px` }}
          initial={animate ? { scaleX: 0, opacity: 0 } : false}
          animate={
            animate
              ? { scaleX: 1, opacity: 1, y: [0, -1.5, 0] }
              : undefined
          }
          transition={{
            scaleX: { duration: 0.5, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: 0.3, delay: 0.12 * i },
            y: { duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
          }}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm --prefix apps/web test -- HeroGraphic`
Expected: PASS (4 rects).

- [ ] **Step 5: Wire HeroGraphic into Hero, relocate hero.png**

Replace the hero right column `<div>...img.../div>` in `apps/web/src/components/marketing/Hero.tsx`:

```tsx
import { HeroGraphic } from '@/components/marketing/motion/HeroGraphic';
// ...
      {/* right column */}
      <div className="relative mx-auto w-full max-w-md md:max-w-none">
        <HeroGraphic className="h-auto w-full" />
      </div>
```

- [ ] **Step 6: Add hero.png to the proof strip**

In `apps/web/src/components/marketing/ScreenshotStrip.tsx`, append a row to `ROWS` so the real screenshot is kept as proof. Use existing copy fields:

```tsx
  {
    src: '/marketing/hero.png',
    alt: 'ProductMap overview dashboard',
    icon: Boxes,
    eyebrow: 'Overview',
    title: 'Everything, at a glance',
    body: 'The dashboard pulls your board, roadmap, and docs into one overview — the same product you saw up top, real and self-hosted.',
    points: ['Unified overview', 'Self-hosted', 'Your data'],
  },
```

(Confirm `Boxes` is already imported in ScreenshotStrip — it is.)

- [ ] **Step 7: Run full marketing tests + build**

Run: `npm --prefix apps/web test -- marketing-ssr HeroGraphic Reveal`
Expected: all pass (SSR guard confirms no `opacity:0` baked in — HeroGraphic uses `initial={false}` during SSR).
Run: `npm --prefix apps/web run build`
Expected: build + prerender succeed; `[prerender] wrote .../marketing.html`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/marketing/motion/HeroGraphic.tsx apps/web/src/components/marketing/motion/__tests__/HeroGraphic.test.tsx apps/web/src/components/marketing/Hero.tsx apps/web/src/components/marketing/ScreenshotStrip.tsx
git commit -m "feat: animated Stagger hero graphic; hero.png moves to proof strip"
```

- [ ] **Step 9: CHECKPOINT — user reviews real hero motion**

Run the site (`npm --prefix apps/web run dev`), screenshot/scroll the hero. STOP and get the user's eyes on the actual motion. Capture their calibration notes (pacing, intensity, draw vs. fade, float amount) and apply them to `HeroGraphic` before continuing. The motion language locked here sets the bar for Tasks 4–7.

---

### Task 4: Story SVG — Board → Roadmap

**Files:**
- Create: `apps/web/src/components/marketing/motion/story/BoardToRoadmap.tsx`
- Create: `apps/web/src/components/marketing/motion/story/__tests__/BoardToRoadmap.test.tsx`
- Modify: `apps/web/src/components/marketing/ScreenshotStrip.tsx` (render the SVG as an entrance accent on row 1)

**Interfaces:**
- Produces: `<BoardToRoadmap className? />` — SVG: three small cards (left) that slide and snap into three gantt bars (right) on viewport entry. SSR-visible final frame; reduced-motion static.

- [ ] **Step 1: Write the test**

```tsx
// apps/web/src/components/marketing/motion/story/__tests__/BoardToRoadmap.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { BoardToRoadmap } from '../BoardToRoadmap';

describe('BoardToRoadmap', () => {
  it('renders an svg with the three roadmap bars', () => {
    const { container } = render(
      <MotionProvider>
        <BoardToRoadmap />
      </MotionProvider>,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('[data-bar]').length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm --prefix apps/web test -- BoardToRoadmap`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement BoardToRoadmap**

```tsx
// apps/web/src/components/marketing/motion/story/BoardToRoadmap.tsx
import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

const ROWS = [
  { y: 20, fromX: 8, toX: 52, w: 56, fill: '#4338CA' },
  { y: 44, fromX: 8, toX: 68, w: 40, fill: '#6D63F0' },
  { y: 68, fromX: 8, toX: 44, w: 64, fill: '#4338CA' },
] as const;

/**
 * Story graphic: three "cards" on the left slide right and snap into gantt bars,
 * illustrating board → roadmap. SSR ships bars in their final (roadmap) position;
 * animation only runs client-side after mount, on viewport entry.
 */
export function BoardToRoadmap({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg viewBox="0 0 140 96" className={className} role="img" aria-label="Board turning into a roadmap">
      {/* timeline gridlines */}
      <line x1="48" y1="6" x2="48" y2="90" stroke="currentColor" strokeOpacity="0.12" />
      <line x1="92" y1="6" x2="92" y2="90" stroke="currentColor" strokeOpacity="0.12" />
      {ROWS.map((r, i) => (
        <m.rect
          key={i}
          data-bar
          y={r.y}
          height={14}
          width={r.w}
          rx={7}
          fill={r.fill}
          initial={animate ? { x: r.fromX, opacity: 0.6 } : false}
          whileInView={animate ? { x: r.toX, opacity: 1 } : undefined}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          x={animate ? undefined : r.toX}
          transition={{ duration: 0.55, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm --prefix apps/web test -- BoardToRoadmap`
Expected: PASS.

- [ ] **Step 5: Place it on row 1 of the strip**

In `ScreenshotStrip.tsx`, render `BoardToRoadmap` as a small accent above the row-1 figure (only for the `board.png` row). Simplest: a per-row optional `accent` and render it. Add to the row object: `accent: 'board'` on row 1, then in the map:

```tsx
import { BoardToRoadmap } from '@/components/marketing/motion/story/BoardToRoadmap';
// inside the figure, above <img>, when row.accent === 'board':
{accent === 'board' && (
  <BoardToRoadmap className="mb-2 h-16 w-full text-ink/70" />
)}
```

- [ ] **Step 6: Run tests + commit**

Run: `npm --prefix apps/web test -- marketing-ssr BoardToRoadmap`
Expected: pass (SSR guard green).

```bash
git add apps/web/src/components/marketing/motion/story apps/web/src/components/marketing/ScreenshotStrip.tsx
git commit -m "feat: board-to-roadmap story SVG on the prioritize row"
```

---

### Task 5: Story SVGs — DocsType + CopilotPulse

**Files:**
- Create: `apps/web/src/components/marketing/motion/story/DocsType.tsx`
- Create: `apps/web/src/components/marketing/motion/story/CopilotPulse.tsx`
- Create: `apps/web/src/components/marketing/motion/story/__tests__/DocsType.test.tsx`
- Create: `apps/web/src/components/marketing/motion/story/__tests__/CopilotPulse.test.tsx`
- Modify: `apps/web/src/components/marketing/ScreenshotStrip.tsx` (accents on the Document row + add CopilotPulse near AI copy)

**Interfaces:**
- Produces:
  - `<DocsType className? />` — SVG doc with lines that "type in" (width grows) on entry.
  - `<CopilotPulse className? />` — SVG spark/pulse glyph that pulses.

- [ ] **Step 1: Write both tests**

```tsx
// apps/web/src/components/marketing/motion/story/__tests__/DocsType.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { DocsType } from '../DocsType';

describe('DocsType', () => {
  it('renders typed doc lines', () => {
    const { container } = render(
      <MotionProvider><DocsType /></MotionProvider>,
    );
    expect(container.querySelectorAll('[data-line]').length).toBeGreaterThanOrEqual(3);
  });
});
```

```tsx
// apps/web/src/components/marketing/motion/story/__tests__/CopilotPulse.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { CopilotPulse } from '../CopilotPulse';

describe('CopilotPulse', () => {
  it('renders a spark glyph', () => {
    const { container } = render(
      <MotionProvider><CopilotPulse /></MotionProvider>,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm --prefix apps/web test -- DocsType CopilotPulse`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement DocsType**

```tsx
// apps/web/src/components/marketing/motion/story/DocsType.tsx
import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

const LINES = [
  { y: 14, full: 84 },
  { y: 28, full: 64 },
  { y: 42, full: 78 },
  { y: 56, full: 48 },
] as const;

/** A PRD/markdown block whose lines "type in" (width grows) on viewport entry. */
export function DocsType({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg viewBox="0 0 110 72" className={className} role="img" aria-label="Markdown doc being written">
      <rect x="6" y="4" width="98" height="64" rx="6" fill="currentColor" fillOpacity="0.04" />
      {LINES.map((l, i) => (
        <m.rect
          key={i}
          data-line
          x={14}
          y={l.y}
          height={6}
          rx={3}
          fill="currentColor"
          fillOpacity={0.35}
          width={animate ? undefined : l.full}
          initial={animate ? { width: 0 } : false}
          whileInView={animate ? { width: l.full } : undefined}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          transition={{ duration: 0.4, delay: 0.15 * i, ease: 'easeOut' }}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Implement CopilotPulse**

```tsx
// apps/web/src/components/marketing/motion/story/CopilotPulse.tsx
import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

/** Four-point spark that pulses — the AI copilot accent. */
export function CopilotPulse({ className }: { className?: string }) {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  const animate = entered && !reduce;

  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="AI copilot spark">
      <m.path
        d="M24 6 L28 20 L42 24 L28 28 L24 42 L20 28 L6 24 L20 20 Z"
        fill="#6D63F0"
        style={{ transformOrigin: '24px 24px' }}
        initial={animate ? { scale: 0.8, opacity: 0.7 } : false}
        animate={animate ? { scale: [0.9, 1.06, 0.9], opacity: [0.8, 1, 0.8] } : undefined}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  );
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm --prefix apps/web test -- DocsType CopilotPulse`
Expected: PASS.

- [ ] **Step 6: Place DocsType on the Document row**

In `ScreenshotStrip.tsx`, set `accent: 'docs'` on the `feature.png` row and render in the figure:

```tsx
import { DocsType } from '@/components/marketing/motion/story/DocsType';
// when accent === 'docs':
{accent === 'docs' && <DocsType className="mb-2 h-14 w-full text-ink/70" />}
```

(CopilotPulse is wired in Task 6 alongside the AI copilot feature icon, where it belongs semantically.)

- [ ] **Step 7: Run tests + commit**

Run: `npm --prefix apps/web test -- marketing-ssr DocsType CopilotPulse`
Expected: pass.

```bash
git add apps/web/src/components/marketing/motion/story apps/web/src/components/marketing/ScreenshotStrip.tsx
git commit -m "feat: docs-type and copilot-pulse story SVGs"
```

---

### Task 6: Branded feature icons replace lucide

**Files:**
- Create: `apps/web/src/components/marketing/motion/icons/FeatureIcons.tsx`
- Create: `apps/web/src/components/marketing/motion/icons/__tests__/FeatureIcons.test.tsx`
- Modify: `apps/web/src/components/marketing/FeatureHighlights.tsx`

**Interfaces:**
- Produces: four components `<RoadmapIcon/>`, `<DocsIcon/>`, `<ReleasesIcon/>`, `<CopilotIcon/>`, each `(props: { className?: string })`, Stagger-family SVGs that micro-animate on viewport entry + hover. `CopilotIcon` reuses the `CopilotPulse` spark visual language.

- [ ] **Step 1: Write the test**

```tsx
// apps/web/src/components/marketing/motion/icons/__tests__/FeatureIcons.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { RoadmapIcon, DocsIcon, ReleasesIcon, CopilotIcon } from '../FeatureIcons';

describe('FeatureIcons', () => {
  it('each icon renders an svg', () => {
    for (const Icon of [RoadmapIcon, DocsIcon, ReleasesIcon, CopilotIcon]) {
      const { container } = render(<MotionProvider><Icon /></MotionProvider>);
      expect(container.querySelector('svg')).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm --prefix apps/web test -- FeatureIcons`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement FeatureIcons**

```tsx
// apps/web/src/components/marketing/motion/icons/FeatureIcons.tsx
import { m, useReducedMotion } from 'framer-motion';
import { useEntrance } from '../useEntrance';

type IconProps = { className?: string };

function useIconAnimate() {
  const entered = useEntrance();
  const reduce = useReducedMotion();
  return entered && !reduce;
}

const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };

/** Roadmap & horizons — three stagger bars drawing in. */
export function RoadmapIcon({ className }: IconProps) {
  const animate = useIconAnimate();
  const bars = [
    { y: 5, x: 3, w: 14 },
    { y: 11, x: 7, w: 12 },
    { y: 17, x: 3, w: 9 },
  ];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {bars.map((b, i) => (
        <m.rect
          key={i} x={b.x} y={b.y} width={b.w} height={3} rx={1.5} fill="currentColor"
          style={{ transformOrigin: `${b.x}px ${b.y + 1.5}px` }}
          initial={animate ? { scaleX: 0 } : false}
          whileInView={animate ? { scaleX: 1 } : undefined}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </svg>
  );
}

/** Feature hub + docs — a page with lines. */
export function DocsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" {...stroke} />
      <line x1="8" y1="8" x2="16" y2="8" {...stroke} />
      <line x1="8" y1="12" x2="16" y2="12" {...stroke} />
      <line x1="8" y1="16" x2="13" y2="16" {...stroke} />
    </svg>
  );
}

/** Releases — a tag/ship glyph that nudges on hover (handled by parent group-hover). */
export function ReleasesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M4 4 L13 4 L20 11 L13 18 L4 18 Z" {...stroke} />
      <circle cx="8.5" cy="11" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** AI copilot — pulsing spark (same language as CopilotPulse). */
export function CopilotIcon({ className }: IconProps) {
  const animate = useIconAnimate();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <m.path
        d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"
        fill="currentColor"
        style={{ transformOrigin: '12px 12px' }}
        initial={animate ? { scale: 0.85, opacity: 0.7 } : false}
        animate={animate ? { scale: [0.95, 1.05, 0.95], opacity: [0.85, 1, 0.85] } : undefined}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm --prefix apps/web test -- FeatureIcons`
Expected: PASS.

- [ ] **Step 5: Swap icons in FeatureHighlights**

In `apps/web/src/components/marketing/FeatureHighlights.tsx`, replace the lucide import + `CARDS` icon refs with the new icons and add a group-hover lift. Full new file:

```tsx
import { RoadmapIcon, DocsIcon, ReleasesIcon, CopilotIcon } from '@/components/marketing/motion/icons/FeatureIcons';
import { Reveal } from '@/components/marketing/motion/Reveal';

const CARDS = [
  { Icon: RoadmapIcon, title: 'Roadmap & horizons', body: 'Now-next-later board and a Gantt roadmap that keep dates, sizes, and priorities honest.' },
  { Icon: DocsIcon, title: 'Feature hub + docs', body: 'Every feature carries its PRDs, briefs, and tech specs in a markdown editor that is yours.' },
  { Icon: ReleasesIcon, title: 'Releases', body: 'Group features into releases, track status, and ship release notes without leaving the workspace.' },
  { Icon: CopilotIcon, title: 'AI copilot', body: 'Draft docs, summarize activity, and triage the idea inbox with an AI copilot you can point at your own model.' },
] as const;

export default function FeatureHighlights() {
  return (
    <section className="mx-auto max-w-screen-xl px-6 py-16">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ Icon, title, body }, i) => (
          <Reveal key={title} delay={0.08 * i}>
            <div className="group h-full rounded-xl border border-border bg-card p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md">
              <Icon className="h-6 w-6 text-action transition-transform duration-300 group-hover:scale-110" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run tests + build + commit**

Run: `npm --prefix apps/web test -- marketing-ssr FeatureIcons`
Expected: pass (SSR guard green — icons use `initial={false}` server-side).
Run: `npm --prefix apps/web run build`
Expected: build + prerender succeed.

```bash
git add apps/web/src/components/marketing/motion/icons apps/web/src/components/marketing/FeatureHighlights.tsx
git commit -m "feat: branded animated feature icons replace lucide on highlights"
```

---

### Task 7: Section choreography — strip reveals/parallax, ethos, stars count-up

**Files:**
- Modify: `apps/web/src/components/marketing/ScreenshotStrip.tsx`
- Modify: `apps/web/src/components/marketing/EthosBand.tsx`
- Modify: `apps/web/src/components/marketing/GitHubStars.tsx`
- Create: `apps/web/src/components/marketing/motion/CountUp.tsx`
- Create: `apps/web/src/components/marketing/motion/__tests__/CountUp.test.tsx`

**Interfaces:**
- Produces: `<CountUp value={number} />` — renders the final number as text immediately (SSR/first-render safe); after mount animates from 0 → value. Reduced motion → final number only.

- [ ] **Step 1: Wrap strip rows + heading in Reveal**

In `ScreenshotStrip.tsx`, wrap the centered heading block and each row `<div>` in `<Reveal>`. For the framed `<figure>`, add a gentle parallax-style entrance by giving the image a `Reveal` with a larger `y`:

```tsx
import { Reveal } from '@/components/marketing/motion/Reveal';
// heading:
<Reveal><div className="mx-auto mb-14 max-w-2xl text-center md:mb-20"> ... </div></Reveal>
// each row: wrap the row <div> in <Reveal delay={0.05 * i}> ... </Reveal>
// figure: keep as-is or wrap <figure> in <Reveal y={28}>
```

- [ ] **Step 2: Wrap EthosBand items in Reveal**

In `apps/web/src/components/marketing/EthosBand.tsx`, wrap the 4-column items so they stagger-reveal:

```tsx
import { Reveal } from '@/components/marketing/motion/Reveal';
// wrap each column item: <Reveal delay={0.08 * i}> ...item... </Reveal>
```

(Read the file first; preserve existing classes/structure, only insert the wrapper.)

- [ ] **Step 3: Write CountUp test**

```tsx
// apps/web/src/components/marketing/motion/__tests__/CountUp.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CountUp } from '../CountUp';

describe('CountUp', () => {
  it('renders the final value as text on first render (SSR-safe)', () => {
    render(<CountUp value={1234} />);
    expect(screen.getByText('1,234')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run test — expect FAIL**

Run: `npm --prefix apps/web test -- CountUp`
Expected: FAIL — module missing.

- [ ] **Step 5: Implement CountUp**

```tsx
// apps/web/src/components/marketing/motion/CountUp.tsx
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Renders `value` as a localized integer. On first render (and SSR) it shows the
 * FINAL value (so nothing flashes 0 in prerender / no-JS). After mount, if motion
 * is allowed, it briefly counts up from 0 → value.
 */
export function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    setDisplay(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  return <>{display.toLocaleString('en-US')}</>;
}
```

- [ ] **Step 6: Use CountUp in GitHubStars**

In `apps/web/src/components/marketing/GitHubStars.tsx`, replace `{stars.toLocaleString('en-US')}` with `<CountUp value={stars} />` and import it. (GitHubStars is already mount-gated, so this only ever runs client-side.)

- [ ] **Step 7: Run tests + build**

Run: `npm --prefix apps/web test`
Expected: full suite passes.
Run: `npm --prefix apps/web run build`
Expected: build + prerender succeed.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/marketing
git commit -m "feat: scroll choreography for strip/ethos + star count-up"
```

---

### Task 8: Dark-mode parity + final verification

**Files:**
- Modify (as needed): any SVG using a hardcoded fill that fails in dark mode → switch to `currentColor` or a theme var.
- Test: manual + Playwright screenshots.

- [ ] **Step 1: Full test suite**

Run: `npm --prefix apps/web test`
Expected: all green, including `marketing-ssr` (no `opacity:0` baked anywhere).

- [ ] **Step 2: Production build + prerender integrity**

Run: `npm --prefix apps/web run build`
Expected: `[prerender] wrote .../marketing.html`. Then grep the output:

Run: `grep -c "opacity:0" apps/web/dist/marketing.html || echo "0 matches (good)"`
Expected: 0 matches.
Run: `grep -q "Your product roadmap" apps/web/dist/marketing.html && echo "headline present"`
Expected: `headline present`.

- [ ] **Step 3: Visual check — light + dark, reduced motion**

Serve the build and screenshot with Playwright at desktop + mobile widths, in light and dark, plus one run with `prefers-reduced-motion: reduce`. Confirm: hero bars + all SVGs read correctly in dark mode (the Stagger `#4338CA`/`#6D63F0` and `currentColor` glyphs have contrast); reduced-motion shows static final frames with no blank sections.

- [ ] **Step 4: Bundle delta**

Inspect the build output sizes for the marketing chunk; confirm the framer-motion (`LazyMotion`) addition is well under the ~45kb full-API figure and lazy-loaded. Note the measured number in the commit message.

- [ ] **Step 5: Fix any dark-mode/contrast issues found**, re-run Step 1–2, then commit.

```bash
git add apps/web
git commit -m "fix: dark-mode parity + verify prerender/bundle for motion redesign"
```

- [ ] **Step 6: Finish the branch** — invoke `superpowers:finishing-a-development-branch` to choose merge/PR. After merge, redeploy (`productmap.x4.studio` + Railway demo) so the premium site goes live.

---

## Self-Review

**Spec coverage:**
- Motion infra (LazyMotion/m, Reveal, SSR rule) → Tasks 1, 2. ✓
- Animated Stagger hero SVG + hero.png → proof → Task 3. ✓
- Three story SVGs → Tasks 4, 5. ✓
- Branded feature icons → Task 6. ✓
- Section choreography (strip parallax, ethos reveal, stars count-up) → Task 7. ✓
- Dark mode parity → Task 8. ✓
- Prerender text/`opacity:0` assertion written FIRST → Task 1. ✓
- Hero-first calibration checkpoint → Task 3 Step 9. ✓
- Reduced motion in every component → built into each component via `useReducedMotion`. ✓
- Bundle measured → Task 8 Step 4. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. Step 6/Task 7 inserts (EthosBand) say "read file first, preserve structure" because the band's exact markup wasn't captured — flagged explicitly, not a silent placeholder.

**Type consistency:** `useEntrance(): boolean`, `Reveal` props (`delay`,`y`,`className`), icon component names (`RoadmapIcon`/`DocsIcon`/`ReleasesIcon`/`CopilotIcon`), `CountUp({value})`, story component names (`BoardToRoadmap`/`DocsType`/`CopilotPulse`) consistent across tasks. ✓
