import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { DocumentFull, Feature } from '@productmap/shared';
import type { ReleaseListItem } from '@/lib/api';
import ReleasesPage from '@/routes/Releases';
import ReleaseDetail from '@/components/releases/ReleaseDetail';

// Shipping triggers confetti — assert the call, skip the canvas.
vi.mock('@/lib/delight', () => ({ confettiBurst: vi.fn() }));
import { confettiBurst } from '@/lib/delight';

// jsdom polyfills for Radix Select
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
  notesDocId: null,
  shippedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
};

const notesDoc: DocumentFull = {
  id: 'd1',
  featureId: null,
  ideaId: null,
  type: 'release_notes',
  title: 'v0.2 — Team ready',
  status: 'draft',
  cover: null,
  createdBy: null,
  updatedBy: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  contentJson: { type: 'doc', content: [] },
  contentMd: '## Highlights\n\nThreaded comments shipped.',
};

let releaseList: ReleaseListItem[];
let patchCalls: Array<{ id: string; body: Record<string, unknown> }>;
let putFeatureIds: string[][];
let notesDocCreated: number;
let generateCalls: number;

const memberFeatures = [
  makeFeature({ id: 'f1', title: 'Comments & review', status: 'shipped', size: 'm' }),
  makeFeature({ id: 'f2', title: 'Voting', horizon: 'next', size: 's' }),
];
const unassignedFeatures = [
  makeFeature({ id: 'f3', title: 'Realtime collaboration', releaseId: null }),
  makeFeature({ id: 'f4', title: 'Public API', releaseId: null, horizon: 'later' }),
];

const server = setupServer(
  http.get('/api/releases', () => HttpResponse.json(releaseList)),
  http.get('/api/releases/r1', () =>
    HttpResponse.json({ ...releaseList[0], features: memberFeatures }),
  ),
  http.get('/api/features', () => HttpResponse.json([...memberFeatures, ...unassignedFeatures])),
  http.get('/api/documents/d1', () => HttpResponse.json(notesDoc)),
  http.patch('/api/releases/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    patchCalls.push({ id: params.id as string, body });
    const release = releaseList.find((r) => r.id === params.id)!;
    if (typeof body.status === 'string') {
      release.status = body.status as ReleaseListItem['status'];
      release.shippedAt = body.status === 'shipped' ? '2026-06-10T00:00:00.000Z' : null;
    }
    return HttpResponse.json(release);
  }),
  http.put('/api/releases/r1/features', async ({ request }) => {
    const { featureIds } = (await request.json()) as { featureIds: string[] };
    putFeatureIds.push(featureIds);
    return HttpResponse.json({
      ...releaseList[0],
      features: [...memberFeatures, ...unassignedFeatures].filter((f) =>
        featureIds.includes(f.id),
      ),
    });
  }),
  http.post('/api/releases/r1/notes-doc', () => {
    notesDocCreated += 1;
    releaseList[0].notesDocId = 'd1';
    return HttpResponse.json(notesDoc, { status: 201 });
  }),
  http.post('/api/releases/r1/generate-notes', () => {
    generateCalls += 1;
    return HttpResponse.json(notesDoc);
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
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

function resetFixtures({ withNotesDoc = false } = {}) {
  releaseList = [
    {
      ...baseRelease,
      id: 'r1',
      name: 'v0.2 — Team ready',
      targetDate: '2026-07-15',
      status: 'planned',
      notesDocId: withNotesDoc ? 'd1' : null,
      featureCount: 2,
    },
    {
      ...baseRelease,
      id: 'r0',
      name: 'v0.1 — Foundations',
      targetDate: null,
      status: 'shipped',
      shippedAt: '2026-05-01T00:00:00.000Z',
      featureCount: 3,
    },
  ];
  patchCalls = [];
  putFeatureIds = [];
  notesDocCreated = 0;
  generateCalls = 0;
}

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderAt(initialEntry: string, options: { withNotesDoc?: boolean } = {}) {
  resetFixtures(options);
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
          <Route path="/docs/:id" element={<div>doc editor route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Releases list', () => {
  it('shows target date, feature count, and a status select per row', async () => {
    renderAt('/releases');
    await screen.findByText('v0.2 — Team ready');

    expect(screen.getByText('2 features')).toBeTruthy();
    expect(screen.getByText('3 features')).toBeTruthy();
    expect(screen.getByText('Jul 15, 2026')).toBeTruthy();
    const planned = screen.getByRole('combobox', { name: 'Status for v0.2 — Team ready' });
    expect(planned.textContent).toContain('Planned');
    const shipped = screen.getByRole('combobox', { name: 'Status for v0.1 — Foundations' });
    expect(shipped.textContent).toContain('Shipped');
  });

  it('planned→shipped via the status select fires confetti', async () => {
    renderAt('/releases');
    const u = user();
    await screen.findByText('v0.2 — Team ready');

    await u.click(screen.getByRole('combobox', { name: 'Status for v0.2 — Team ready' }));
    await u.click(await screen.findByRole('option', { name: 'Shipped' }));

    await waitFor(() =>
      expect(patchCalls).toEqual([{ id: 'r1', body: { status: 'shipped' } }]),
    );
    expect(confettiBurst).toHaveBeenCalledTimes(1);
  });

  it('shipped→planned via the status select reverts WITHOUT confetti', async () => {
    renderAt('/releases');
    const u = user();
    await screen.findByText('v0.1 — Foundations');

    await u.click(screen.getByRole('combobox', { name: 'Status for v0.1 — Foundations' }));
    await u.click(await screen.findByRole('option', { name: 'Planned' }));

    await waitFor(() =>
      expect(patchCalls).toEqual([{ id: 'r0', body: { status: 'planned' } }]),
    );
    expect(confettiBurst).not.toHaveBeenCalled();
  });

  it('creates a release from the dialog', async () => {
    renderAt('/releases');
    const u = user();
    await screen.findByText('v0.2 — Team ready');

    await u.click(screen.getByRole('button', { name: /New release/ }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Name'), 'v0.3 — Spring polish');
    await u.click(within(dialog).getByRole('button', { name: 'Create release' }));

    await screen.findByText('v0.3 — Spring polish');
    expect(screen.getByText('0 features')).toBeTruthy();
  });
});

describe('Release detail — features membership', () => {
  it('renders the member table with horizon, status, and size', async () => {
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

  it('removes a member via the row ✕ (replace-set PUT without it)', async () => {
    renderAt('/releases/r1');
    const u = user();
    await screen.findByRole('heading', { name: 'v0.2 — Team ready' });

    await u.click(screen.getByRole('button', { name: 'Remove Voting from release' }));
    await waitFor(() => expect(putFeatureIds).toEqual([['f1']]));
  });

  it('adds unassigned features via the popover checklist', async () => {
    renderAt('/releases/r1');
    const u = user();
    await screen.findByRole('heading', { name: 'v0.2 — Team ready' });

    await u.click(screen.getByRole('button', { name: /Add features/ }));
    // Checklist holds only the two unassigned features (members excluded).
    expect(await screen.findByLabelText(/Realtime collaboration/)).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    await u.click(screen.getByLabelText(/Realtime collaboration/));
    await u.click(screen.getByLabelText(/Public API/));
    await u.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(putFeatureIds).toEqual([['f1', 'f2', 'f3', 'f4']]));
  });
});

describe('Release detail — notes doc', () => {
  it('creates the notes doc and navigates to the editor', async () => {
    renderAt('/releases/r1');
    const u = user();
    await screen.findByRole('heading', { name: 'v0.2 — Team ready' });

    await u.click(screen.getByRole('button', { name: /Create notes doc/ }));
    await waitFor(() => expect(notesDocCreated).toBe(1));
    await screen.findByText('doc editor route');
  });

  it('shows the doc card with chip, status, and word count when notes exist', async () => {
    renderAt('/releases/r1', { withNotesDoc: true });
    await screen.findByRole('heading', { name: 'v0.2 — Team ready' });

    const card = await screen.findByRole('link', { name: /Release notes/ });
    expect(card).toHaveProperty('pathname', '/docs/d1');
    expect(within(card).getByText('Release notes')).toBeTruthy();
    expect(within(card).getByText('draft')).toBeTruthy();
    expect(within(card).getByText('5 words')).toBeTruthy();
  });

  it('generates a draft from features behind an overwrite confirm', async () => {
    renderAt('/releases/r1', { withNotesDoc: true });
    const u = user();
    await screen.findByRole('heading', { name: 'v0.2 — Team ready' });

    await u.click(screen.getByRole('button', { name: /Generate draft from features/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/overwriting the current notes doc/)).toBeTruthy();
    await u.click(within(dialog).getByRole('button', { name: 'Generate draft' }));

    await waitFor(() => expect(generateCalls).toBe(1));
    await screen.findByText('doc editor route');
  });
});
