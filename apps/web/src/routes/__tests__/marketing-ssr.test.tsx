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
