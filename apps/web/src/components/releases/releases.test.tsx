import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Feature } from '@productmap/shared';
import type { ReleaseListItem } from '@/lib/api';
import ReleasesPage from '@/routes/Releases';
import ReleaseDetail from '@/components/releases/ReleaseDetail';

// Ship triggers confetti — assert the call, skip the canvas.
vi.mock('@/lib/delight', () => ({ confettiBurst: vi.fn() }));
import { confettiBurst } from '@/lib/delight';

function makeFeature(overrides: Partial<Feature> & { id: string; title: string }): Feature {
  return {
    productId: 'p1',
    horizon: 'now',
    status: 'planned',
    startDate: null,
    endDate: null,
    sortOrder: 0,
    descriptionMd: '',
    size: null,
    riskMd: '',
    objectiveId: null,
    releaseId: 'r1',
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0,
    ...overrides,
  };
}

const baseRelease = {
  notesMd: '',
  shippedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
};

let releaseList: ReleaseListItem[];
let shipCalls: string[];
let savedNotes: string | null;

const detailFeatures = [
  makeFeature({ id: 'f1', title: 'Comments & review', status: 'shipped', size: 'm' }),
  makeFeature({ id: 'f2', title: 'Voting', horizon: 'next', size: 's' }),
];

const server = setupServer(
  http.get('/api/releases', () => HttpResponse.json(releaseList)),
  http.get('/api/releases/r1', () =>
    HttpResponse.json({ ...releaseList[0], features: detailFeatures }),
  ),
  http.get('/api/releases/r1/notes.md', () =>
    HttpResponse.text('# v0.2 — Team ready\n\n## Comments & review\n\nThreaded comments.\n'),
  ),
  http.post('/api/releases/:id/ship', ({ params }) => {
    shipCalls.push(params.id as string);
    const release = releaseList.find((r) => r.id === params.id)!;
    release.status = 'shipped';
    return HttpResponse.json({ ...release, shippedAt: '2026-06-10T00:00:00.000Z' });
  }),
  http.post('/api/releases', async ({ request }) => {
    const body = (await request.json()) as { name: string; targetDate: string | null };
    const row: ReleaseListItem = {
      ...baseRelease,
      id: 'r-new',
      name: body.name,
      targetDate: body.targetDate,
      status: 'planned',
      featureCount: 0,
    };
    releaseList = [...releaseList, row];
    return HttpResponse.json(row, { status: 201 });
  }),
  http.patch('/api/releases/r1', async ({ request }) => {
    const body = (await request.json()) as { notesMd?: string };
    savedNotes = body.notesMd ?? null;
    return HttpResponse.json({ ...releaseList[0], notesMd: body.notesMd ?? '' });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

function resetFixtures() {
  releaseList = [
    {
      ...baseRelease,
      id: 'r1',
      name: 'v0.2 — Team ready',
      targetDate: '2026-07-15',
      status: 'planned',
      featureCount: 2,
    },
    {
      ...baseRelease,
      id: 'r0',
      name: 'v0.1 — Foundations',
      targetDate: null,
      status: 'shipped',
      featureCount: 3,
    },
  ];
  shipCalls = [];
  savedNotes = null;
}

function renderAt(initialEntry: string) {
  resetFixtures();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/releases/:id" element={<ReleaseDetail />} />
          <Route path="/features/:id" element={<div>feature route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Releases list', () => {
  it('shows status, target date, and feature count; ship button only while planned', async () => {
    renderAt('/releases');
    await screen.findByText('v0.2 — Team ready');

    expect(screen.getByText('2 features')).toBeTruthy();
    expect(screen.getByText('3 features')).toBeTruthy();
    expect(screen.getByText('Jul 15, 2026')).toBeTruthy();
    expect(screen.getByText('planned')).toBeTruthy();
    expect(screen.getByText('shipped')).toBeTruthy();

    // Only the planned release gets a ship affordance.
    expect(screen.getAllByRole('button', { name: /^Ship / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Ship v0.2 — Team ready' })).toBeTruthy();
  });

  it('ships a release with confetti and flips its status pill', async () => {
    renderAt('/releases');
    const u = userEvent.setup();
    await screen.findByText('v0.2 — Team ready');

    await u.click(screen.getByRole('button', { name: 'Ship v0.2 — Team ready' }));

    await waitFor(() => expect(shipCalls).toEqual(['r1']));
    expect(confettiBurst).toHaveBeenCalledTimes(1);
    // After invalidation the list refetches and both rows read shipped.
    await waitFor(() => expect(screen.getAllByText('shipped')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: /^Ship / })).toBeNull();
  });

  it('creates a release from the dialog', async () => {
    renderAt('/releases');
    const u = userEvent.setup();
    await screen.findByText('v0.2 — Team ready');

    await u.click(screen.getByRole('button', { name: /New release/ }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Name'), 'v0.3 — Spring polish');
    await u.click(within(dialog).getByRole('button', { name: 'Create release' }));

    await screen.findByText('v0.3 — Spring polish');
    expect(screen.getByText('0 features')).toBeTruthy();
  });
});

describe('Release detail', () => {
  it('renders the features table with horizon, status, and size', async () => {
    renderAt('/releases/r1');
    await screen.findByRole('heading', { name: 'v0.2 — Team ready' });

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link', { name: 'Comments & review' })).toHaveProperty(
      'pathname',
      '/features/f1',
    );
    expect(within(rows[0]).getByText('Shipped')).toBeTruthy();
    expect(within(rows[0]).getByText('m')).toBeTruthy();
    expect(within(rows[1]).getByText('Next')).toBeTruthy();
  });

  it('prefills the notes editor from notes.md when no notes are saved, then saves', async () => {
    renderAt('/releases/r1');
    const u = userEvent.setup();

    const editor = await screen.findByLabelText('Release notes markdown');
    await waitFor(() =>
      expect((editor as HTMLTextAreaElement).value).toContain('# v0.2 — Team ready'),
    );
    expect((editor as HTMLTextAreaElement).value).toContain('## Comments & review');

    await u.type(editor, '\nEdited.');
    await u.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(savedNotes).toContain('Edited.'));
  });

  it('copies the notes markdown to the clipboard', async () => {
    renderAt('/releases/r1');
    const u = userEvent.setup();

    const editor = await screen.findByLabelText('Release notes markdown');
    await waitFor(() =>
      expect((editor as HTMLTextAreaElement).value).toContain('# v0.2 — Team ready'),
    );

    await u.click(screen.getByRole('button', { name: /Copy markdown/ }));
    const copied = await window.navigator.clipboard.readText();
    expect(copied).toContain('## Comments & review');
  });
});
