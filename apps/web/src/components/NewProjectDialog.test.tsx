import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ActiveProjectProvider } from '@/lib/project';
import { NewProjectDialog } from './NewProjectDialog';

// Node's experimental webstorage shadows jsdom's localStorage — install a shim.
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

// jsdom polyfills for Radix Dialog.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error test polyfill
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

let createBody: unknown = null;

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: 'p1', name: 'Alpha', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.post('/api/projects', async ({ request }) => {
    createBody = await request.json();
    return HttpResponse.json({ id: 'p-new', name: 'Beta', vision: '', aboutMd: '', role: 'owner' });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  createBody = null;
  localStorage.clear();
  vi.clearAllMocks();
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
      <MemoryRouter initialEntries={['/?new=1']}>
        <ActiveProjectProvider>
          <NewProjectDialog />
        </ActiveProjectProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NewProjectDialog', () => {
  it('with ≥1 project + ?new=1, opens; submitting POSTs and persists the new id', async () => {
    renderDialog();
    // Dialog renders because of ?new=1 (the switcher's "New project…" target).
    const dialog = await screen.findByRole('dialog', { name: /create a project/i });
    await userEvent.type(screen.getByLabelText('Project name'), 'Beta');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => expect(createBody).toMatchObject({ name: 'Beta' }));
    await waitFor(() =>
      expect(localStorage.getItem('pm.activeProjectId')).toBe('p-new'),
    );
    expect(dialog).toBeTruthy();
  });
});
