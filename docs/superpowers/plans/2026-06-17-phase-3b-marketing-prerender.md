# Phase 3B — Marketing Landing + Prerender + Production Serving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/` route (currently a redirect to `/app`) with a crawlable, prerendered marketing landing page, and add a minimal production static-serving path in the API so a single self-hosted process serves the prerendered `/` plus the SPA.

**Architecture:** A purely presentational `Marketing.tsx` (no router hooks, no react-query, no providers) is mounted at `/` inside `BrowserRouter` but OUTSIDE the auth-gated subtree, so the client SPA renders it with no providers and an SSR pass prerenders it with no hydration mismatch. A dedicated SSR entry built via `vite build --ssr` is `renderToString`-ed by a post-build script that injects the markup plus Open Graph/Twitter meta into a copy of the built `index.html`, written to a **separate** `dist/marketing.html` (the untouched `dist/index.html` stays the SPA shell). The API gains a static handler (active only when a built `dist/` is present) that, after `/api/*` and `/uploads/*`, serves `dist/marketing.html` for exact `GET /`, serves built assets, and history-fallbacks other GETs to the SPA shell.

**Tech Stack:** Vite 5 + React 18 (`react-dom/server` `renderToString`, already available — no new dep), Hono + `@hono/node-server/serve-static` (already a dep), Vitest + jsdom + msw (web unit/routing), Vitest (api serving), Playwright (e2e).

---

## Dependency on Phase 3A (READ FIRST)

This plan **requires Phase 3A to be merged**. Phase 3A migrates the app under `/app/*` and leaves `/` as a redirect — the post-3A `App.tsx` has:

```tsx
<Route path="/" element={<Navigate to="/app" replace />} />
```

…with the `RequireAuth → ActiveProjectProvider → AuthedShell` subtree mounted at `/app/*`, and the public routes `/login`, `/register`, `/share/:token`, `/invite/:token` unprefixed. **This plan replaces that `/` redirect with `<Marketing/>`.**

> **WARNING for the controller:** the working tree at drafting time is still **pre-3A** (`App.tsx` mounts `<Landing>` at `/` inside `RequireAuth`, routes are unprefixed). Do NOT execute this plan until 3A has landed and `App.tsx` matches the post-3A shape above. Because the exact post-3A `App.tsx` text cannot be quoted verbatim here, **Task 9 is structured as read-then-edit**: Step 1 reads the file and locates the `/` route element; Step 2 swaps it. Do not pre-bake a brittle `old_string` anchor.

---

## File Structure

### Created (web)

| Path | Responsibility |
| --- | --- |
| `apps/web/src/lib/marketing.ts` | SINGLE source of repo + site constants: `REPO_OWNER`, `REPO_NAME`, `REPO_URL`, `GITHUB_API_URL`, `MARKETING_SITE_URL`, `STARS_FALLBACK`, plus hero/meta copy constants reused by both the page and the prerender script. |
| `apps/web/src/components/marketing/MarketingNav.tsx` | Top nav: logo, auth-adaptive link (bare `fetch('/api/auth/me')`, default "Sign in", upgrades to "Open app"→`/app`), GitHub link. |
| `apps/web/src/components/marketing/Hero.tsx` | Split hero: headline/subhead/CTAs left ("Deploy your own"→`REPO_URL`, "Sign in"→`/login`), framed screenshot right. |
| `apps/web/src/components/marketing/FeatureHighlights.tsx` | 4 feature cards (roadmap & horizons, feature hub + docs, releases, AI copilot). |
| `apps/web/src/components/marketing/ScreenshotStrip.tsx` | Framed static images from `public/marketing/`. |
| `apps/web/src/components/marketing/EthosBand.tsx` | Offline / air-gapped / markdown-is-yours / license callouts. |
| `apps/web/src/components/marketing/GitHubStars.tsx` | Mount-gated star count from `GITHUB_API_URL`; static `STARS_FALLBACK` on reject; renders `null` until mounted so it is excluded from prerendered HTML. |
| `apps/web/src/components/marketing/MarketingFooter.tsx` | GitHub, docs, license, "powered by ProductMap". |
| `apps/web/src/routes/Marketing.tsx` | Presentational page composing the sections above. No router hooks, no react-query, no providers. |
| `apps/web/src/entry-marketing.tsx` | SSR entry: exports `render()` returning the `renderToString`-ed Marketing markup. Built via `vite build --ssr`. |
| `apps/web/scripts/prerender.mjs` | Post-build: imports the SSR bundle, calls `render()`, injects markup + OG/Twitter meta into a copy of built `index.html`, writes `dist/marketing.html`. |
| `apps/web/public/marketing/og-cover.png` | Committed OG image (static asset). Placeholder PNG created in Task 1. |
| `apps/web/public/marketing/board.png`, `roadmap.png`, `feature.png`, `hero.png` | Committed screenshot assets (placeholder PNGs in Task 1). |
| `apps/web/src/lib/marketing.test.ts` | Constants module test. |
| `apps/web/src/components/marketing/*.test.tsx` | Per-section unit tests. |
| `apps/web/src/routes/Marketing.test.tsx` | Marketing renders all sections, no providers. |
| `apps/web/src/App.marketing.test.tsx` | Routing test: `/` renders Marketing without providers; `/app/*` gated; share/invite public. |
| `apps/web/scripts/prerender.test.ts` | Build-output test: `dist/marketing.html` contains hero text + OG tags. |
| `apps/api/src/serve-web.test.ts` | API serving test. |
| `e2e/marketing.spec.ts` | Logged-out `/` shows hero + Deploy CTA; Sign in → `/login`. |

### Modified

| Path | Change |
| --- | --- |
| `apps/web/package.json` | `build` script runs `tsc` → `vite build` → `vite build --ssr` → `node scripts/prerender.mjs`. Add `prerender` helper script. |
| `apps/web/src/App.tsx` | Replace `/`'s `<Navigate to="/app">` with `<Marketing/>` in Suspense (read-then-edit; Task 9). |
| `apps/api/src/serve-web.ts` (created) + `apps/api/src/index.ts` | New static handler module, mounted in `index.ts` after `/uploads/*`, gated on `dist/` presence + `SERVE_WEB`. |

---

## Task 0: Reconcile Tailwind tokens (pre-step — BLOCKING for visual correctness)

**Why:** Tailwind silently emits NO CSS for an unknown utility class — `tsc`, `build`, and role/text/href tests all stay green while the page renders unstyled. The marketing component code blocks in Tasks 2–8 below were drafted with a MIX of real and possibly-undefined tokens. Before writing any section, pin the real token set so the page is actually styled.

**Files:**
- Read only: `apps/web/tailwind.config.*` (or the `@theme`/CSS-vars in `apps/web/src/index.css` / `globals.css`), `apps/web/src/routes/Login.tsx`, `apps/web/src/routes/Landing.tsx`, `apps/web/src/components/AppShell.tsx`, `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/card.tsx`.

- [ ] **Step 1: Enumerate the real tokens.** Read the config + the styled components above. Confirmed-present tokens (used across the app today): `bg-surface`, `text-ink`, `text-action`, `text-muted-foreground`. Determine whether each of these — used in the Task 2–8 drafts — actually exists: `bg-card`, `bg-background`, `text-foreground`, `border-border`, `bg-muted`/`bg-muted/30`. These are shadcn defaults that may NOT be defined here.

- [ ] **Step 2: Build the substitution map.** For every drafted token that does NOT exist in the config, map it to the nearest real one (likely: `bg-background`→the app's page background, `bg-card`→`bg-surface`, `text-foreground`→`text-ink`, `border-border`→the app's real border token, `bg-muted/30`→the app's real subtle-surface token). Record the map at the top of your work; apply it to EVERY className in Tasks 2–8 as you write them (do not paste the drafted classes verbatim if they reference an undefined token).

- [ ] **Step 3: No commit** (read-only reconciliation). Proceed to Task 1 with the verified token set in hand.

---

## Task 1: Marketing constants module + static assets

> **CONFIRM-WITH-CONTROLLER constants:** `MARKETING_SITE_URL` (`https://productmap.studiox4.dev`) is a PLACEHOLDER baked into OG meta, and `HERO_HEADLINE`/`HERO_SUBHEAD` are draft copy. The controller confirms the real values before/at execution; both are one-line edits in `marketing.ts`. Do not treat the drafted strings as final.

**Files:**
- Create: `apps/web/src/lib/marketing.ts`
- Create: `apps/web/src/lib/marketing.test.ts`
- Create: `apps/web/public/marketing/{og-cover,board,roadmap,feature,hero}.png` (placeholders)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/marketing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  REPO_OWNER,
  REPO_NAME,
  REPO_URL,
  GITHUB_API_URL,
  MARKETING_SITE_URL,
  STARS_FALLBACK,
  HERO_HEADLINE,
  META_TITLE,
  META_DESCRIPTION,
  OG_IMAGE_PATH,
} from './marketing';

describe('marketing constants', () => {
  it('points REPO_URL at studiox4/product-map on github.com', () => {
    expect(REPO_OWNER).toBe('studiox4');
    expect(REPO_NAME).toBe('product-map');
    expect(REPO_URL).toBe('https://github.com/studiox4/product-map');
  });

  it('derives the GitHub API URL from owner/name', () => {
    expect(GITHUB_API_URL).toBe('https://api.github.com/repos/studiox4/product-map');
  });

  it('uses an absolute canonical site URL with no trailing slash', () => {
    expect(MARKETING_SITE_URL).toMatch(/^https:\/\//);
    expect(MARKETING_SITE_URL.endsWith('/')).toBe(false);
  });

  it('exposes a numeric stars fallback for air-gapped instances', () => {
    expect(typeof STARS_FALLBACK).toBe('number');
    expect(STARS_FALLBACK).toBeGreaterThan(0);
  });

  it('exposes hero + meta copy and an OG image path under /marketing/', () => {
    expect(HERO_HEADLINE.length).toBeGreaterThan(0);
    expect(META_TITLE.length).toBeGreaterThan(0);
    expect(META_DESCRIPTION.length).toBeGreaterThan(0);
    expect(OG_IMAGE_PATH).toBe('/marketing/og-cover.png');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/lib/marketing.test.ts`
Expected: FAIL — `Failed to resolve import "./marketing"` / module not found.

- [ ] **Step 3: Create the constants module**

Create `apps/web/src/lib/marketing.ts`:

```ts
/**
 * Single source of truth for marketing repo + site coordinates.
 * Imported by the Marketing page sections AND the prerender script — keep it
 * free of React/DOM imports so the SSR/prerender step can consume it cleanly.
 */
export const REPO_OWNER = 'studiox4';
export const REPO_NAME = 'product-map';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

/**
 * Canonical project domain baked into prerendered absolute og:url / og:image.
 * Each self-hosted instance has its own host (unknown at build time); previews
 * matter most when the *project* is shared, so we bake the canonical site.
 */
export const MARKETING_SITE_URL = 'https://productmap.studiox4.dev';

/** Shown when api.github.com is unreachable (offline / rate-limited / air-gapped). */
export const STARS_FALLBACK = 1200;

export const HERO_HEADLINE = 'Roadmaps and docs your security team will let you run.';
export const HERO_SUBHEAD =
  'ProductMap is the self-hosted product workspace: now-next-later roadmaps, a feature hub with PRDs and docs, releases, and an AI copilot — all on infrastructure you own.';

export const META_TITLE = 'ProductMap — Self-hosted product roadmaps & docs';
export const META_DESCRIPTION =
  'Self-hosted product workspace: roadmaps, a feature hub with docs, releases, and an AI copilot. Offline-friendly, air-gapped-ready, your markdown is yours.';

/** OG image is a committed static asset; path is relative to the web root. */
export const OG_IMAGE_PATH = '/marketing/og-cover.png';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/lib/marketing.test.ts`
Expected: PASS — 5 passing.

- [ ] **Step 5: Create placeholder static assets**

These are committed binary assets the sections + OG meta reference. Create real PNG files (1x1 placeholders are fine for now; design can replace later — the build/serve path only needs the files to exist).

```bash
mkdir -p apps/web/public/marketing
# 1x1 transparent PNG, base64-decoded into each asset.
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
for f in og-cover board roadmap feature hero; do
  printf '%s' "$PNG" | base64 -d > "apps/web/public/marketing/$f.png"
done
ls -la apps/web/public/marketing/
```

Expected: five `.png` files listed, each non-empty.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/marketing.ts apps/web/src/lib/marketing.test.ts apps/web/public/marketing/
git commit -m "feat(web): marketing constants module + placeholder static assets"
```

---

## Task 2: MarketingNav section

**Files:**
- Create: `apps/web/src/components/marketing/MarketingNav.tsx`
- Create: `apps/web/src/components/marketing/MarketingNav.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/marketing/MarketingNav.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import MarketingNav from './MarketingNav';
import { REPO_URL } from '@/lib/marketing';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MarketingNav', () => {
  it('renders "Sign in" by default (logged-out / before fetch resolves)', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(<MarketingNav />);
    const signIn = screen.getByRole('link', { name: /sign in/i });
    expect(signIn).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /open app/i })).toBeNull();
  });

  it('links to the GitHub repo', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(<MarketingNav />);
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute('href', REPO_URL);
  });

  it('upgrades to "Open app" → /app when /api/auth/me returns a session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'u1', email: 'a@b.c' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(<MarketingNav />);
    const openApp = await screen.findByRole('link', { name: /open app/i });
    expect(openApp).toHaveAttribute('href', '/app');
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
  });

  it('stays on "Sign in" when /api/auth/me returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    render(<MarketingNav />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /open app/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/MarketingNav.test.tsx`
Expected: FAIL — cannot resolve `./MarketingNav`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/marketing/MarketingNav.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Github, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REPO_URL } from '@/lib/marketing';

/**
 * Presentational nav. Auth is checked with a BARE fetch (NOT useMe) because
 * Marketing has no QueryProvider. The check is non-blocking progressive
 * enhancement: we render "Sign in" immediately and upgrade to "Open app" only
 * if a live session is found. The prerendered HTML therefore always ships the
 * "Sign in" baseline.
 */
export default function MarketingNav() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => {
        if (!cancelled && res.ok) setAuthed(true);
      })
      .catch(() => {
        /* offline / no session — keep the Sign in baseline */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-6">
      <a
        href="/"
        className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink"
      >
        <Map className="h-4 w-4 text-action" aria-hidden />
        ProductMap
      </a>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            <Github className="h-4 w-4" aria-hidden />
            GitHub
          </a>
        </Button>
        {authed ? (
          <Button asChild size="sm">
            <a href="/app">Open app</a>
          </Button>
        ) : (
          <Button asChild size="sm">
            <a href="/login">Sign in</a>
          </Button>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/MarketingNav.test.tsx`
Expected: PASS — 4 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/MarketingNav.tsx apps/web/src/components/marketing/MarketingNav.test.tsx
git commit -m "feat(web): MarketingNav with auth-adaptive link"
```

---

## Task 3: Hero section

**Files:**
- Create: `apps/web/src/components/marketing/Hero.tsx`
- Create: `apps/web/src/components/marketing/Hero.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/marketing/Hero.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Hero from './Hero';
import { HERO_HEADLINE, REPO_URL } from '@/lib/marketing';

afterEach(cleanup);

describe('Hero', () => {
  it('renders the headline', () => {
    render(<Hero />);
    expect(screen.getByRole('heading', { name: HERO_HEADLINE })).toBeTruthy();
  });

  it('primary CTA "Deploy your own" points at the GitHub repo', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: /deploy your own/i })).toHaveAttribute('href', REPO_URL);
  });

  it('secondary CTA "Sign in" points at /login', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('renders the framed screenshot', () => {
    render(<Hero />);
    expect(screen.getByRole('img', { name: /productmap/i })).toHaveAttribute('src', '/marketing/hero.png');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/Hero.test.tsx`
Expected: FAIL — cannot resolve `./Hero`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/marketing/Hero.tsx`:

```tsx
import { Button } from '@/components/ui/button';
import { HERO_HEADLINE, HERO_SUBHEAD, REPO_URL } from '@/lib/marketing';

export default function Hero() {
  return (
    <section className="mx-auto grid max-w-screen-xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {HERO_HEADLINE}
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">{HERO_SUBHEAD}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
              Deploy your own
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="/login">Sign in</a>
          </Button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-2 shadow-lg">
        <img
          src="/marketing/hero.png"
          alt="ProductMap roadmap board"
          className="w-full rounded-lg"
          loading="eager"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/Hero.test.tsx`
Expected: PASS — 4 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/Hero.tsx apps/web/src/components/marketing/Hero.test.tsx
git commit -m "feat(web): marketing Hero split section"
```

---

## Task 4: FeatureHighlights section

**Files:**
- Create: `apps/web/src/components/marketing/FeatureHighlights.tsx`
- Create: `apps/web/src/components/marketing/FeatureHighlights.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/marketing/FeatureHighlights.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FeatureHighlights from './FeatureHighlights';

afterEach(cleanup);

describe('FeatureHighlights', () => {
  it('renders four feature cards', () => {
    render(<FeatureHighlights />);
    expect(screen.getByRole('heading', { name: /roadmap & horizons/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /feature hub/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /releases/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /ai copilot/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/FeatureHighlights.test.tsx`
Expected: FAIL — cannot resolve `./FeatureHighlights`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/marketing/FeatureHighlights.tsx`:

```tsx
import { Boxes, FileText, Rocket, Sparkles } from 'lucide-react';

const CARDS = [
  {
    icon: Boxes,
    title: 'Roadmap & horizons',
    body: 'Now-next-later board and a Gantt roadmap that keep dates, sizes, and priorities honest.',
  },
  {
    icon: FileText,
    title: 'Feature hub + docs',
    body: 'Every feature carries its PRDs, briefs, and tech specs in a markdown editor that is yours.',
  },
  {
    icon: Rocket,
    title: 'Releases',
    body: 'Group features into releases, track status, and ship release notes without leaving the workspace.',
  },
  {
    icon: Sparkles,
    title: 'AI copilot',
    body: 'Draft docs, summarize activity, and triage the idea inbox with an AI copilot you can point at your own model.',
  },
] as const;

export default function FeatureHighlights() {
  return (
    <section className="mx-auto max-w-screen-xl px-6 py-16">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <Icon className="h-6 w-6 text-action" aria-hidden />
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/FeatureHighlights.test.tsx`
Expected: PASS — 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/FeatureHighlights.tsx apps/web/src/components/marketing/FeatureHighlights.test.tsx
git commit -m "feat(web): marketing FeatureHighlights cards"
```

---

## Task 5: ScreenshotStrip section

**Files:**
- Create: `apps/web/src/components/marketing/ScreenshotStrip.tsx`
- Create: `apps/web/src/components/marketing/ScreenshotStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/marketing/ScreenshotStrip.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ScreenshotStrip from './ScreenshotStrip';

afterEach(cleanup);

describe('ScreenshotStrip', () => {
  it('renders framed images from /marketing/', () => {
    render(<ScreenshotStrip />);
    const imgs = screen.getAllByRole('img');
    const srcs = imgs.map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(
      expect.arrayContaining(['/marketing/board.png', '/marketing/roadmap.png', '/marketing/feature.png']),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/ScreenshotStrip.test.tsx`
Expected: FAIL — cannot resolve `./ScreenshotStrip`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/marketing/ScreenshotStrip.tsx`:

```tsx
const SHOTS = [
  { src: '/marketing/board.png', alt: 'Now-next-later board' },
  { src: '/marketing/roadmap.png', alt: 'Gantt roadmap' },
  { src: '/marketing/feature.png', alt: 'Feature hub with docs' },
] as const;

export default function ScreenshotStrip() {
  return (
    <section className="mx-auto max-w-screen-xl px-6 py-16">
      <div className="grid gap-6 md:grid-cols-3">
        {SHOTS.map(({ src, alt }) => (
          <figure key={src} className="rounded-xl border border-border bg-card p-2 shadow-md">
            <img src={src} alt={alt} className="w-full rounded-lg" loading="lazy" />
            <figcaption className="px-2 py-2 text-sm text-muted-foreground">{alt}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/ScreenshotStrip.test.tsx`
Expected: PASS — 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/ScreenshotStrip.tsx apps/web/src/components/marketing/ScreenshotStrip.test.tsx
git commit -m "feat(web): marketing ScreenshotStrip"
```

---

## Task 6: EthosBand section

**Files:**
- Create: `apps/web/src/components/marketing/EthosBand.tsx`
- Create: `apps/web/src/components/marketing/EthosBand.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/marketing/EthosBand.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import EthosBand from './EthosBand';

afterEach(cleanup);

describe('EthosBand', () => {
  it('renders the four ethos callouts', () => {
    render(<EthosBand />);
    expect(screen.getByText(/offline/i)).toBeTruthy();
    expect(screen.getByText(/air-gapped/i)).toBeTruthy();
    expect(screen.getByText(/your markdown is yours/i)).toBeTruthy();
    expect(screen.getByText(/open source/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/EthosBand.test.tsx`
Expected: FAIL — cannot resolve `./EthosBand`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/marketing/EthosBand.tsx`:

```tsx
const ETHOS = [
  { title: 'Offline', body: 'Runs as a single process with no third-party calls in the critical path.' },
  { title: 'Air-gapped', body: 'No outbound dependencies required — point AI and SMTP at your own services or skip them.' },
  { title: 'Your markdown is yours', body: 'Docs are plain markdown you can export and version-control any time.' },
  { title: 'Open source', body: 'MIT-licensed and self-hostable — read the code, fork it, deploy your own.' },
] as const;

export default function EthosBand() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto grid max-w-screen-xl gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {ETHOS.map(({ title, body }) => (
          <div key={title}>
            <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/EthosBand.test.tsx`
Expected: PASS — 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/EthosBand.tsx apps/web/src/components/marketing/EthosBand.test.tsx
git commit -m "feat(web): marketing EthosBand"
```

---

## Task 7: GitHubStars section (mount-gated, graceful fallback)

**Files:**
- Create: `apps/web/src/components/marketing/GitHubStars.tsx`
- Create: `apps/web/src/components/marketing/GitHubStars.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/marketing/GitHubStars.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import GitHubStars from './GitHubStars';
import { REPO_URL, STARS_FALLBACK } from '@/lib/marketing';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GitHubStars', () => {
  it('shows the live star count on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ stargazers_count: 4242 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(<GitHubStars />);
    expect(await screen.findByText(/4,242/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /star|github/i })).toHaveAttribute('href', REPO_URL);
  });

  it('shows the static fallback count when the fetch rejects (air-gapped)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<GitHubStars />);
    expect(await screen.findByText(STARS_FALLBACK.toLocaleString('en-US'))).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/GitHubStars.test.tsx`
Expected: FAIL — cannot resolve `./GitHubStars`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/marketing/GitHubStars.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Github, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GITHUB_API_URL, REPO_URL, STARS_FALLBACK } from '@/lib/marketing';

/**
 * Mount-gated star badge. `mounted` starts false so the FIRST render (the one
 * the SSR/prerender step captures) returns null — this is how GitHubStars is
 * EXCLUDED from prerendered HTML. After mount we fetch GitHub's public API and
 * fall back to STARS_FALLBACK on any failure (offline / rate-limited / air-gapped).
 */
export default function GitHubStars() {
  const [mounted, setMounted] = useState(false);
  const [stars, setStars] = useState<number>(STARS_FALLBACK);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    fetch(GITHUB_API_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad status'))))
      .then((data: { stargazers_count?: number }) => {
        if (!cancelled && typeof data.stargazers_count === 'number') {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => {
        /* keep STARS_FALLBACK */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted) return null;

  return (
    <section className="mx-auto max-w-screen-xl px-6 py-12 text-center">
      <Button asChild variant="outline" size="lg">
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
          <Github className="h-4 w-4" aria-hidden />
          <span>Star on GitHub</span>
          <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
            <Star className="h-4 w-4" aria-hidden />
            {stars.toLocaleString('en-US')}
          </span>
        </a>
      </Button>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/GitHubStars.test.tsx`
Expected: PASS — 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/GitHubStars.tsx apps/web/src/components/marketing/GitHubStars.test.tsx
git commit -m "feat(web): GitHubStars badge with mount-gate + fallback"
```

---

## Task 8: MarketingFooter + Marketing page assembly

**Files:**
- Create: `apps/web/src/components/marketing/MarketingFooter.tsx`
- Create: `apps/web/src/components/marketing/MarketingFooter.test.tsx`
- Create: `apps/web/src/routes/Marketing.tsx`
- Create: `apps/web/src/routes/Marketing.test.tsx`

- [ ] **Step 1: Write the failing footer test**

Create `apps/web/src/components/marketing/MarketingFooter.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MarketingFooter from './MarketingFooter';
import { REPO_URL } from '@/lib/marketing';

afterEach(cleanup);

describe('MarketingFooter', () => {
  it('links to GitHub and shows "powered by ProductMap"', () => {
    render(<MarketingFooter />);
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute('href', REPO_URL);
    expect(screen.getByText(/powered by productmap/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/MarketingFooter.test.tsx`
Expected: FAIL — cannot resolve `./MarketingFooter`.

- [ ] **Step 3: Implement the footer**

Create `apps/web/src/components/marketing/MarketingFooter.tsx`:

```tsx
import { REPO_URL } from '@/lib/marketing';

export default function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground">
        <span>Powered by ProductMap</span>
        <nav className="flex items-center gap-6">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
            GitHub
          </a>
          <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
            Docs
          </a>
          <a
            href={`${REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-ink"
          >
            License
          </a>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Run the footer test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/components/marketing/MarketingFooter.test.tsx`
Expected: PASS — 1 passing.

- [ ] **Step 5: Write the failing Marketing page test**

Create `apps/web/src/routes/Marketing.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Marketing from './Marketing';
import { HERO_HEADLINE } from '@/lib/marketing';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Marketing page', () => {
  it('renders all sections with NO providers (bare render)', () => {
    // MarketingNav + GitHubStars fetch on mount; never resolve so we test the
    // static baseline. No QueryClientProvider, no Router — proves the page is
    // self-contained / presentational.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(<Marketing />);
    // Nav
    expect(screen.getAllByRole('link', { name: /github/i }).length).toBeGreaterThan(0);
    // Hero
    expect(screen.getByRole('heading', { name: HERO_HEADLINE })).toBeTruthy();
    expect(screen.getByRole('link', { name: /deploy your own/i })).toBeTruthy();
    // FeatureHighlights
    expect(screen.getByRole('heading', { name: /ai copilot/i })).toBeTruthy();
    // ScreenshotStrip
    expect(screen.getByRole('img', { name: /gantt roadmap/i })).toBeTruthy();
    // EthosBand
    expect(screen.getByText(/your markdown is yours/i)).toBeTruthy();
    // Footer
    expect(screen.getByText(/powered by productmap/i)).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @productmap/web exec vitest run src/routes/Marketing.test.tsx`
Expected: FAIL — cannot resolve `./Marketing`.

- [ ] **Step 7: Implement the Marketing page**

Create `apps/web/src/routes/Marketing.tsx`:

```tsx
import MarketingNav from '@/components/marketing/MarketingNav';
import Hero from '@/components/marketing/Hero';
import FeatureHighlights from '@/components/marketing/FeatureHighlights';
import ScreenshotStrip from '@/components/marketing/ScreenshotStrip';
import EthosBand from '@/components/marketing/EthosBand';
import GitHubStars from '@/components/marketing/GitHubStars';
import MarketingFooter from '@/components/marketing/MarketingFooter';

/**
 * Presentational marketing landing. NO router hooks, NO react-query, NO
 * providers — so it client-renders bare at `/` and SSR-prerenders with no
 * hydration mismatch. The only runtime fetches are the non-blocking auth check
 * (MarketingNav) and the GitHub stars (GitHubStars), both mount-effects.
 */
export default function Marketing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />
      <main>
        <Hero />
        <FeatureHighlights />
        <ScreenshotStrip />
        <EthosBand />
        <GitHubStars />
      </main>
      <MarketingFooter />
    </div>
  );
}
```

- [ ] **Step 8: Run the page test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/routes/Marketing.test.tsx`
Expected: PASS — 1 passing.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/marketing/MarketingFooter.tsx apps/web/src/components/marketing/MarketingFooter.test.tsx apps/web/src/routes/Marketing.tsx apps/web/src/routes/Marketing.test.tsx
git commit -m "feat(web): MarketingFooter + Marketing page assembly"
```

---

## Task 9: Mount Marketing at `/` (replace the 3A redirect) + routing test

**Files:**
- Modify: `apps/web/src/App.tsx` (READ-THEN-EDIT — see WARNING in the dependency section)
- Create: `apps/web/src/App.marketing.test.tsx`

- [ ] **Step 1: Read the post-3A App.tsx and locate the `/` route**

Read `apps/web/src/App.tsx`. Find the `/` route element. After 3A it should read:

```tsx
<Route path="/" element={<Navigate to="/app" replace />} />
```

It MUST be outside the `RequireAuth`/`ActiveProjectProvider` subtree (3A mounts that subtree at `/app/*`). If the `/` route is NOT a bare `<Navigate>` outside the gate, STOP — 3A has not landed correctly; do not proceed.

- [ ] **Step 2: Add the Marketing lazy import**

Near the other `lazy(...)` route imports at the top of `apps/web/src/App.tsx`, add:

```tsx
const Marketing = lazy(() => import('@/routes/Marketing'));
```

- [ ] **Step 3: Replace the `/` redirect element with Marketing**

Replace the `/` route element located in Step 1 with:

```tsx
<Route
  path="/"
  element={
    <Suspense fallback={null}>
      <Marketing />
    </Suspense>
  }
/>
```

Keep it in the SAME position (a top-level `<Route>` directly under `<Routes>`, inside `BrowserRouter`, OUTSIDE the `RequireAuth`/`AuthProvider`-gated subtree). `Marketing` needs no providers; `<Suspense>` covers the lazy import. Do not touch `main.tsx` (it stays `createRoot` — the client re-renders over prerendered HTML; do NOT introduce `hydrateRoot`).

- [ ] **Step 4: Write the routing test**

Create `apps/web/src/App.marketing.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from './App';
import { HERO_HEADLINE } from '@/lib/marketing';

const server = setupServer(
  // Logged-out: /api/auth/me 401 so MarketingNav stays on "Sign in" and
  // RequireAuth redirects /app/* to /login.
  http.get('/api/auth/me', () => new HttpResponse(null, { status: 401 })),
);

beforeEach(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
  // BrowserRouter reads window.location; set the path before each render.
  window.history.pushState({}, '', '/');
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.close();
  vi.restoreAllMocks();
});

describe('routing — Marketing at /', () => {
  it('renders Marketing at / (no providers required by the page itself)', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByRole('heading', { name: HERO_HEADLINE })).toBeTruthy();
  });

  it('keeps /app/* auth-gated → redirects to /login when logged out', async () => {
    window.history.pushState({}, '', '/app/board');
    render(<App />);
    // Login page renders its email field; assert we landed on the login route.
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('keeps /share/:token public (does not redirect to /login)', async () => {
    server.use(
      http.get('/api/share/:token/data', () =>
        HttpResponse.json({ project: { id: 'p1', name: 'Demo' }, features: [] }),
      ),
    );
    window.history.pushState({}, '', '/share/demo-token');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/share/demo-token'));
  });
});
```

> Note for the controller: the exact assertions for the `/app/*` gate and `/share/:token` depend on post-3A redirect wiring. If `RequireAuth` redirects via `<Navigate>` rather than mutating `window.location`, assert on the rendered Login markup (e.g. `screen.findByLabelText(/email/i)`) instead of `window.location.pathname`. Adjust to match the post-3A behavior observed in Step 1.

- [ ] **Step 5: Run the routing test to verify it passes**

Run: `pnpm --filter @productmap/web exec vitest run src/App.marketing.test.tsx`
Expected: PASS — 3 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.marketing.test.tsx
git commit -m "feat(web): mount Marketing at / (replace 3A redirect)"
```

---

## Task 10: SSR entry + prerender script + build wiring + build-output test

**Toolchain decision (locked):** Use a dedicated SSR entry built with `vite build --ssr`, then `renderToString` it in a post-build Node script that injects markup + OG meta into a COPY of the built `index.html`, written to `dist/marketing.html`. Rationale: the locked invariant is "keep Vite's generated `index.html` as the SPA shell; write prerendered marketing to a SEPARATE file the server maps to `/`." `vite-react-ssg` overwrites `index.html` per-route and wants to own the router, which fights that invariant. The manual `--ssr` path keeps `dist/index.html` untouched as the shell and produces `dist/marketing.html` cleanly. `renderToString` ships with `react-dom@18.3.1` (already a dep) — no new dependency.

**Files:**
- Create: `apps/web/src/entry-marketing.tsx`
- Create: `apps/web/scripts/prerender.mjs`
- Modify: `apps/web/package.json` (build script + prerender helper)
- Create: `apps/web/scripts/prerender.test.ts`

- [ ] **Step 1: Create the SSR entry**

Create `apps/web/src/entry-marketing.tsx`. It renders the page to a string AND re-exports the OG constants from the single constants module so the prerender script can read them out of the SSR bundle (preserves single-source — no hardcoded duplicates in the script). `renderToString` runs the FIRST render only, so `MarketingNav`/`GitHubStars` mount-effects do not fire under SSR — the auth link stays "Sign in" and `GitHubStars` returns `null`, both intended:

```tsx
import { renderToString } from 'react-dom/server';
import MarketingPage from '@/routes/Marketing';

export { MARKETING_SITE_URL, META_TITLE, META_DESCRIPTION, OG_IMAGE_PATH } from '@/lib/marketing';

/** Returns the static HTML string for the marketing page body. */
export function render(): string {
  return renderToString(<MarketingPage />);
}
```

- [ ] **Step 2: Create the prerender script**

Create `apps/web/scripts/prerender.mjs`. It dynamic-imports the SSR bundle to get BOTH `render` and the OG constants (the bundle path is computed at runtime, so a dynamic import is required), injects the rendered markup + OG/Twitter meta into a COPY of the built `dist/index.html`, and writes `dist/marketing.html` (leaving `dist/index.html` untouched as the SPA shell):

```js
// Post-build prerender: render the SSR marketing bundle to a string, inject it
// (plus OG/Twitter meta) into a COPY of the built dist/index.html, and write
// dist/marketing.html. dist/index.html is left UNTOUCHED as the SPA shell.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const dist = path.join(webRoot, 'dist');
const ssrEntry = path.join(dist, 'ssr', 'entry-marketing.js');
const shellPath = path.join(dist, 'index.html');
const outPath = path.join(dist, 'marketing.html');

if (!existsSync(ssrEntry)) {
  console.error(`[prerender] missing SSR bundle at ${ssrEntry}. Did "vite build --ssr" run?`);
  process.exit(1);
}
if (!existsSync(shellPath)) {
  console.error('[prerender] missing dist/index.html. Did "vite build" run?');
  process.exit(1);
}

const mod = await import(pathToFileURL(ssrEntry).href);
const { render, MARKETING_SITE_URL, META_TITLE, META_DESCRIPTION, OG_IMAGE_PATH } = mod;

const html = render();
const ogUrl = `${MARKETING_SITE_URL}/`;
const ogImage = `${MARKETING_SITE_URL}${OG_IMAGE_PATH}`;

const head = [
  `<title>${META_TITLE}</title>`,
  `<meta name="description" content="${META_DESCRIPTION}" />`,
  `<meta property="og:type" content="website" />`,
  `<meta property="og:title" content="${META_TITLE}" />`,
  `<meta property="og:description" content="${META_DESCRIPTION}" />`,
  `<meta property="og:url" content="${ogUrl}" />`,
  `<meta property="og:image" content="${ogImage}" />`,
  `<meta name="twitter:card" content="summary_large_image" />`,
  `<meta name="twitter:title" content="${META_TITLE}" />`,
  `<meta name="twitter:description" content="${META_DESCRIPTION}" />`,
  `<meta name="twitter:image" content="${ogImage}" />`,
].join('\n    ');

let out = readFileSync(shellPath, 'utf8');
out = out.replace(/<title>[^<]*<\/title>/, head);
out = out.replace('<div id="root"></div>', `<div id="root">${html}</div>`);

writeFileSync(outPath, out, 'utf8');
console.log(`[prerender] wrote ${outPath} (${out.length} bytes)`);
```

Also write the corrected `src/entry-marketing.tsx` (final form — replace the file from Step 1 with this):

```tsx
import { renderToString } from 'react-dom/server';
import MarketingPage from '@/routes/Marketing';

export { MARKETING_SITE_URL, META_TITLE, META_DESCRIPTION, OG_IMAGE_PATH } from '@/lib/marketing';

/** Returns the static HTML string for the marketing page body. */
export function render(): string {
  return renderToString(<MarketingPage />);
}
```

- [ ] **Step 3: Wire the build script**

Edit `apps/web/package.json` `scripts` to:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -p tsconfig.json && vite build && vite build --ssr src/entry-marketing.tsx --outDir dist/ssr --ssrManifest=false && node scripts/prerender.mjs",
  "prerender": "node scripts/prerender.mjs",
  "test": "vitest run"
}
```

Notes: `vite build` produces `dist/` (incl. `dist/index.html` shell + assets). `vite build --ssr src/entry-marketing.tsx --outDir dist/ssr` produces `dist/ssr/entry-marketing.js` (a Node-loadable ESM bundle; Vite handles CSS/SVG/asset imports so there is no raw `node import('./Marketing.tsx')`). Then `node scripts/prerender.mjs` writes `dist/marketing.html`. A single `pnpm --filter @productmap/web build` produces all prerendered output.

- [ ] **Step 4: Run the build once to generate output, then write the build-output test**

Run: `pnpm --filter @productmap/web build`
Expected: ends with `[prerender] wrote .../dist/marketing.html (NNNNN bytes)` and exit 0. (Run sandbox-off if the build is blocked by the filesystem sandbox.)

Create `apps/web/scripts/prerender.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERO_HEADLINE, META_TITLE, MARKETING_SITE_URL } from '../src/lib/marketing';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marketingHtml = path.join(webRoot, 'dist', 'marketing.html');

describe('prerendered dist/marketing.html', () => {
  it('exists (build → prerender ran)', () => {
    expect(existsSync(marketingHtml)).toBe(true);
  });

  it('contains the rendered hero headline', () => {
    const html = readFileSync(marketingHtml, 'utf8');
    expect(html).toContain(HERO_HEADLINE);
  });

  it('contains og:title / og:url / twitter:card meta with the canonical absolute URL', () => {
    const html = readFileSync(marketingHtml, 'utf8');
    expect(html).toContain(`<meta property="og:title" content="${META_TITLE}" />`);
    expect(html).toContain(`<meta property="og:url" content="${MARKETING_SITE_URL}/" />`);
    expect(html).toContain('twitter:card');
  });

  it('still includes the Vite module script so the SPA boots', () => {
    const html = readFileSync(marketingHtml, 'utf8');
    expect(html).toMatch(/<script[^>]+type="module"[^>]+src="\/assets\//);
  });

  it('excludes the dynamic GitHubStars "Star on GitHub" label (mount-gated, not in SSR output)', () => {
    const html = readFileSync(marketingHtml, 'utf8');
    expect(html).not.toContain('Star on GitHub');
  });
});
```

> **BLOCKING — CI ordering.** This test reads built output (`dist/marketing.html`). CI runs the unit job (`pnpm --filter @productmap/web test`) with NO prior web build, so if `prerender.test.ts` is in the default vitest run it FAILS on missing `dist/`. Do NOT "skip when absent" (that silently green-passes and defeats the test). Instead: **exclude it from the default vitest run** and run it explicitly only after a build (this Step 5, and the Task 14 build stage). It overlaps Task 12's integration check by design; this is the file-content half, Task 12 is the served-over-HTTP half.

- [ ] **Step 5: Exclude `prerender.test.ts` from the default suite, then run it explicitly after the build**

Edit `apps/web/vitest.config.ts` (read it first; it likely has a `test: { ... }` block) to exclude the build-output test from the default run:

```ts
    exclude: [...configDefaults.exclude, 'scripts/prerender.test.ts'],
```

(Import `configDefaults` from `vitest/config` if not already; if the config already sets `exclude`, append the path to it.) Then run the build-output test explicitly (build already ran in Step 4):

Run: `pnpm --filter @productmap/web exec vitest run scripts/prerender.test.ts`
Expected: PASS — 5 passing. (Build from Step 4 produced `dist/marketing.html` first.)

Verify it is NOT in the default run:

Run: `pnpm --filter @productmap/web test 2>&1 | grep -c prerender.test`
Expected: `0` (the default suite no longer collects it, so CI's build-less unit job stays green).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/entry-marketing.tsx apps/web/scripts/prerender.mjs apps/web/scripts/prerender.test.ts apps/web/vitest.config.ts apps/web/package.json
git commit -m "feat(web): SSR prerender of marketing → dist/marketing.html + build wiring"
```

---

## Task 11: API static-serving handler + serving test

**Files:**
- Create: `apps/api/src/serve-web.ts`
- Modify: `apps/api/src/index.ts` (mount after `/uploads/*`)
- Create: `apps/api/src/serve-web.test.ts`

Placement (read `apps/api/src/index.ts` first): the uploads `serveStatic` is registered in `index.ts` (NOT `app.ts`). The `/api/*` routes live in `app.ts` and are already wired into `app`. Mount the web handler in `index.ts` AFTER the uploads handler so request order is: `/api/*` (app.ts) → `/uploads/*` (index.ts) → web static (index.ts). Hono matches in registration order; since `/api/*` and `/uploads/*` are registered first, the web handler never shadows them.

- [ ] **Step 1: Write the failing serving test**

Create `apps/api/src/serve-web.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import { mountWebStatic } from './serve-web';

const HERO_MARK = '<h1>HERO_HEADLINE_MARKER</h1>';
const SHELL_MARK = '<div id="root"></div><!--SPA_SHELL-->';

function buildFakeDist(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'pm-dist-'));
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body>${SHELL_MARK}</body></html>`);
  writeFileSync(path.join(dir, 'marketing.html'), `<!doctype html><html><body>${HERO_MARK}</body></html>`);
  writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log("app")');
  return dir;
}

describe('mountWebStatic', () => {
  let distDir: string;

  beforeAll(() => {
    distDir = buildFakeDist();
  });
  afterAll(() => {
    rmSync(distDir, { recursive: true, force: true });
  });

  function appWithStatic() {
    const app = new Hono().get('/api/healthz', (c) => c.json({ ok: true }));
    mountWebStatic(app, { distDir, enabled: true });
    return app;
  }

  it('serves prerendered marketing HTML at exact GET /', async () => {
    const res = await appWithStatic().request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(HERO_MARK);
  });

  it('serves the SPA shell (not marketing) for /app/board', async () => {
    const res = await appWithStatic().request('/app/board');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(SHELL_MARK);
    expect(body).not.toContain(HERO_MARK);
  });

  it('leaves /api/* untouched', async () => {
    const res = await appWithStatic().request('/api/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('is inactive when disabled (dist absent / SERVE_WEB off) → / falls through to 404', async () => {
    const app = new Hono().get('/api/healthz', (c) => c.json({ ok: true }));
    mountWebStatic(app, { distDir, enabled: false });
    app.notFound((c) => c.json({ error: 'not_found' }, 404));
    const res = await app.request('/');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @productmap/api exec vitest run src/serve-web.test.ts`
Expected: FAIL — cannot resolve `./serve-web`.

- [ ] **Step 3: Implement the handler**

Create `apps/api/src/serve-web.ts`:

```ts
import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface WebStaticOptions {
  /** Absolute path to the built web dist/ directory. */
  distDir: string;
  /** Whether serving is active (e.g. SERVE_WEB=1 AND dist present). */
  enabled: boolean;
}

/**
 * Mount production web static serving on an existing Hono app. Call AFTER
 * /api/* and /uploads/* are registered so this never shadows them.
 *
 * Behavior when enabled:
 *  - exact GET /            → prerendered dist/marketing.html
 *  - GET /<existing file>   → static asset from dist/ (serveStatic)
 *  - any other non-API GET  → SPA shell (dist/index.html) [history fallback]
 *
 * When disabled, this registers nothing (dev/test default unaffected).
 */
export function mountWebStatic(app: Hono, opts: WebStaticOptions): void {
  if (!opts.enabled) return;

  const { distDir } = opts;
  const marketingPath = path.join(distDir, 'marketing.html');
  const shellPath = path.join(distDir, 'index.html');

  // Exact GET / → prerendered marketing.
  app.get('/', (c) => {
    if (existsSync(marketingPath)) {
      return c.html(readFileSync(marketingPath, 'utf8'));
    }
    if (existsSync(shellPath)) {
      return c.html(readFileSync(shellPath, 'utf8'));
    }
    return c.notFound();
  });

  // Static assets from dist/. serveStatic root is relative to process.cwd().
  app.use(
    '/*',
    serveStatic({
      root: path.relative(process.cwd(), distDir) || '.',
    }),
  );

  // History fallback: any remaining GET (non-API, no matching file) → SPA shell.
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.notFound();
    if (existsSync(shellPath)) {
      return c.html(readFileSync(shellPath, 'utf8'));
    }
    return c.notFound();
  });
}
```

> Implementer note on ordering inside `mountWebStatic`: the exact `app.get('/')` is registered first so `/` matches marketing before the `/*` static or the `*` fallback. `serveStatic` only responds when a file exists; a miss falls through to the `*` history fallback. The `*` fallback explicitly re-guards `/api/` (defensive — `/api/*` is registered earlier on the same app, so this is belt-and-suspenders).

- [ ] **Step 4: Run the serving test to verify it passes**

Run: `pnpm --filter @productmap/api exec vitest run src/serve-web.test.ts`
Expected: PASS — 4 passing. (No DB needed — this test builds an isolated Hono app.)

- [ ] **Step 5: Mount the handler in index.ts**

Read `apps/api/src/index.ts`. After the existing `app.use('/uploads/*', serveStatic(...))` block and BEFORE `serve({ fetch: app.fetch, port }, ...)`, add:

```ts
import { mountWebStatic } from './serve-web';
```

(add at the top with the other imports), and after the uploads block:

```ts
// Production web serving: serve the built SPA + prerendered marketing when a
// build is present and SERVE_WEB is on. Mounted AFTER /api/* and /uploads/* so
// it never shadows them. Dev/test default (no dist / SERVE_WEB unset) = inactive.
const webDistDir = path.join(repoRoot, 'apps', 'web', 'dist');
mountWebStatic(app, {
  distDir: webDistDir,
  enabled: process.env.SERVE_WEB === '1' && existsSync(path.join(webDistDir, 'index.html')),
});
```

Add `existsSync` to the `node:fs` import at the top of `index.ts` (it currently imports `mkdirSync`):

```ts
import { mkdirSync, existsSync } from 'node:fs';
```

- [ ] **Step 6: Verify the api suite still compiles/passes**

Run: `pnpm --filter @productmap/api exec vitest run src/serve-web.test.ts && pnpm --filter @productmap/api exec tsc -p tsconfig.json --noEmit`
Expected: serve-web tests PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/serve-web.ts apps/api/src/serve-web.test.ts apps/api/src/index.ts
git commit -m "feat(api): production web static handler (marketing at /, SPA shell fallback)"
```

---

## Task 12: REQUIRED build → prerender → serve integration check (raw HTTP)

This is the feature's actual value path and is NOT covered by the dev-server e2e. It runs `pnpm --filter @productmap/web build` (which invokes the prerender), boots the API with `dist/` present + `SERVE_WEB=1`, and asserts via RAW HTTP (no JS execution).

> **Controller note (sandbox + DB):** boot the API. `/api/auth/me` with no cookie is JWT-stateless (no DB read) and `/api/healthz` needs no DB, so the curl checks themselves do NOT need Postgres. BUT if the API boot path (`assertConfig()` / module-load DB connection in `app.ts`'s route imports) requires a DB connection, run this task **sandbox-off** and with a reachable DB (or a `DATABASE_URL` that the boot accepts). Set `AUTH_SECRET` to avoid `assertConfig()` failing in production mode; keep `NODE_ENV` unset/development so a missing secret is non-fatal if no DB is available.

**Files:**
- Create: `apps/api/scripts/integration-serve-check.sh`

- [ ] **Step 1: Write the integration check script**

Create `apps/api/scripts/integration-serve-check.sh`:

```bash
#!/usr/bin/env bash
# Build → prerender → serve integration check (raw HTTP, no JS execution).
# Verifies the prerendered marketing HTML is in the RAW response at /, the SPA
# shell is served at /app/board, and /api/healthz still responds.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PORT="${PORT:-3499}"
HERO_MARK="Roadmaps and docs your security team will let you run."

echo "[1/5] Building web (runs prerender)…"
pnpm --filter @productmap/web build

echo "[2/5] Asserting dist/marketing.html exists…"
test -f "$REPO_ROOT/apps/web/dist/marketing.html"

echo "[3/5] Booting API with SERVE_WEB=1 on :$PORT…"
SERVE_WEB=1 PORT="$PORT" AUTH_SECRET="${AUTH_SECRET:-integration-secret}" \
  pnpm --filter @productmap/api exec tsx src/index.ts &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

# Wait for the API to listen (up to ~20s).
for i in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/api/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

echo "[4/5] Raw HTTP assertions…"
ROOT_BODY="$(curl -fsS "http://localhost:$PORT/")"
echo "$ROOT_BODY" | grep -qF "$HERO_MARK" || { echo "FAIL: / missing hero headline"; exit 1; }
echo "$ROOT_BODY" | grep -qF 'property="og:title"' || { echo "FAIL: / missing og:title"; exit 1; }
echo "$ROOT_BODY" | grep -qF 'property="og:url"' || { echo "FAIL: / missing og:url"; exit 1; }

APP_BODY="$(curl -fsS "http://localhost:$PORT/app/board")"
echo "$APP_BODY" | grep -qF "$HERO_MARK" && { echo "FAIL: /app/board served marketing markup"; exit 1; }
echo "$APP_BODY" | grep -qF '<div id="root">' || { echo "FAIL: /app/board not the SPA shell"; exit 1; }

curl -fsS "http://localhost:$PORT/api/healthz" | grep -qF '"ok":true' || { echo "FAIL: /api/healthz not 200/ok"; exit 1; }

echo "[5/5] PASS — / = marketing (hero + OG), /app/board = SPA shell, /api/healthz = ok"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x apps/api/scripts/integration-serve-check.sh`
Expected: no output, exit 0.

- [ ] **Step 3: Run the integration check (sandbox-off if API boot needs a DB)**

Run: `bash apps/api/scripts/integration-serve-check.sh`
Expected: final line `[5/5] PASS — / = marketing (hero + OG), /app/board = SPA shell, /api/healthz = ok` and exit 0.

> If the API process fails to boot due to a DB connection at module load, re-run sandbox-off with a reachable `DATABASE_URL`. The curl assertions themselves hit only `/`, `/app/board`, and `/api/healthz` — none require DB reads.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/integration-serve-check.sh
git commit -m "test(api): build→prerender→serve integration check (raw HTTP)"
```

---

## Task 13: e2e — logged-out `/` shows hero + Deploy CTA; Sign in → `/login`

**Files:**
- Create: `e2e/marketing.spec.ts`

The e2e runs against the vite DEV server (client render), so it verifies the user-visible behavior, NOT the prerender path (Task 12 covers that). Read `e2e/landing.spec.ts` for the existing fixture/`test` import pattern before writing; mirror its imports.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/marketing.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Logged-out marketing landing. No auth fixture — visit / as an anonymous user.
test.describe('marketing landing', () => {
  test('logged-out / shows the hero and the Deploy CTA', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /security team will let you run/i }),
    ).toBeVisible();
    const deploy = page.getByRole('link', { name: /deploy your own/i });
    await expect(deploy).toBeVisible();
    await expect(deploy).toHaveAttribute('href', 'https://github.com/studiox4/product-map');
  });

  test('clicking "Sign in" navigates to /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
```

> Controller note: this spec must NOT use the authenticated storage state. If `playwright.config.ts` applies a global `storageState` (auth.setup.ts), add a project/override or `test.use({ storageState: { cookies: [], origins: [] } })` at the top of this file so `/` is visited logged-out and `/api/auth/me` returns 401 (MarketingNav stays "Sign in"). Read `playwright.config.ts` + `e2e/auth.setup.ts` to confirm the storage-state wiring before running.

- [ ] **Step 2: Run the e2e (sandbox-off; needs dev servers + DB per existing e2e)**

Run: `pnpm e2e e2e/marketing.spec.ts`
Expected: 2 passing.

> Run sandbox-off — the Playwright config boots the web+api dev servers (and the api needs a DB), same as the existing e2e suite.

- [ ] **Step 3: Commit**

```bash
git add e2e/marketing.spec.ts
git commit -m "test(e2e): logged-out marketing landing + Sign in nav"
```

---

## Task 14: Final verification

- [ ] **Step 1: Web typecheck — 0 errors**

Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit`
Expected: exit 0, no output.

- [ ] **Step 2: Web build (incl. prerender) clean**

Run: `pnpm --filter @productmap/web build`
Expected: ends with `[prerender] wrote .../dist/marketing.html (NNNNN bytes)`, exit 0. (Sandbox-off if filesystem-blocked.)

- [ ] **Step 3: Web unit + routing tests green; build-output test run explicitly post-build**

Run: `pnpm --filter @productmap/web test`
Expected: all default suites pass — `src/lib/marketing.test.ts`, the six `components/marketing/*.test.tsx`, `src/routes/Marketing.test.tsx`, `src/App.marketing.test.tsx`. `scripts/prerender.test.ts` is EXCLUDED from this run (Task 10 Step 5) — run it explicitly after Step 2's build:

Run: `pnpm --filter @productmap/web exec vitest run scripts/prerender.test.ts`
Expected: 5 passing (depends on Step 2 having produced `dist/marketing.html`).

- [ ] **Step 3b: Visual gate — screenshot `/` logged-out (manual confirm)**

Tests assert roles/text/href and the build/grep checks assert markup + OG tags — NONE verify the page is actually styled (undefined Tailwind tokens emit no CSS yet pass every gate; Task 0 mitigates but does not prove it). With the dev server up (or the integration-served build), capture a screenshot of `/` as an anonymous visitor and eyeball it: hero split layout, real styling (not unstyled HTML), CTAs visible, sections legible. Use the Playwright browser (`browser_navigate` to `/` then `browser_take_screenshot`) or `page.screenshot()` in the e2e. This is a manual confirmation step, not an assertion — it is the only check that catches a visually-broken-but-green landing.

- [ ] **Step 4: API suite green**

Run: `pnpm --filter @productmap/api test`
Expected: all suites pass, including `src/serve-web.test.ts`. (Run sandbox-off if the api test harness needs a DB; `serve-web.test.ts` itself does not.)

- [ ] **Step 5: Integration + e2e (sandbox-off)**

Run: `bash apps/api/scripts/integration-serve-check.sh` then `pnpm e2e e2e/marketing.spec.ts`
Expected: integration `[5/5] PASS`; e2e 2 passing.

- [ ] **Step 6: Final commit (if any verification fix touched files)**

```bash
git add -A
git commit -m "chore(web,api): phase 3b verification fixes" || echo "nothing to commit"
```

---

## Self-Review (run by the drafter against the spec)

**Spec coverage (Units B + C):**

| Spec requirement | Task |
| --- | --- |
| `Marketing.tsx` presentational, no providers | Task 8 + Task 9 routing test (bare render) |
| `MarketingNav` bare `fetch('/api/auth/me')`, Sign in default → Open app | Task 2 |
| `Hero` split, CTAs → GitHub + `/login`, framed screenshot | Task 3 |
| `FeatureHighlights` 3–4 cards | Task 4 |
| `ScreenshotStrip` framed `public/marketing/` images | Task 5 |
| `EthosBand` offline/air-gapped/markdown/license | Task 6 |
| `GitHubStars` live count + graceful fallback, excluded from prerender | Task 7 (mount-gate) |
| `MarketingFooter` GitHub/docs/license/powered-by | Task 8 |
| Single constants module (`REPO_URL`, owner/name, `MARKETING_SITE_URL`), repo `studiox4/product-map` | Task 1 |
| Route swap: `/` → Marketing, outside gate, inside BrowserRouter | Task 9 |
| Prerender via proper SSR build (NOT raw node import); exact commands + package.json wiring | Task 10 |
| Separate file invariant (marketing.html vs index.html shell) + asset tags + OG/Twitter absolute meta | Task 10 + prerender test |
| API static handler after `/api/*`+`/uploads/*`, marketing at `/`, SPA shell fallback, gated on dist/SERVE_WEB, no `/api/*` shadow | Task 11 |
| Required build→serve integration check (raw HTTP) | Task 12 |
| Web unit tests, routing tests, prerender build-output test, api serving test | Tasks 2–8, 9, 10, 11 |
| e2e logged-out hero + Deploy + Sign in→/login | Task 13 |
| Final verify (tsc 0, vitest green, build clean, api green) | Task 14 |

No spec requirement (Units B/C) is left unmapped. Unit A (the `/app/*` migration) is explicitly a Phase 3A prerequisite and is OUT OF SCOPE for this plan (stated in the dependency section).

**Placeholder scan:** No TBD/TODO/"add error handling". All code steps contain complete, final code — each code block is the exact file/edit to write.

**Type consistency:** `mountWebStatic(app, { distDir, enabled })` signature matches between Task 11 implementation, its test, and the index.ts mount. Constants names (`REPO_URL`, `REPO_OWNER`, `REPO_NAME`, `GITHUB_API_URL`, `MARKETING_SITE_URL`, `STARS_FALLBACK`, `HERO_HEADLINE`, `HERO_SUBHEAD`, `META_TITLE`, `META_DESCRIPTION`, `OG_IMAGE_PATH`) are consistent across Tasks 1, 2, 3, 7, 8, 10, 13 and the tests.
