import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkspaceTab from './WorkspaceTab';

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

const product = {
  id: 'p1',
  name: 'ProductMap',
  vision: 'See the whole map.',
  aboutMd: '',
};

let productPatch: unknown = null;
let resetCalls = 0;

const server = setupServer(
  http.get('/api/overview', () =>
    HttpResponse.json({ product, features: [], recentActivity: [] }),
  ),
  http.patch('/api/products/:id', async ({ request, params }) => {
    productPatch = { id: params.id, body: await request.json() };
    const body = (productPatch as { body: Record<string, unknown> }).body;
    return HttpResponse.json({ ...product, ...body });
  }),
  http.post('/api/admin/reset-demo', () => {
    resetCalls += 1;
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  productPatch = null;
  resetCalls = 0;
  localStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WorkspaceTab />
    </QueryClientProvider>,
  );
}

describe('WorkspaceTab', () => {
  it('shows the product name and vision and PATCHes changed fields on save', async () => {
    renderTab();
    const name = await screen.findByRole('textbox', { name: 'Product name' });
    const vision = screen.getByRole('textbox', { name: 'Vision' });
    expect((name as HTMLInputElement).value).toBe('ProductMap');
    expect((vision as HTMLInputElement).value).toBe('See the whole map.');

    // Save is disabled until something changes.
    expect(
      (screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await userEvent.clear(vision);
    await userEvent.type(vision, 'Map everything.');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(productPatch).toEqual({ id: 'p1', body: { vision: 'Map everything.' } }),
    );
  });

  it('exposes the workspace export as a download link', async () => {
    renderTab();
    const link = await screen.findByRole('link', { name: /export workspace/i });
    expect(link.getAttribute('href')).toBe('/api/export.zip');
  });

  it('reset demo is confirm-gated and POSTs /api/admin/reset-demo', async () => {
    renderTab();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reset demo data' }),
    );
    expect(resetCalls).toBe(0); // not yet — dialog first
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/reset/i);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, reset everything' }));
    await waitFor(() => expect(resetCalls).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cancelling the confirm dialog does not reset', async () => {
    renderTab();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reset demo data' }),
    );
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(resetCalls).toBe(0);
  });
});
