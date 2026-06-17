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
