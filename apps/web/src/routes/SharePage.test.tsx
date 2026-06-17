import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ShareData } from '@productmap/shared';
import SharePage from './SharePage';

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

function feature(
  overrides: Partial<ShareData['features'][number]> & { id: string; title: string },
): ShareData['features'][number] {
  return {
    projectId: 'p1',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0 as const,
    horizon: 'now' as const,
    status: 'planned' as const,
    startDate: null,
    endDate: null,
    sortOrder: 0,
    descriptionMd: '',
    size: null,
    riskMd: '',
    objectiveId: null,
    releaseId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    documents: [],
    ...overrides,
  };
}

const shareData: ShareData = {
  project: { id: 'p1', name: 'ProductMap', vision: 'See the whole map.', aboutMd: '' },
  features: [
    feature({
      id: 'f1',
      title: 'Rich markdown editor',
      horizon: 'now',
      status: 'shipped',
      startDate: '2026-06-01',
      endDate: '2026-06-20',
      releaseId: 'r1',
    }),
    feature({ id: 'f2', title: 'Gantt roadmap', horizon: 'next', status: 'planned' }),
    feature({ id: 'f3', title: 'Realtime collaboration', horizon: 'later', status: 'idea' }),
  ],
  releases: [
    {
      id: 'r1',
      name: 'v0.2 — Team ready',
      targetDate: '2026-06-15',
      status: 'shipped',
      notesDocId: null,
      shippedAt: '2026-06-15T12:00:00Z',
      createdAt: '2026-05-01T00:00:00Z',
    },
    {
      id: 'r2',
      name: 'v0.3 — Planned only',
      targetDate: null,
      status: 'planned',
      notesDocId: null,
      shippedAt: null,
      createdAt: '2026-05-02T00:00:00Z',
    },
  ],
};

let lastShareRequest: Request | null = null;

const server = setupServer(
  http.get('/api/share/:token/data', ({ request, params }) => {
    lastShareRequest = request;
    if (params.token === 'revoked-tok') {
      return HttpResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return HttpResponse.json(shareData);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  lastShareRequest = null;
  localStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderShare(token: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/share/${token}`]}>
        <Routes>
          <Route path="/share/:token" element={<SharePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SharePage', () => {
  it('renders the roadmap read-only: gantt, summary columns, changelog — zero mutating affordances', async () => {
    renderShare('tok-1');

    // Product header
    expect(await screen.findByRole('heading', { name: 'ProductMap' })).toBeDefined();
    expect(screen.getByText('See the whole map.')).toBeDefined();

    // Read-only gantt with a bar for the dated feature
    const gantt = screen.getByRole('img', { name: 'Read-only roadmap gantt chart' });
    expect(gantt.querySelector('[data-share-bar="f1"]')).not.toBeNull();

    // Now / Next / Later summary columns with their features
    const summary = screen.getByRole('region', { name: 'Now, next, later' });
    for (const label of ['Now', 'Next', 'Later']) {
      expect(within(summary).getByRole('heading', { name: label })).toBeDefined();
    }
    expect(within(summary).getByText('Gantt roadmap')).toBeDefined();
    expect(within(summary).getByText('Realtime collaboration')).toBeDefined();

    // Changelog: shipped release only, with its feature list
    const changelog = screen.getByRole('region', { name: 'Changelog' });
    expect(within(changelog).getByText('v0.2 — Team ready')).toBeDefined();
    expect(within(changelog).getByText('Rich markdown editor')).toBeDefined();
    expect(screen.queryByText('v0.3 — Planned only')).toBeNull();

    // Read-only: not a single button anywhere on the page.
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    // ProductMap badge footer
    expect(screen.getByRole('link', { name: /Made with ProductMap/ })).toBeDefined();
  });

  it('fetches share data plain — without an x-user-id header', async () => {
    localStorage.setItem('pmUserId', 'u-logged-in');
    renderShare('tok-1');
    await screen.findByRole('heading', { name: 'ProductMap' });
    expect(lastShareRequest).not.toBeNull();
    expect(lastShareRequest!.headers.get('x-user-id')).toBeNull();
  });

  it('shows the not-found state when the token is revoked (404)', async () => {
    renderShare('revoked-tok');
    expect(await screen.findByText("This link isn't active")).toBeDefined();
    expect(screen.queryByRole('img', { name: /gantt/i })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // Badge footer still present on the not-found state.
    expect(screen.getByRole('link', { name: /Made with ProductMap/ })).toBeDefined();
  });
});
