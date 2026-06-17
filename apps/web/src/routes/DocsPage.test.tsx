import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { DocumentListItem } from '@productmap/shared';
import DocsPage from '@/routes/DocsPage';
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

const base = {
  createdBy: null,
  updatedBy: null,
  createdAt: '2026-06-01T00:00:00.000Z',
};

const fixture: DocumentListItem[] = [
  {
    ...base,
    id: 'd1',
    featureId: 'f1',
    type: 'prd',
    title: 'Editor PRD',
    status: 'draft',
    updatedAt: '2026-06-08T00:00:00.000Z',
    featureTitle: 'Rich markdown editor',
    featureHorizon: 'now',
    wordCount: 120,
  },
  {
    ...base,
    id: 'd2',
    featureId: 'f1',
    type: 'tech_spec',
    title: 'Editor tech spec',
    status: 'in_review',
    updatedAt: '2026-06-09T00:00:00.000Z',
    featureTitle: 'Rich markdown editor',
    featureHorizon: 'now',
    wordCount: 300,
  },
  {
    ...base,
    id: 'd3',
    featureId: 'f2',
    type: 'prd',
    title: 'Gantt PRD',
    status: 'final',
    updatedAt: '2026-06-07T00:00:00.000Z',
    featureTitle: 'Gantt roadmap',
    featureHorizon: 'next',
    wordCount: 90,
  },
];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get(`/api/projects/${TEST_PROJECT_ID}/documents`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('all') !== 'true') {
      return new HttpResponse(null, { status: 400 });
    }
    return HttpResponse.json(fixture);
  }),
  http.get(`/api/projects/${TEST_PROJECT_ID}/documents/:id`, ({ params }) =>
    HttpResponse.json({
      ...fixture.find((d) => d.id === params.id)!,
      contentJson: { type: 'doc', content: [] },
      contentMd: '# Goals\n\nShip a **great** editor.',
    }),
  ),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features`, () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// Radix puts pointer-events:none on <body> while a sheet/dialog is open.
const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderDocs() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter initialEntries={['/docs']}>
          <Routes>
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/:id" element={<div>editor route</div>} />
            <Route path="/features/:id" element={<div>feature route</div>} />
          </Routes>
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

/** Title-cell text for each rendered body row, top to bottom. */
function rowTitles() {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent);
}

describe('DocsPage', () => {
  it('lists all docs with feature links, sorted by updated desc by default', async () => {
    renderDocs();
    await screen.findByText('Editor PRD');
    expect(rowTitles()).toEqual(['Editor tech spec', 'Editor PRD', 'Gantt PRD']);
    expect(screen.getByRole('link', { name: 'Gantt roadmap' })).toHaveProperty(
      'pathname',
      '/features/f2',
    );
  });

  it('composes type filter, status filter, and search', async () => {
    renderDocs();
    await screen.findByText('Editor PRD');
    const u = user();

    // Type: PRD → d1 + d3
    await u.click(screen.getByRole('button', { name: 'PRD' }));
    expect(rowTitles()).toEqual(['Editor PRD', 'Gantt PRD']);

    // + search over title/featureTitle → d1 only
    await u.type(screen.getByRole('searchbox', { name: 'Search docs' }), 'markdown');
    expect(rowTitles()).toEqual(['Editor PRD']);

    // + status: Final (d1 is draft) → no rows
    await u.click(screen.getByRole('button', { name: 'Final' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No docs match.')).toBeTruthy();

    // Toggle type pill off again → still filtered by status+search → empty
    await u.click(screen.getByRole('button', { name: 'Final' }));
    expect(rowTitles()).toEqual(['Editor PRD']);
  });

  it('sorts by title and toggles direction on repeated header clicks', async () => {
    renderDocs();
    await screen.findByText('Editor PRD');
    const u = user();

    await u.click(screen.getByRole('button', { name: 'Title' }));
    expect(rowTitles()).toEqual(['Editor PRD', 'Editor tech spec', 'Gantt PRD']);

    await u.click(screen.getByRole('button', { name: 'Title' }));
    expect(rowTitles()).toEqual(['Gantt PRD', 'Editor tech spec', 'Editor PRD']);

    // Updated toggles back to asc/desc independently
    await u.click(screen.getByRole('button', { name: 'Updated' }));
    expect(rowTitles()).toEqual(['Editor tech spec', 'Editor PRD', 'Gantt PRD']);
    await u.click(screen.getByRole('button', { name: 'Updated' }));
    expect(rowTitles()).toEqual(['Gantt PRD', 'Editor PRD', 'Editor tech spec']);
  });

  it('opens the preview sheet on row click and renders sanitized markdown', async () => {
    renderDocs();
    await screen.findByText('Editor PRD');
    const u = user();

    await u.click(screen.getByText('Editor PRD'));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Editor PRD')).toBeTruthy();
    // marked-rendered markdown
    const heading = await within(sheet).findByRole('heading', { name: 'Goals' });
    expect(heading.tagName).toBe('H1');
    expect(within(sheet).getByText('great').tagName).toBe('STRONG');
    // open in editor link
    expect(within(sheet).getByRole('link', { name: /open in editor/i })).toHaveProperty(
      'pathname',
      '/docs/d1',
    );
  });

  it('sanitizes markup in doc content', async () => {
    server.use(
      http.get(`/api/projects/${TEST_PROJECT_ID}/documents/:id`, () =>
        HttpResponse.json({
          ...fixture[0],
          contentJson: { type: 'doc', content: [] },
          contentMd: 'safe <img src=x onerror="window.__pwned=1"> text',
        }),
      ),
    );
    renderDocs();
    await screen.findByText('Editor PRD');
    await user().click(screen.getByText('Editor PRD'));

    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByText(/safe/);
    const img = sheet.querySelector('img');
    expect(img?.getAttribute('onerror')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it('renders idea/release owners with links and "—" for ownerless docs', async () => {
    const extra: DocumentListItem[] = [
      {
        ...base,
        id: 'd4',
        featureId: null,
        ideaId: 'i1',
        type: 'idea_pitch',
        title: 'Bulk export — Idea pitch',
        status: 'draft',
        updatedAt: '2026-06-10T00:00:00.000Z',
        featureTitle: '',
        featureHorizon: null,
        wordCount: 40,
        ownerLabel: { kind: 'idea', id: 'i1', title: 'Bulk export to CSV' },
      },
      {
        ...base,
        id: 'd5',
        featureId: null,
        type: 'release_notes',
        title: 'June release notes',
        status: 'draft',
        updatedAt: '2026-06-11T00:00:00.000Z',
        featureTitle: '',
        featureHorizon: null,
        wordCount: 80,
        ownerLabel: { kind: 'release', id: 'r1', title: 'June release' },
      },
      {
        ...base,
        id: 'd6',
        featureId: null,
        type: 'release_notes',
        title: 'Orphaned notes',
        status: 'draft',
        updatedAt: '2026-06-12T00:00:00.000Z',
        featureTitle: '',
        featureHorizon: null,
        wordCount: 10,
        ownerLabel: null,
      },
    ];
    server.use(http.get(`/api/projects/${TEST_PROJECT_ID}/documents`, () => HttpResponse.json([...fixture, ...extra])));
    renderDocs();
    await screen.findByText('Bulk export — Idea pitch');

    expect(screen.getByRole('link', { name: 'Bulk export to CSV' })).toHaveProperty(
      'pathname',
      '/inbox',
    );
    expect(
      (screen.getByRole('link', { name: 'Bulk export to CSV' }) as HTMLAnchorElement).search,
    ).toBe('?idea=i1');
    expect(screen.getByRole('link', { name: 'June release' })).toHaveProperty(
      'pathname',
      '/releases/r1',
    );
    const orphanRow = screen.getByText('Orphaned notes').closest('tr')!;
    expect(within(orphanRow).getByText('—')).toBeTruthy();
    // Idea pitch chip renders in the type column.
    const pitchRow = screen.getByText('Bulk export — Idea pitch').closest('tr')!;
    expect(within(pitchRow).getByText('Idea pitch')).toBeTruthy();
  });

  it('role-aware: owner sees the "New doc" control', async () => {
    renderDocs();
    await screen.findByText('Editor PRD');
    expect(screen.getByRole('button', { name: 'New doc' })).toBeTruthy();
  });

  it('role-aware: viewer sees no "New doc" control', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([
          { id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'viewer' },
        ]),
      ),
    );
    renderDocs();
    await screen.findByText('Editor PRD');
    expect(screen.queryByRole('button', { name: 'New doc' })).toBeNull();
  });

  it('shows error state with retry', async () => {
    server.use(
      http.get(`/api/projects/${TEST_PROJECT_ID}/documents`, () => new HttpResponse(null, { status: 500 })),
    );
    renderDocs();
    await screen.findByText("Couldn't load docs.");

    server.resetHandlers();
    await user().click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Editor PRD')).toBeTruthy());
  });
});
