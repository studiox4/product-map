import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { FeatureWithDocs } from '@productmap/shared';
import Board from '@/routes/Board';
import { useUpdateFeature } from '@/lib/api';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

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
const fixture: FeatureWithDocs[] = [
  {
    id: 'f1',
    projectId: 'p1',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0 as const,
    title: 'Rich markdown editor',
    horizon: 'now',
    status: 'in_progress',
    startDate: '2026-06-01',
    endDate: '2026-06-20',
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
    documents: [
      { id: 'd1', featureId: 'f1', type: 'prd', title: 'Editor PRD', status: 'draft', createdBy: null, updatedBy: null, createdAt: now, updatedAt: now },
    ],
  },
  {
    id: 'f2',
    projectId: 'p1',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0 as const,
    title: 'Gantt roadmap',
    horizon: 'next',
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
    documents: [],
  },
];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get('/api/users', () => HttpResponse.json([])),
  // New-doc dialog lists DB templates (settings/templates addendum).
  http.get('/api/templates', () =>
    HttpResponse.json([
      {
        id: 'tpl-prd',
        type: 'prd',
        name: 'PRD',
        description: 'Problem, goals, requirements.',
        bodyJson: { type: 'doc', content: [] },
        bodyMd: '',
        promptHints: '',
        isDefault: true,
        archivedAt: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      },
    ]),
  ),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features`, async () => {
    await delay(20);
    return HttpResponse.json(fixture);
  }),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features/:id`, ({ params }) => {
    const f = fixture.find((x) => x.id === params.id);
    return f ? HttpResponse.json(f) : new HttpResponse(null, { status: 404 });
  }),
  http.patch(`/api/projects/${TEST_PROJECT_ID}/features/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const f = fixture.find((x) => x.id === params.id)!;
    return HttpResponse.json({ ...f, ...body });
  }),
  http.post(`/api/projects/${TEST_PROJECT_ID}/documents`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: 'd-new',
        featureId: body.featureId,
        type: body.type,
        title: body.title,
        status: 'draft',
        contentJson: { type: 'doc', content: [] },
        contentMd: '',
        createdAt: now,
        updatedAt: now,
      },
      { status: 201 },
    );
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// Radix puts pointer-events:none on <body> while a sheet/dialog is open;
// jsdom can't resolve the cascade back to auto on portal content.
const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function Mover({ id }: { id: string }) {
  const m = useUpdateFeature();
  return (
    <button type="button" onClick={() => m.mutate({ id, horizon: 'now' })}>
      move-it
    </button>
  );
}

function renderBoard(opts: { entries?: string[]; withMover?: string } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter initialEntries={opts.entries ?? ['/board']}>
          <Routes>
            <Route
              path="/board"
              element={
                <>
                  <Board />
                  {opts.withMover ? <Mover id={opts.withMover} /> : null}
                </>
              }
            />
            <Route path="/docs/:id" element={<div>doc page</div>} />
          </Routes>
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('Board', () => {
  it('shows loading skeleton, then 3 columns with cards and counts', async () => {
    renderBoard();
    // ProjectProvider resolves first (no delay), then Board renders its own
    // loading skeleton while features fetch (delayed 20 ms) is in-flight.
    expect(await screen.findByTestId('board-skeleton')).toBeTruthy();
    await screen.findByText('Rich markdown editor');
    expect(screen.getByText('Gantt roadmap')).toBeTruthy();
    const nowCol = screen.getByTestId('column-now');
    expect(within(nowCol).getByText('Rich markdown editor')).toBeTruthy();
    expect(screen.getByTestId('column-now-count').textContent).toBe('1');
    expect(screen.getByTestId('column-next-count').textContent).toBe('1');
    expect(screen.getByTestId('column-later-count').textContent).toBe('0');
  });

  it('shows empty state in a column with no features', async () => {
    renderBoard();
    await screen.findByText('Rich markdown editor');
    const laterCol = screen.getByTestId('column-later');
    expect(within(laterCol).getByText(/nothing here yet/i)).toBeTruthy();
  });

  it('optimistically moves a feature, then rolls back on 500', async () => {
    server.use(
      http.patch(`/api/projects/${TEST_PROJECT_ID}/features/:id`, async () => {
        await delay(80);
        return new HttpResponse(null, { status: 500 });
      }),
    );
    renderBoard({ withMover: 'f2' });
    await screen.findByText('Gantt roadmap');
    await user().click(screen.getByText('move-it'));
    // optimistic: f2 appears in Now column immediately
    await waitFor(() => {
      expect(within(screen.getByTestId('column-now')).getByText('Gantt roadmap')).toBeTruthy();
    });
    // rollback after 500
    await waitFor(() => {
      expect(within(screen.getByTestId('column-next')).getByText('Gantt roadmap')).toBeTruthy();
    });
  });

  it('Enter on a card opens the detail panel', async () => {
    renderBoard();
    const card = await screen.findByText('Rich markdown editor');
    const cardEl = card.closest('[role="button"]') as HTMLElement;
    cardEl.focus();
    await user().keyboard('{Enter}');
    expect(await screen.findByDisplayValue('Rich markdown editor')).toBeTruthy();
  });

  it('?feature= deep link opens the detail panel', async () => {
    renderBoard({ entries: ['/board?feature=f1'] });
    expect(await screen.findByDisplayValue('Rich markdown editor')).toBeTruthy();
    // docs listed in panel
    expect(await screen.findByText('Editor PRD')).toBeTruthy();
  });

  it('new-doc dialog: opens, Esc closes, focus returns to trigger', async () => {
    renderBoard({ entries: ['/board?feature=f1'] });
    await screen.findByDisplayValue('Rich markdown editor');
    const trigger = screen.getByRole('button', { name: /new doc/i });
    await user().click(trigger);
    expect(await screen.findByRole('dialog', { name: /new doc/i })).toBeTruthy();
    // title prefilled "<feature> — <type label>"
    expect(screen.getByDisplayValue('Rich markdown editor — PRD')).toBeTruthy();
    await user().keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /new doc/i })).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('creating a doc navigates to the editor route', async () => {
    renderBoard({ entries: ['/board?feature=f1'] });
    await screen.findByDisplayValue('Rich markdown editor');
    await user().click(screen.getByRole('button', { name: /new doc/i }));
    await screen.findByRole('dialog', { name: /new doc/i });
    await user().click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText('doc page')).toBeTruthy();
  });

  it('inverted dates show an inline validation error', async () => {
    renderBoard({ entries: ['/board?feature=f1'] });
    await screen.findByDisplayValue('Rich markdown editor');
    const start = screen.getByLabelText(/start date/i) as HTMLInputElement;
    const end = screen.getByLabelText(/end date/i) as HTMLInputElement;
    await user().clear(end);
    await user().type(end, '2026-05-01');
    expect(start.value).toBe('2026-06-01');
    expect(await screen.findByText(/start date must be on or before end date/i)).toBeTruthy();
  });

  it('"+ Add feature" opens dialog and creates a feature in that column', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/features`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: 'f-new',
            projectId: 'p1',
            score: 0,
            boosts: 0,
            cools: 0,
            myVote: 0 as const,
            title: posted.title,
            horizon: posted.horizon,
            status: 'idea',
            startDate: null,
            endDate: null,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          },
          { status: 201 },
        );
      }),
    );
    renderBoard();
    await screen.findByText('Rich markdown editor');
    const laterCol = screen.getByTestId('column-later');
    await user().click(within(laterCol).getByRole('button', { name: /add feature/i }));
    const dialog = await screen.findByRole('dialog', { name: /add feature/i });
    await user().type(within(dialog).getByLabelText(/title/i), 'Demo Feature X');
    await user().click(within(dialog).getByRole('button', { name: /^create$/i }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ title: 'Demo Feature X', horizon: 'later' });
  });

  it('role-aware: editor sees "Add feature" in every column', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([
          { id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'editor' },
        ]),
      ),
    );
    renderBoard();
    await screen.findByText('Rich markdown editor');
    expect(screen.getAllByRole('button', { name: /add feature/i }).length).toBe(3);
  });

  it('role-aware: viewer sees no "Add feature" control', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([
          { id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'viewer' },
        ]),
      ),
    );
    renderBoard();
    await screen.findByText('Rich markdown editor');
    expect(screen.queryByRole('button', { name: /add feature/i })).toBeNull();
  });

  it('role-aware: viewer cards are not draggable (sortable disabled)', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([
          { id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'viewer' },
        ]),
      ),
    );
    renderBoard();
    const card = (await screen.findByText('Rich markdown editor')).closest(
      '[role="button"]',
    ) as HTMLElement;
    expect(card.getAttribute('aria-disabled')).toBe('true');
  });

  it('role-aware: editor cards are draggable (sortable enabled)', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([
          { id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'editor' },
        ]),
      ),
    );
    renderBoard();
    const card = (await screen.findByText('Rich markdown editor')).closest(
      '[role="button"]',
    ) as HTMLElement;
    expect(card.getAttribute('aria-disabled')).toBe('false');
  });
});
