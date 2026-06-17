import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { FeatureWithDocs, Objective, User } from '@productmap/shared';
import Outcomes from '@/routes/Outcomes';
import { ProjectProvider } from '@/lib/project';

// jsdom polyfills for Radix Select / DropdownMenu
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

function makeFeature(
  overrides: Partial<FeatureWithDocs> & { id: string; title: string },
): FeatureWithDocs {
  return {
    projectId: 'p1',
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

function makeObjective(overrides: Partial<Objective> & { id: string; title: string }): Objective {
  return {
    descriptionMd: '',
    metric: '',
    target: '',
    current: '',
    status: 'on_track',
    ownerId: null,
    quarter: '',
    createdAt: '2026-06-01T00:00:00.000Z',
    owner: null,
    featureCount: 0,
    ...overrides,
  };
}

const users: User[] = [
  { id: 'u1', name: 'Priya Patel', color: '#2b557e', role: 'member', createdAt: '2026-06-01T00:00:00.000Z' },
  { id: 'u2', name: 'Marcus Chen', color: '#3c6b46', role: 'member', createdAt: '2026-06-01T00:00:00.000Z' },
];

let objectives: Objective[];
let postBody: Record<string, unknown> | null;
let patchCalls: Array<{ id: string; body: Record<string, unknown> }>;

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

const TEST_PROJECT_ID = 'p1';

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get(`/api/projects/${TEST_PROJECT_ID}/objectives`, () => HttpResponse.json(objectives)),
  http.get('/api/features', () => HttpResponse.json(features)),
  http.get('/api/users', () => HttpResponse.json(users)),
  http.post(`/api/projects/${TEST_PROJECT_ID}/objectives`, async ({ request }) => {
    postBody = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      makeObjective({ id: 'o-new', title: postBody.title as string }),
      { status: 201 },
    );
  }),
  http.patch(`/api/projects/${TEST_PROJECT_ID}/objectives/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    patchCalls.push({ id: params.id as string, body });
    const row = objectives.find((o) => o.id === params.id)!;
    return HttpResponse.json({ ...row, ...body });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function resetFixtures() {
  objectives = [
    makeObjective({
      id: 'o1',
      title: 'Make collaboration sticky',
      metric: 'Weekly active commenters',
      target: '40%',
      current: '12%',
      quarter: 'Q3 2026',
      status: 'on_track',
      ownerId: 'u1',
      owner: { name: 'Priya Patel', color: '#2b557e' },
      featureCount: 3,
    }),
    makeObjective({
      id: 'o2',
      title: 'Ship with confidence',
      status: 'at_risk',
      createdAt: '2026-06-02T00:00:00.000Z',
    }),
  ];
  postBody = null;
  patchCalls = [];
}

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderOutcomes() {
  resetFixtures();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter initialEntries={['/outcomes']}>
          <Routes>
            <Route path="/outcomes" element={<Outcomes />} />
            <Route path="/features/:id" element={<div>feature route</div>} />
          </Routes>
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('Outcomes', () => {
  it('renders objective cards with metric, target, current, and quarter', async () => {
    renderOutcomes();
    const card = (await screen.findByText('Make collaboration sticky')).closest('article')!;
    expect(within(card).getByText('Weekly active commenters')).toBeTruthy();
    expect(within(card).getByText('→ 40%')).toBeTruthy();
    expect(within(card).getByText('12%')).toBeTruthy();
    expect(within(card).getByText('Q3 2026')).toBeTruthy();
  });

  it('shows owner avatar and status pill on the card', async () => {
    renderOutcomes();
    const card = (await screen.findByText('Make collaboration sticky')).closest('article')!;
    expect(within(card).getByLabelText('Priya Patel')).toBeTruthy();
    expect(within(card).getByText('On track')).toBeTruthy();

    const riskCard = screen.getByText('Ship with confidence').closest('article')!;
    expect(within(riskCard).getByText('At risk')).toBeTruthy();
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

  it('creates an objective with all properties from the dialog', async () => {
    renderOutcomes();
    const u = user();
    await screen.findByText('Make collaboration sticky');

    await u.click(screen.getByRole('button', { name: /New objective/ }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Title'), 'Win enterprise');
    await u.type(within(dialog).getByLabelText(/Description/), 'Land big logos.');
    await u.type(within(dialog).getByLabelText('Metric'), 'Signed contracts');
    await u.type(within(dialog).getByLabelText('Target'), '5');
    await u.type(within(dialog).getByLabelText('Current'), '1');
    await u.click(within(dialog).getByRole('combobox', { name: 'Owner' }));
    await u.click(await screen.findByRole('option', { name: 'Marcus Chen' }));
    await u.click(within(dialog).getByRole('combobox', { name: 'Status' }));
    await u.click(await screen.findByRole('option', { name: 'At risk' }));
    await u.click(within(dialog).getByRole('button', { name: 'Create objective' }));

    await waitFor(() =>
      expect(postBody).toEqual({
        title: 'Win enterprise',
        descriptionMd: 'Land big logos.',
        metric: 'Signed contracts',
        target: '5',
        current: '1',
        quarter: '',
        ownerId: 'u2',
        status: 'at_risk',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('edits an objective via the card ⋯ menu with a prefilled dialog', async () => {
    renderOutcomes();
    const u = user();
    await screen.findByText('Make collaboration sticky');

    await u.click(
      screen.getByRole('button', { name: 'Objective actions for Make collaboration sticky' }),
    );
    await u.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');
    const title = within(dialog).getByLabelText('Title') as HTMLInputElement;
    expect(title.value).toBe('Make collaboration sticky');
    expect((within(dialog).getByLabelText('Current') as HTMLInputElement).value).toBe('12%');

    await u.clear(title);
    await u.type(title, 'Make collaboration essential');
    await u.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0].id).toBe('o1');
    expect(patchCalls[0].body).toMatchObject({
      title: 'Make collaboration essential',
      metric: 'Weekly active commenters',
      ownerId: 'u1',
      quarter: 'Q3 2026',
      status: 'on_track',
    });
  });

  it('drops an objective from the ⋯ menu', async () => {
    renderOutcomes();
    const u = user();
    await screen.findByText('Make collaboration sticky');

    await u.click(
      screen.getByRole('button', { name: 'Objective actions for Make collaboration sticky' }),
    );
    await u.click(await screen.findByRole('menuitem', { name: 'Drop' }));

    await waitFor(() =>
      expect(patchCalls).toEqual([{ id: 'o1', body: { status: 'dropped' } }]),
    );
  });
});
