/**
 * Tests for feature archive/restore/purge (E1-archive Task 7).
 *
 * Covers:
 * - Archiving a feature calls POST /archive (not DELETE) and navigates away.
 * - Archived view renders archived features with Restore + Delete-permanently.
 * - Restore calls POST /restore.
 * - Delete-permanently (behind confirm) calls DELETE.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { FeatureWithDocs } from '@productmap/shared';
import Board from '@/routes/Board';
import FeaturePage from '@/routes/FeaturePage';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

// In-memory localStorage (Node experimental webstorage shadows jsdom's)
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });

// jsdom polyfills for Radix
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

const now = '2026-06-24T00:00:00.000Z';

function makeFeature(overrides: Partial<FeatureWithDocs>): FeatureWithDocs {
  return {
    id: 'f1',
    projectId: TEST_PROJECT_ID,
    title: 'Alpha Feature',
    horizon: 'now',
    status: 'planned',
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
    createdAt: now,
    updatedAt: now,
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0,
    documents: [],
    ...overrides,
  };
}

const activeFeature = makeFeature({ id: 'f1', title: 'Alpha Feature' });
const archivedFeature = makeFeature({ id: 'f2', title: 'Archived Feature' });

let boardFeatures: FeatureWithDocs[] = [activeFeature];
let archivedFeatures: FeatureWithDocs[] = [];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{
      id: TEST_PROJECT_ID,
      name: 'Test Project',
      slug: 'test',
      vision: '',
      aboutMd: '',
      role: 'owner',
    }]),
  ),
  http.get('/api/users', () => HttpResponse.json([])),
  http.get('/api/ai/status', () => HttpResponse.json({ enabled: false })),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('archived') === '1') {
      return HttpResponse.json(archivedFeatures);
    }
    return HttpResponse.json(boardFeatures);
  }),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features/:id`, ({ params }) => {
    const f = [...boardFeatures, ...archivedFeatures].find((x) => x.id === params.id);
    return f ? HttpResponse.json(f) : new HttpResponse(null, { status: 404 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
beforeEach(() => {
  localStorage.clear();
  boardFeatures = [activeFeature];
  archivedFeatures = [];
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderBoard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter initialEntries={['/board']}>
          <Routes>
            <Route path="/board" element={<Board />} />
          </Routes>
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

function renderFeaturePage(featureId: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter initialEntries={[`/app/features/${featureId}`]}>
          <Routes>
            <Route path="/app/features/:id" element={<FeaturePage />} />
            <Route path="/app/board" element={<div data-testid="board-page">Board</div>} />
          </Routes>
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('FeaturePage archive', () => {
  it('shows Archive feature button (not Delete feature)', async () => {
    renderFeaturePage('f1');
    expect(await screen.findByRole('button', { name: /archive feature/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /delete feature/i })).toBeNull();
  });

  it('clicking Archive opens a dialog with restorable copy', async () => {
    renderFeaturePage('f1');
    const archiveBtn = await screen.findByRole('button', { name: /archive feature/i });
    await user().click(archiveBtn);
    expect(await screen.findByText(/archive this feature/i)).toBeTruthy();
    expect(screen.getByText(/restore it from the board/i)).toBeTruthy();
  });

  it('confirming archive POSTs to /archive (not DELETE) and navigates to board', async () => {
    let archiveCalled = false;
    let deleteCalled = false;

    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/features/f1/archive`, () => {
        archiveCalled = true;
        boardFeatures = [];
        archivedFeatures = [archivedFeature];
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`/api/projects/${TEST_PROJECT_ID}/features/f1`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderFeaturePage('f1');
    const archiveBtn = await screen.findByRole('button', { name: /archive feature/i });
    await user().click(archiveBtn);
    const confirmBtn = await screen.findByRole('button', { name: /^archive$/i });
    await user().click(confirmBtn);

    await waitFor(() => expect(archiveCalled).toBe(true));
    expect(deleteCalled).toBe(false);
    // Should navigate to board
    await waitFor(() => expect(screen.queryByTestId('board-page')).toBeTruthy());
  });
});

describe('Board archived view', () => {
  it('renders the Archived tab toggle', async () => {
    renderBoard();
    expect(await screen.findByRole('button', { name: /archived/i })).toBeTruthy();
  });

  it('switching to Archived view shows archived features with Restore and Delete permanently', async () => {
    archivedFeatures = [archivedFeature];
    renderBoard();
    const archivedTab = await screen.findByRole('button', { name: /archived/i });
    await user().click(archivedTab);
    expect(await screen.findByText('Archived Feature')).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /delete permanently/i })).toBeTruthy();
  });

  it('Restore calls POST /restore', async () => {
    archivedFeatures = [archivedFeature];
    let restoreCalled = false;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/features/f2/restore`, () => {
        restoreCalled = true;
        archivedFeatures = [];
        boardFeatures = [activeFeature, { ...archivedFeature, id: 'f2' }];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderBoard();
    const archivedTab = await screen.findByRole('button', { name: /archived/i });
    await user().click(archivedTab);
    const restoreBtn = await screen.findByRole('button', { name: /restore/i });
    await user().click(restoreBtn);

    await waitFor(() => expect(restoreCalled).toBe(true));
  });

  it('Delete permanently (behind confirm) calls DELETE', async () => {
    archivedFeatures = [archivedFeature];
    let purgeCalled = false;

    // Intercept window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    server.use(
      http.delete(`/api/projects/${TEST_PROJECT_ID}/features/f2`, () => {
        purgeCalled = true;
        archivedFeatures = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderBoard();
    const archivedTab = await screen.findByRole('button', { name: /archived/i });
    await user().click(archivedTab);
    const purgeBtn = await screen.findByRole('button', { name: /delete permanently/i });
    await user().click(purgeBtn);

    await waitFor(() => expect(purgeCalled).toBe(true));
    vi.restoreAllMocks();
  });

  it('Delete permanently is cancelled when confirm returns false', async () => {
    archivedFeatures = [archivedFeature];
    let purgeCalled = false;

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    server.use(
      http.delete(`/api/projects/${TEST_PROJECT_ID}/features/f2`, () => {
        purgeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderBoard();
    const archivedTab = await screen.findByRole('button', { name: /archived/i });
    await user().click(archivedTab);
    const purgeBtn = await screen.findByRole('button', { name: /delete permanently/i });
    await user().click(purgeBtn);

    // Brief wait — purge should NOT be called
    await new Promise((r) => setTimeout(r, 100));
    expect(purgeCalled).toBe(false);
    vi.restoreAllMocks();
  });
});
