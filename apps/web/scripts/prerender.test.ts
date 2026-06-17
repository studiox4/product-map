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
