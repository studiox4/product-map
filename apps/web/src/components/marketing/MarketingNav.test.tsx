import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MarketingNav from './MarketingNav';
import { REPO_URL } from '@/lib/marketing';

afterEach(cleanup);

describe('MarketingNav', () => {
  it('routes to the no-auth demo (no login flow on the public site)', () => {
    render(<MarketingNav />);
    expect(screen.getByRole('link', { name: /try the demo/i }).getAttribute('href')).toBe('/demo');
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /open app/i })).toBeNull();
  });

  it('links to the GitHub repo', () => {
    render(<MarketingNav />);
    expect(screen.getByRole('link', { name: /github/i }).getAttribute('href')).toBe(REPO_URL);
  });
});
