import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SharingBlock, SHARE_URL_KEY } from './SharingBlock';

// Node's experimental webstorage shadows jsdom's localStorage in this env —
// install a working in-memory Storage (mirrors WorkspaceTab.test.tsx).
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

let createCalls = 0;
let revokedToken: string | null = null;

const server = setupServer(
  http.post('/api/share/roadmap', () => {
    createCalls += 1;
    return HttpResponse.json({ url: '/share/tok-abc' }, { status: 201 });
  }),
  http.delete('/api/share/:token', ({ params }) => {
    revokedToken = params.token as string;
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  createCalls = 0;
  revokedToken = null;
  localStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderBlock() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SharingBlock />
    </QueryClientProvider>,
  );
}

describe('SharingBlock', () => {
  it('creates a share link and shows the absolute URL', async () => {
    const user = userEvent.setup();
    renderBlock();

    await user.click(screen.getByRole('button', { name: 'Create share link' }));

    const input = await screen.findByRole('textbox', { name: 'Share link' });
    expect((input as HTMLInputElement).value).toContain('/share/tok-abc');
    expect(createCalls).toBe(1);
    expect(localStorage.getItem(SHARE_URL_KEY)).toBe('/share/tok-abc');
  });

  it('revokes the link and returns to the create state', async () => {
    localStorage.setItem(SHARE_URL_KEY, '/share/tok-abc');
    const user = userEvent.setup();
    renderBlock();

    await user.click(screen.getByRole('button', { name: 'Revoke link' }));

    expect(await screen.findByRole('button', { name: 'Create share link' })).toBeDefined();
    expect(revokedToken).toBe('tok-abc');
    expect(localStorage.getItem(SHARE_URL_KEY)).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull();
  });

  it('clears a stale link when the server says it was already revoked (404)', async () => {
    server.use(
      http.delete('/api/share/:token', () =>
        HttpResponse.json({ error: 'not_found' }, { status: 404 }),
      ),
    );
    localStorage.setItem(SHARE_URL_KEY, '/share/tok-old');
    const user = userEvent.setup();
    renderBlock();

    await user.click(screen.getByRole('button', { name: 'Revoke link' }));

    expect(await screen.findByRole('button', { name: 'Create share link' })).toBeDefined();
    expect(localStorage.getItem(SHARE_URL_KEY)).toBeNull();
  });
});
