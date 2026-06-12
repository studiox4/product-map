import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { FeatureWithDocs, Objective } from '@productmap/shared';
import Outcomes from '@/routes/Outcomes';

function makeFeature(
  overrides: Partial<FeatureWithDocs> & { id: string; title: string },
): FeatureWithDocs {
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
    releaseId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0,
    documents: [],
    ...overrides,
  };
}

const objectives: Objective[] = [
  {
    id: 'o1',
    title: 'Make collaboration sticky',
    metric: 'Weekly active commenters',
    target: '40%',
    quarter: 'Q3 2026',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'o2',
    title: 'Ship with confidence',
    metric: '',
    target: '',
    quarter: '',
    createdAt: '2026-06-02T00:00:00.000Z',
  },
];

const features: FeatureWithDocs[] = [
  // o1 features deliberately out of horizon order: later before now.
  makeFeature({ id: 'f3', title: 'Realtime collaboration', horizon: 'later', objectiveId: 'o1' }),
  makeFeature({
    id: 'f1',
    title: 'Comments & review',
    horizon: 'now',
    status: 'shipped',
    size: 'm',
    objectiveId: 'o1',
  }),
  makeFeature({ id: 'f2', title: 'Voting', horizon: 'next', objectiveId: 'o1', size: 's' }),
  makeFeature({ id: 'f4', title: 'ECS deployment', objectiveId: null }),
  makeFeature({ id: 'f5', title: 'Public roadmap share', objectiveId: null }),
];

const server = setupServer(
  http.get('/api/objectives', () => HttpResponse.json(objectives)),
  http.get('/api/features', () => HttpResponse.json(features)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderOutcomes() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/outcomes']}>
        <Routes>
          <Route path="/outcomes" element={<Outcomes />} />
          <Route path="/features/:id" element={<div>feature route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Outcomes', () => {
  it('renders objective cards with metric, target, and quarter', async () => {
    renderOutcomes();
    const card = (await screen.findByText('Make collaboration sticky')).closest('article')!;
    expect(within(card).getByText('Weekly active commenters')).toBeTruthy();
    expect(within(card).getByText('→ 40%')).toBeTruthy();
    expect(within(card).getByText('Q3 2026')).toBeTruthy();
  });

  it('groups an objective’s features by horizon in Now → Next → Later order', async () => {
    renderOutcomes();
    const card = (await screen.findByText('Make collaboration sticky')).closest('article')!;

    const headings = within(card)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(['Now', 'Next', 'Later']);

    // Rows land under their horizon, with status + size chips.
    expect(within(card).getByRole('link', { name: 'Comments & review' })).toHaveProperty(
      'pathname',
      '/features/f1',
    );
    expect(within(card).getByText('Shipped')).toBeTruthy();
    expect(within(card).getByText('m')).toBeTruthy();
  });

  it('shows an empty hint on objectives with no features', async () => {
    renderOutcomes();
    const card = (await screen.findByText('Ship with confidence')).closest('article')!;
    expect(within(card).getByText(/No features yet/)).toBeTruthy();
  });

  it('lists exactly the unassigned features in the tray with a count', async () => {
    renderOutcomes();
    await screen.findByText('Make collaboration sticky');

    const tray = screen.getByRole('region', { name: 'Unassigned features' });
    expect(within(tray).getByText('2')).toBeTruthy();
    expect(within(tray).getByRole('link', { name: 'ECS deployment' })).toBeTruthy();
    expect(within(tray).getByRole('link', { name: 'Public roadmap share' })).toBeTruthy();
    expect(within(tray).queryByText('Voting')).toBeNull();
  });
});
