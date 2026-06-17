import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { FeatureWithDocs } from '@productmap/shared';
import Board from '@/routes/Board';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

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

const now = '2026-06-09T00:00:00.000Z';

function makeFeature(overrides: Partial<FeatureWithDocs>): FeatureWithDocs {
  return {
    id: 'f1',
    projectId: 'p1',
    title: 'Feature',
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

let fixture: FeatureWithDocs[] = [];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get('/api/users', () => HttpResponse.json([])),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features`, () => HttpResponse.json(fixture)),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features/:id`, ({ params }) => {
    const f = fixture.find((x) => x.id === params.id);
    return f ? HttpResponse.json(f) : new HttpResponse(null, { status: 404 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  localStorage.clear();
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

function cardOf(title: string) {
  return screen.getByLabelText(title) as HTMLElement;
}

describe('VoteWidget on board cards', () => {
  it('voting boost is optimistic, then confirmed by the server', async () => {
    fixture = [makeFeature({ id: 'f1', title: 'Alpha', boosts: 2, cools: 1, score: 1, myVote: 0 })];
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`/api/projects/${TEST_PROJECT_ID}/features/:id/vote`, async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        await delay(60);
        return HttpResponse.json({ score: 2, boosts: 3, cools: 1, myVote: 1 });
      }),
    );
    renderBoard();
    const card = await waitFor(() => cardOf('Alpha'));
    const boost = within(card).getByRole('button', { name: /boost/i });
    expect(boost.getAttribute('aria-pressed')).toBe('false');
    await user().click(boost);
    // optimistic: count + tint flip immediately (server still delayed)
    expect(within(card).getByRole('button', { name: /boost/i }).textContent).toContain('3');
    expect(within(card).getByRole('button', { name: /boost/i }).getAttribute('aria-pressed')).toBe('true');
    expect(within(card).getByTestId('vote-score').textContent).toBe('+2');
    await waitFor(() => expect(putBody).toEqual({ value: 1 }));
  });

  it('clicking my active vote again un-votes (PUT value 0) and decrements', async () => {
    fixture = [makeFeature({ id: 'f1', title: 'Alpha', boosts: 3, cools: 0, score: 3, myVote: 1 })];
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`/api/projects/${TEST_PROJECT_ID}/features/:id/vote`, async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        const summary = { score: 2, boosts: 2, cools: 0, myVote: 0 as const };
        fixture = [{ ...fixture[0], ...summary }];
        return HttpResponse.json(summary);
      }),
    );
    renderBoard();
    const card = await waitFor(() => cardOf('Alpha'));
    const boost = within(card).getByRole('button', { name: /boost/i });
    expect(boost.getAttribute('aria-pressed')).toBe('true');
    await user().click(boost);
    expect(within(card).getByRole('button', { name: /boost/i }).textContent).toContain('2');
    expect(within(card).getByRole('button', { name: /boost/i }).getAttribute('aria-pressed')).toBe('false');
    await waitFor(() => expect(putBody).toEqual({ value: 0 }));
  });

  it('clicking the other control flips the vote', async () => {
    fixture = [makeFeature({ id: 'f1', title: 'Alpha', boosts: 1, cools: 0, score: 1, myVote: 1 })];
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`/api/projects/${TEST_PROJECT_ID}/features/:id/vote`, async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        const summary = { score: -1, boosts: 0, cools: 1, myVote: -1 as const };
        fixture = [{ ...fixture[0], ...summary }];
        return HttpResponse.json(summary);
      }),
    );
    renderBoard();
    const card = await waitFor(() => cardOf('Alpha'));
    await user().click(within(card).getByRole('button', { name: /cool/i }));
    // optimistic flip: boosts 1→0, cools 0→1, score +1→−1
    expect(within(card).getByRole('button', { name: /boost/i }).textContent).toContain('0');
    expect(within(card).getByRole('button', { name: /cool/i }).textContent).toContain('1');
    expect(within(card).getByRole('button', { name: /cool/i }).getAttribute('aria-pressed')).toBe('true');
    expect(within(card).getByTestId('vote-score').textContent).toBe('−1');
    await waitFor(() => expect(putBody).toEqual({ value: -1 }));
  });

  it('rolls back the optimistic vote on server error', async () => {
    fixture = [makeFeature({ id: 'f1', title: 'Alpha', boosts: 2, cools: 0, score: 2, myVote: 0 })];
    server.use(
      http.put(`/api/projects/${TEST_PROJECT_ID}/features/:id/vote`, async () => {
        await delay(60);
        return new HttpResponse(null, { status: 500 });
      }),
    );
    renderBoard();
    const card = await waitFor(() => cardOf('Alpha'));
    await user().click(within(card).getByRole('button', { name: /boost/i }));
    expect(within(card).getByRole('button', { name: /boost/i }).textContent).toContain('3');
    await waitFor(() => {
      expect(within(card).getByRole('button', { name: /boost/i }).textContent).toContain('2');
    });
    expect(within(card).getByRole('button', { name: /boost/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking a vote control does not open the feature peek', async () => {
    fixture = [makeFeature({ id: 'f1', title: 'Alpha' })];
    server.use(
      http.put(`/api/projects/${TEST_PROJECT_ID}/features/:id/vote`, () =>
        HttpResponse.json({ score: 1, boosts: 1, cools: 0, myVote: 1 }),
      ),
    );
    renderBoard();
    const card = await waitFor(() => cardOf('Alpha'));
    await user().click(within(card).getByRole('button', { name: /boost/i }));
    // detail panel (title input) never opens
    expect(screen.queryByDisplayValue('Alpha')).toBeNull();
  });
});

describe('Board sort toggle', () => {
  const ordering = () => {
    const col = screen.getByTestId('column-now');
    const text = col.textContent ?? '';
    return text.indexOf('Alpha') < text.indexOf('Bravo') ? 'Alpha-first' : 'Bravo-first';
  };

  beforeEach(() => {
    fixture = [
      makeFeature({ id: 'f1', title: 'Alpha', sortOrder: 0, score: 1, boosts: 1 }),
      makeFeature({ id: 'f2', title: 'Bravo', sortOrder: 1, score: 5, boosts: 5 }),
    ];
  });

  it('Score sorts columns by net score desc, Manual restores, choice persists', async () => {
    renderBoard();
    await waitFor(() => cardOf('Alpha'));
    expect(ordering()).toBe('Alpha-first');

    await user().click(screen.getByRole('button', { name: /score/i }));
    expect(ordering()).toBe('Bravo-first');
    expect(localStorage.getItem('pmBoardSort')).toBe('score');

    await user().click(screen.getByRole('button', { name: /manual/i }));
    expect(ordering()).toBe('Alpha-first');
    expect(localStorage.getItem('pmBoardSort')).toBe('manual');
  });

  it('reads the persisted choice on load', async () => {
    localStorage.setItem('pmBoardSort', 'score');
    renderBoard();
    await waitFor(() => cardOf('Alpha'));
    expect(ordering()).toBe('Bravo-first');
    const scoreBtn = screen.getByRole('button', { name: /score/i });
    expect(scoreBtn.getAttribute('aria-pressed')).toBe('true');
  });
});
