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
    expect(screen.getByRole('link', { name: /star|github/i }).getAttribute('href')).toBe(REPO_URL);
  });

  it('shows the static fallback count when the fetch rejects (air-gapped)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<GitHubStars />);
    expect(await screen.findByText(STARS_FALLBACK.toLocaleString('en-US'))).toBeTruthy();
  });
});
