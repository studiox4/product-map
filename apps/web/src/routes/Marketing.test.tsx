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
