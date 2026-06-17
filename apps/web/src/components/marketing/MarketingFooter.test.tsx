import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MarketingFooter from './MarketingFooter';
import { REPO_URL } from '@/lib/marketing';

afterEach(cleanup);

describe('MarketingFooter', () => {
  it('links to GitHub and shows "powered by ProductMap"', () => {
    render(<MarketingFooter />);
    expect(screen.getByRole('link', { name: /github/i }).getAttribute('href')).toBe(REPO_URL);
    expect(screen.getByText(/powered by productmap/i)).toBeTruthy();
  });
});
