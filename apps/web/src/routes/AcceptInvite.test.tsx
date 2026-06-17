import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { InvitePreview, User } from '@productmap/shared';
import { AuthProvider } from '@/lib/auth';
import AcceptInvite from './AcceptInvite';

// Node's experimental webstorage shadows jsdom's localStorage in this env —
// install a working in-memory Storage (mirrors SharePage.test.tsx).
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});

const me: User = { id: 'u1', name: 'Ada', color: '#abc', role: 'member' };

const validPreview: InvitePreview = {
  projectId: 'p9',
  projectName: 'ProductMap',
  role: 'editor',
  expired: false,
};

let authStatus = 200; // 200 → authed, 401 → logged out
let acceptCalls: string[] = [];

const server = setupServer(
  http.get('/api/auth/me', () => {
    if (authStatus === 401) return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
    return HttpResponse.json(me);
  }),
  http.get('/api/invites/:token', ({ params }) => {
    if (params.token === 'expired-tok') {
      return HttpResponse.json({ ...validPreview, expired: true });
    }
    if (params.token === 'missing-tok') {
      return HttpResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return HttpResponse.json(validPreview);
  }),
  http.post('/api/invites/:token/accept', ({ params }) => {
    acceptCalls.push(params.token as string);
    if (params.token === 'boom-tok') {
      return new HttpResponse(null, { status: 500 });
    }
    return HttpResponse.json({ projectId: 'p9', role: 'editor' });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  authStatus = 200;
  acceptCalls = [];
  localStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

/** Render the accept page at /invite/:token with a sibling /login route to
 *  observe the logged-out redirect target. */
/** Stand-in for the Login route that surfaces the router search string so the
 *  redirect target (`?next=`) can be asserted. */
function LoginProbe() {
  const location = useLocation();
  return <div>Login route: {location.search || 'no-search'}</div>;
}

function renderInvite(token: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/invite/${token}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/invite/:token" element={<AcceptInvite />} />
            <Route path="/login" element={<LoginProbe />} />
            <Route path="/" element={<div>Landing route</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AcceptInvite', () => {
  it('authed + valid token → shows project name + role + Accept; clicking accepts and lands on /', async () => {
    renderInvite('tok1');

    expect(await screen.findByText('ProductMap')).toBeDefined();
    expect(screen.getByText(/as editor/i)).toBeDefined();
    const accept = screen.getByRole('button', { name: /accept/i });

    await userEvent.click(accept);

    await waitFor(() => expect(acceptCalls).toEqual(['tok1']));
    expect(await screen.findByText('Landing route')).toBeDefined();
    expect(localStorage.getItem('pm.activeProjectId')).toBe('p9');
  });

  it('accept failure → shows inline error and does NOT navigate to /', async () => {
    renderInvite('boom-tok');

    const accept = await screen.findByRole('button', { name: /accept/i });
    await userEvent.click(accept);

    expect(await screen.findByText(/couldn't accept this invite/i)).toBeDefined();
    expect(screen.queryByText('Landing route')).toBeNull();
    expect(localStorage.getItem('pm.activeProjectId')).toBeNull();
  });

  it('expired preview → shows expired message and no Accept button', async () => {
    renderInvite('expired-tok');

    expect(await screen.findByText(/this invite has expired/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('unknown/revoked token (404) → shows not-found message', async () => {
    renderInvite('missing-tok');

    expect(await screen.findByText(/invite not found or revoked/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('logged out (auth 401) → redirects to /login carrying ?next=/invite/:token', async () => {
    authStatus = 401;
    renderInvite('tok1');

    expect(await screen.findByText(/Login route:/)).toBeDefined();
    expect(screen.getByText(/\?next=\/invite\/tok1/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });
});
