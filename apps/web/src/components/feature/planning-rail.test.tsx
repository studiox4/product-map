import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { FeatureWithDocs, Objective, Release } from '@productmap/shared';
import { PlanningRail } from '@/components/feature/PlanningRail';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

const now = '2026-06-09T00:00:00.000Z';

const feature = {
  id: 'f1',
  productId: 'p1',
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
  createdBy: 'u1',
  updatedBy: 'u1',
  createdAt: now,
  updatedAt: now,
  documents: [],
} as unknown as FeatureWithDocs;

const objectives: Objective[] = [
  {
    id: 'o1',
    title: 'Win security-conscious teams',
    metric: 'Design partners',
    target: '3',
    quarter: 'Q4 2026',
    createdAt: now,
  },
];

const releases: Release[] = [
  {
    id: 'r1',
    name: 'v0.2 — Team ready',
    targetDate: '2026-07-28',
    status: 'planned',
    notesMd: '',
    shippedAt: null,
    createdAt: now,
  },
];

let patched: Record<string, unknown> | null = null;

const server = setupServer(
  http.get('/api/objectives', () => HttpResponse.json(objectives)),
  http.get('/api/releases', () =>
    HttpResponse.json(releases.map((r) => ({ ...r, featureCount: 0 }))),
  ),
  http.patch('/api/features/f1', async ({ request }) => {
    patched = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...feature, ...patched });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  patched = null;
});
afterAll(() => server.close());

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderRail(f: FeatureWithDocs = feature) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlanningRail feature={f} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PlanningRail', () => {
  it('assigns the feature to an objective via the dropdown', async () => {
    renderRail();
    const u = user();
    await u.click(await screen.findByLabelText('Objective'));
    await u.click(await screen.findByRole('option', { name: 'Win security-conscious teams' }));
    await waitFor(() => expect(patched).toEqual({ objectiveId: 'o1' }));
  });

  it('assigns the feature to a release via the dropdown', async () => {
    renderRail();
    const u = user();
    await u.click(await screen.findByLabelText('Release'));
    await u.click(await screen.findByRole('option', { name: 'v0.2 — Team ready' }));
    await waitFor(() => expect(patched).toEqual({ releaseId: 'r1' }));
  });

  it('clears the assignment with the "No objective" option', async () => {
    renderRail({ ...feature, objectiveId: 'o1' } as FeatureWithDocs);
    const u = user();
    await u.click(await screen.findByLabelText('Objective'));
    await u.click(await screen.findByRole('option', { name: 'No objective' }));
    await waitFor(() => expect(patched).toEqual({ objectiveId: null }));
  });
});
