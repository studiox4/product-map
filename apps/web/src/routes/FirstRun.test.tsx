import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import FirstRun from './FirstRun';

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

let lastPostBody: unknown = null;

const server = setupServer(
  http.get('/api/projects', () => HttpResponse.json([])),
  http.post('/api/projects', async ({ request }) => {
    lastPostBody = await request.json();
    return HttpResponse.json({ id: 'p9', name: 'My App', role: 'owner' });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
  lastPostBody = null;
});
afterAll(() => server.close());

function renderRoute(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FirstRun', () => {
  it('creates a project with the typed name', async () => {
    renderRoute(<FirstRun />);
    await userEvent.type(screen.getByLabelText(/project name/i), 'My App');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(lastPostBody).toEqual({ name: 'My App' }));
  });
});
