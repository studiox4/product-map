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

  it('CTA "Try the live demo" points at /demo', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: /try the live demo/i }).getAttribute('href')).toBe('/demo');
  });

  it('primary CTA "Deploy your own" points at the GitHub repo', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: /deploy your own/i }).getAttribute('href')).toBe(REPO_URL);
  });

  it('has no login CTA — the public site routes to the demo, not auth', () => {
    render(<Hero />);
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
  });

  it('leads with the animated Stagger hero graphic (screenshot moved to the proof strip)', () => {
    const { container } = render(<Hero />);
    // Right column is now the animated SVG, not the static hero.png img.
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /productmap roadmap board/i })).toBeNull();
  });
});
