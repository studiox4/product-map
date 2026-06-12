import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { IdeaWithVotes } from '@productmap/shared';
import Inbox from '@/routes/Inbox';

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

function makeIdea(overrides: Partial<IdeaWithVotes>): IdeaWithVotes {
  return {
    id: 'i1',
    title: 'Idea',
    bodyMd: '',
    source: '',
    status: 'inbox',
    promotedFeatureId: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0,
    ...overrides,
  };
}

const fixture: IdeaWithVotes[] = [
  makeIdea({
    id: 'i1',
    title: 'Bulk export to CSV',
    bodyMd: '## Why\n\nCustomers ask weekly.',
    source: 'sales call',
    score: 2,
    boosts: 3,
    cools: 1,
  }),
  makeIdea({
    id: 'i2',
    title: 'Realtime cursors',
    status: 'promoted',
    promotedFeatureId: 'f9',
    score: 5,
    boosts: 5,
  }),
];

const server = setupServer(
  http.get('/api/users', () => HttpResponse.json([])),
  http.get('/api/ai/status', () => HttpResponse.json({ enabled: true })),
  http.get('/api/ideas', ({ request }) => {
    const status = new URL(request.url).searchParams.get('status');
    return HttpResponse.json(status ? fixture.filter((i) => i.status === status) : fixture);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// Radix puts pointer-events:none on <body> while a dialog is open;
// jsdom can't resolve the cascade back to auto on portal content.
const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderInbox(entries: string[] = ['/inbox']) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={entries}>
        <Routes>
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/features/:id" element={<div>feature page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Idea Inbox', () => {
  it('shows loading skeleton, then list with vote pills and detail pane', async () => {
    renderInbox();
    expect(screen.getByTestId('inbox-skeleton')).toBeTruthy();
    await screen.findAllByText('Realtime cursors');
    const list = screen.getByRole('list', { name: /ideas/i });
    expect(within(list).getByText('Bulk export to CSV')).toBeTruthy();
    // First idea selected by default — detail shows source + rendered markdown body.
    const detail = screen.getByRole('region', { name: /idea detail/i });
    expect(within(detail).getByText(/source: sales call/i)).toBeTruthy();
    expect(within(detail).getByRole('heading', { name: 'Why' })).toBeTruthy();
    expect(within(detail).getByText('Customers ask weekly.')).toBeTruthy();
    // Vote pills carry counts (list row for i1: 3 boosts, 1 cool, +2 score).
    const row = within(list).getByText('Bulk export to CSV').closest('[role="button"]')!;
    expect(within(row as HTMLElement).getByRole('button', { name: 'Boost' }).textContent).toContain('3');
    expect(within(row as HTMLElement).getByRole('button', { name: 'Cool' }).textContent).toContain('1');
    expect(within(row as HTMLElement).getByTestId('idea-vote-score').textContent).toBe('+2');
  });

  it('shows an empty state inviting the first idea', async () => {
    server.use(http.get('/api/ideas', () => HttpResponse.json([])));
    renderInbox();
    expect(await screen.findByText(/no ideas yet/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /capture your first idea/i })).toBeTruthy();
  });

  it('status filter chips request server-side filtering', async () => {
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: 'Promoted' }));
    await waitFor(() => {
      const list = screen.getByRole('list', { name: /ideas/i });
      expect(within(list).queryByText('Bulk export to CSV')).toBeNull();
      expect(within(list).getByText('Realtime cursors')).toBeTruthy();
    });
  });

  it('captures a new idea via the dialog', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/ideas', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeIdea({ id: 'i-new', title: String(posted.title) }),
          { status: 201 },
        );
      }),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: /new idea/i }));
    const dialog = await screen.findByRole('dialog', { name: /new idea/i });
    await user().type(within(dialog).getByLabelText(/title/i), 'Slack intake');
    await user().type(within(dialog).getByLabelText(/details/i), 'Pipe #feedback in.');
    await user().type(within(dialog).getByLabelText(/source/i), 'support');
    await user().click(within(dialog).getByRole('button', { name: /capture/i }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({
      title: 'Slack intake',
      bodyMd: 'Pipe #feedback in.',
      source: 'support',
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /new idea/i })).toBeNull();
    });
  });

  it('boost pill PUTs a vote', async () => {
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/ideas/:id/vote', async ({ request, params }) => {
        expect(params.id).toBe('i1');
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ score: 3, boosts: 4, cools: 1, myVote: 1 });
      }),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    const list = screen.getByRole('list', { name: /ideas/i });
    const row = within(list).getByText('Bulk export to CSV').closest('[role="button"]')!;
    await user().click(within(row as HTMLElement).getByRole('button', { name: 'Boost' }));
    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toMatchObject({ value: 1 });
  });

  it('promotes with horizon picker + AI brief checkbox', async () => {
    let promoted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/ideas/:id/promote', async ({ request, params }) => {
        expect(params.id).toBe('i1');
        promoted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { id: 'f-new', title: 'Bulk export to CSV', horizon: promoted.horizon },
          { status: 201 },
        );
      }),
      http.get('/api/features', () => HttpResponse.json([])),
      http.get('/api/overview', () => HttpResponse.json({})),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: /promote to feature/i }));
    const dialog = await screen.findByRole('dialog', { name: /promote to feature/i });
    // Later is the default; pick Next to prove the picker drives the payload.
    await user().click(within(dialog).getByRole('radio', { name: 'Next' }));
    await user().click(within(dialog).getByRole('checkbox', { name: /draft ai brief/i }));
    await user().click(within(dialog).getByRole('button', { name: /^promote$/i }));
    await waitFor(() => expect(promoted).not.toBeNull());
    expect(promoted).toMatchObject({ horizon: 'next', withAiBrief: true });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /promote to feature/i })).toBeNull();
    });
  });

  it('hides the AI brief checkbox when AI is disabled', async () => {
    server.use(http.get('/api/ai/status', () => HttpResponse.json({ enabled: false })));
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: /promote to feature/i }));
    const dialog = await screen.findByRole('dialog', { name: /promote to feature/i });
    expect(within(dialog).getByRole('radio', { name: 'Later' })).toBeTruthy();
    expect(within(dialog).queryByRole('checkbox', { name: /draft ai brief/i })).toBeNull();
  });

  it('promoted ideas link to their feature instead of promoting again', async () => {
    renderInbox(['/inbox?idea=i2']);
    await screen.findAllByText('Realtime cursors');
    const detail = screen.getByRole('region', { name: /idea detail/i });
    const link = within(detail).getByRole('link', { name: /view feature/i });
    expect(link.getAttribute('href')).toBe('/features/f9');
    expect(within(detail).queryByRole('button', { name: /promote to feature/i })).toBeNull();
  });

  it('?new=1 deep link (⌘K "New idea…") opens the capture dialog', async () => {
    renderInbox(['/inbox?new=1']);
    expect(await screen.findByRole('dialog', { name: /new idea/i })).toBeTruthy();
  });
});
