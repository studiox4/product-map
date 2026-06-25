import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectProvider } from '@/lib/project';
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
let lastMintBody: unknown = null;

const server = setupServer(
  // ProjectProvider calls GET /api/projects to resolve the active project id.
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: 'p-test', name: 'Test Project', role: 'owner' }]),
  ),
  // Mint route is now nested under /api/projects/:projectId/share/roadmap.
  http.post('/api/projects/:projectId/share/roadmap', async ({ request }) => {
    createCalls += 1;
    lastMintBody = await request.json().catch(() => null);
    return HttpResponse.json(
      { url: '/share/tok-abc', sections: { roadmap: true, board: true, changelog: true }, expiresAt: null },
      { status: 201 },
    );
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
  lastMintBody = null;
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
      <ProjectProvider>
        <SharingBlock />
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('SharingBlock', () => {
  it('creates a share link and shows the absolute URL', async () => {
    const user = userEvent.setup();
    renderBlock();

    // Wait for ProjectProvider to resolve the active project (GET /api/projects).
    await user.click(await screen.findByRole('button', { name: 'Create share link' }));

    const input = await screen.findByRole('textbox', { name: 'Share link' });
    expect((input as HTMLInputElement).value).toContain('/share/tok-abc');
    expect(createCalls).toBe(1);
    expect(localStorage.getItem(SHARE_URL_KEY)).toBe('/share/tok-abc');
  });

  it('sends the chosen sections + expiry in the mint request', async () => {
    const user = userEvent.setup();
    renderBlock();

    // Hide everything except the changelog, expire in 30 days.
    await user.click(await screen.findByRole('checkbox', { name: /Roadmap timeline/ }));
    await user.click(screen.getByRole('checkbox', { name: /Now \/ Next \/ Later/ }));
    await user.selectOptions(screen.getByLabelText('Expiry'), '30');

    await user.click(screen.getByRole('button', { name: 'Create share link' }));

    await screen.findByRole('textbox', { name: 'Share link' });
    expect(lastMintBody).toEqual({
      sections: { roadmap: false, board: false, changelog: true },
      expiresInDays: 30,
    });
  });

  it('disables create until at least one section is selected', async () => {
    const user = userEvent.setup();
    renderBlock();

    await screen.findByRole('checkbox', { name: /Roadmap timeline/ });
    await user.click(screen.getByRole('checkbox', { name: /Roadmap timeline/ }));
    await user.click(screen.getByRole('checkbox', { name: /Now \/ Next \/ Later/ }));
    await user.click(screen.getByRole('checkbox', { name: /Changelog/ }));

    const createBtn = screen.getByRole('button', { name: 'Create share link' });
    expect((createBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Pick at least one section.')).toBeDefined();
    expect(createCalls).toBe(0);
  });

  it('revokes the link and returns to the create state', async () => {
    localStorage.setItem(SHARE_URL_KEY, '/share/tok-abc');
    const user = userEvent.setup();
    renderBlock();

    // Wait for ProjectProvider to resolve, then the share link UI appears.
    await user.click(await screen.findByRole('button', { name: 'Revoke link' }));

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

    // Wait for ProjectProvider to resolve, then the share link UI appears.
    await user.click(await screen.findByRole('button', { name: 'Revoke link' }));

    expect(await screen.findByRole('button', { name: 'Create share link' })).toBeDefined();
    expect(localStorage.getItem(SHARE_URL_KEY)).toBeNull();
  });
});
