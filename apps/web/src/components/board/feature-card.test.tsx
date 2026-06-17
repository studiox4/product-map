import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureWithDocs } from '@productmap/shared';
import { FeatureCard } from '@/components/board/FeatureCard';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

beforeAll(() => {
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

function makeFeature(overrides: Partial<FeatureWithDocs> = {}): FeatureWithDocs {
  return {
    id: 'f1',
    projectId: 'p1',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0 as const,
    title: 'Rich markdown editor',
    horizon: 'now',
    status: 'in_progress',
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
    ...overrides,
  };
}

const blockerUnshipped = makeFeature({ id: 'f2', title: 'Auth foundations', status: 'planned' });
const blockerShipped = makeFeature({ id: 'f3', title: 'Design tokens', status: 'shipped' });

let featuresFixture: FeatureWithDocs[] = [];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features`, () => HttpResponse.json(featuresFixture)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderCard(feature: FeatureWithDocs) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <FeatureCard feature={feature} onOpen={vi.fn()} />
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('FeatureCard blocked badge + size chip', () => {
  it('shows the amber blocked badge when a blocker is unshipped', async () => {
    const card = makeFeature({ blockerIds: ['f2'] });
    featuresFixture = [card, blockerUnshipped];
    renderCard(card);
    expect(await screen.findByLabelText('Blocked')).toBeTruthy();
  });

  it('shows no blocked badge when every blocker has shipped', async () => {
    const card = makeFeature({ blockerIds: ['f3'] });
    featuresFixture = [card, blockerShipped];
    renderCard(card);
    // wait for the features query to settle, then assert absence
    expect(await screen.findByText('Rich markdown editor')).toBeTruthy();
    await Promise.resolve();
    expect(screen.queryByLabelText('Blocked')).toBeNull();
  });

  it('shows no blocked badge when the feature has no blockers', async () => {
    const card = makeFeature();
    featuresFixture = [card];
    renderCard(card);
    expect(await screen.findByText('Rich markdown editor')).toBeTruthy();
    expect(screen.queryByLabelText('Blocked')).toBeNull();
  });

  it('renders a size chip for sized features and none when unsized', async () => {
    const sized = makeFeature({ size: 'l' });
    featuresFixture = [sized];
    renderCard(sized);
    const chip = await screen.findByLabelText('Size L');
    expect(chip.textContent).toBe('l'); // uppercased via CSS

    cleanup();
    const unsized = makeFeature({ size: null });
    featuresFixture = [unsized];
    renderCard(unsized);
    expect(await screen.findByText('Rich markdown editor')).toBeTruthy();
    expect(screen.queryByLabelText(/^Size /)).toBeNull();
  });
});
