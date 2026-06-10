import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@productmap/shared';
import { USER_ID_KEY } from '@/lib/api';
import WelcomeDialog from './WelcomeDialog';

// Node's experimental webstorage shadows jsdom's localStorage in this env
// (methods are undefined) — install a working in-memory Storage.
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

const corban: User = {
  id: 'u1',
  name: 'Corban',
  color: '#2b557e',
  createdAt: '2026-06-09T00:00:00Z',
};

let users: User[] = [];
let created: unknown = null;

const server = setupServer(
  http.get('/api/users', () => HttpResponse.json(users)),
  http.post('/api/users', async ({ request }) => {
    created = await request.json();
    return HttpResponse.json(corban, { status: 201 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  users = [];
  created = null;
  localStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WelcomeDialog />
    </QueryClientProvider>,
  );
}

describe('WelcomeDialog', () => {
  it('prompts for a name on first run, creates the user, and stores the id', async () => {
    renderDialog();
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Corban');
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    await waitFor(() => expect(localStorage.getItem(USER_ID_KEY)).toBe('u1'));
    expect(created).toEqual({ name: 'Corban' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('disables submit until a name is entered', async () => {
    renderDialog();
    await screen.findByRole('dialog');
    const button = screen.getByRole('button', { name: 'Get started' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'C');
    expect(button.disabled).toBe(false);
  });

  it('silently adopts the first user when users exist but no pmUserId is stored', async () => {
    users = [corban, { ...corban, id: 'u2', name: 'Sam' }];
    renderDialog();
    await waitFor(() => expect(localStorage.getItem(USER_ID_KEY)).toBe('u1'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does nothing when pmUserId is already stored', async () => {
    localStorage.setItem(USER_ID_KEY, 'u9');
    users = [corban];
    renderDialog();
    // give the users query a chance to settle
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(localStorage.getItem(USER_ID_KEY)).toBe('u9');
  });
});
