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
    expect(screen.getByRole('link', { name: /deploy your own/i }).getAttribute('href')).toBe(REPO_URL);
  });

  it('secondary CTA "Sign in" points at /login', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/login');
  });

  it('renders the framed screenshot', () => {
    render(<Hero />);
    expect(screen.getByRole('img', { name: /productmap/i }).getAttribute('src')).toBe('/marketing/hero.png');
  });
});
