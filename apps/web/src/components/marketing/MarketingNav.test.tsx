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
    expect(signIn.getAttribute('href')).toBe('/login');
    expect(screen.queryByRole('link', { name: /open app/i })).toBeNull();
  });

  it('links to the GitHub repo', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(<MarketingNav />);
    expect(screen.getByRole('link', { name: /github/i }).getAttribute('href')).toBe(REPO_URL);
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
    expect(openApp.getAttribute('href')).toBe('/app');
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
  });

  it('stays on "Sign in" when /api/auth/me returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    render(<MarketingNav />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/login');
    expect(screen.queryByRole('link', { name: /open app/i })).toBeNull();
  });
});
