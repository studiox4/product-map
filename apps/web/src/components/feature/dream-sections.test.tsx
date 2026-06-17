import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Decision, Feature, FeatureWithDocs } from '@productmap/shared';
import type { EvidenceItem } from '@/lib/api';
import { EvidenceSection } from '@/components/feature/EvidenceSection';
import { DecisionsSection } from '@/components/feature/DecisionsSection';
import { DependenciesRail } from '@/components/feature/DependenciesRail';
import { SizeRiskRail } from '@/components/feature/SizeRiskRail';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
import { toast } from 'sonner';

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
    createdBy: 'u1',
    updatedBy: 'u1',
    createdAt: now,
    updatedAt: now,
    documents: [],
    ...overrides,
  };
}

const blockerFeature: Feature = {
  ...makeFeature({ id: 'f2', title: 'Auth foundations', status: 'planned' }),
};

const evidenceRows: EvidenceItem[] = [
  {
    id: 'e1',
    featureId: 'f1',
    kind: 'quote',
    title: 'Customers want markdown',
    bodyMd: 'They said so on a call.',
    sourceUrl: '',
    weight: 1,
    createdBy: 'u1',
    createdAt: now,
  },
  {
    id: 'e2',
    featureId: 'f1',
    kind: 'ticket',
    title: 'Editor formatting tickets',
    bodyMd: '',
    sourceUrl: 'https://example.com/tickets',
    weight: 12,
    createdBy: 'u1',
    createdAt: now,
  },
];

const decisionRows: Decision[] = [
  {
    id: 'dec1',
    featureId: 'f1',
    title: 'Use Tiptap for the editor',
    decisionMd: 'Tiptap gives us ProseMirror power with a sane API.',
    alternativesMd: '- Slate\n- ContentEditable from scratch',
    sourceCommentId: null,
    decidedBy: 'u2',
    decidedByName: 'Ada',
    decidedByColor: '#3c6b46',
    decidedAt: now,
    createdAt: now,
  },
];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features`, () => HttpResponse.json([makeFeature(), blockerFeature])),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features/f1`, () => HttpResponse.json(makeFeature())),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features/f1/evidence`, () => HttpResponse.json(evidenceRows)),
  http.get(`/api/projects/${TEST_PROJECT_ID}/decisions`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(url.searchParams.get('featureId') === 'f1' ? decisionRows : []);
  }),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features/f1/dependencies`, () =>
    HttpResponse.json({ blockers: [blockerFeature], blocked: [] }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.mocked(toast.error).mockClear();
});
afterAll(() => server.close());

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('EvidenceSection', () => {
  it('renders kind-icon cards with a weight badge for weighted items', async () => {
    renderWithProviders(<EvidenceSection featureId="f1" />);
    const section = await screen.findByRole('region', { name: 'Evidence' });
    expect(await within(section).findByText('Customers want markdown')).toBeTruthy();
    expect(within(section).getByText('They said so on a call.')).toBeTruthy();
    // kind icons exposed via accessible labels
    expect(within(section).getByLabelText('Quote')).toBeTruthy();
    expect(within(section).getByLabelText('Ticket')).toBeTruthy();
    // weight badge only on the weighted card
    expect(within(section).getByText('×12')).toBeTruthy();
    expect(within(section).queryByText('×1')).toBeNull();
  });

  it('adds evidence through the popover (POST with kind/title/weight)', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/features/f1/evidence`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { ...evidenceRows[0], id: 'e3', ...posted },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<EvidenceSection featureId="f1" />);
    await screen.findByText('Customers want markdown');
    await user().click(screen.getByRole('button', { name: /add evidence/i }));
    await user().type(await screen.findByLabelText('Title'), 'Churn metric moved');
    await user().clear(screen.getByLabelText('Weight'));
    await user().type(screen.getByLabelText('Weight'), '3');
    await user().click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ kind: 'quote', title: 'Churn metric moved', weight: 3 });
  });

  it('deletes an evidence card', async () => {
    let deleted = false;
    server.use(
      http.delete(`/api/projects/${TEST_PROJECT_ID}/evidence/e1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<EvidenceSection featureId="f1" />);
    await screen.findByText('Customers want markdown');
    await user().click(
      screen.getByRole('button', { name: 'Delete evidence Customers want markdown' }),
    );
    await waitFor(() => expect(deleted).toBe(true));
  });
});

describe('DecisionsSection', () => {
  it('renders decision cards with title, decider avatar, date and expandable alternatives', async () => {
    renderWithProviders(<DecisionsSection featureId="f1" />);
    const section = await screen.findByRole('region', { name: 'Decisions' });
    expect(await within(section).findByText('Use Tiptap for the editor')).toBeTruthy();
    expect(within(section).getByLabelText('Ada')).toBeTruthy(); // avatar
    expect(within(section).getByText(/Jun [89], 2026/)).toBeTruthy(); // local-TZ render of the UTC stamp
    // alternatives collapsed by default, expand on click
    expect(within(section).queryByText('Slate')).toBeNull();
    await user().click(within(section).getByRole('button', { name: /alternatives considered/i }));
    expect(await within(section).findByText('Slate')).toBeTruthy();
  });

  it('shows an empty state when there are no decisions', async () => {
    server.use(http.get(`/api/projects/${TEST_PROJECT_ID}/decisions`, () => HttpResponse.json([])));
    renderWithProviders(<DecisionsSection featureId="f1" />);
    expect(await screen.findByText(/no decisions logged yet/i)).toBeTruthy();
  });
});

describe('DependenciesRail', () => {
  it('lists blockers with status dots and an amber blocked-by badge while unshipped', async () => {
    renderWithProviders(<DependenciesRail feature={makeFeature()} />);
    const rail = await screen.findByRole('region', { name: 'Dependencies' });
    expect(await within(rail).findByText('Auth foundations')).toBeTruthy();
    expect(within(rail).getByText('Blocked by 1')).toBeTruthy();
    const blockersList = within(rail).getByRole('list', { name: 'Blockers' });
    expect(within(blockersList).getByLabelText('Planned')).toBeTruthy(); // status dot
  });

  it('clears the badge when every blocker is shipped', async () => {
    server.use(
      http.get(`/api/projects/${TEST_PROJECT_ID}/features/f1/dependencies`, () =>
        HttpResponse.json({
          blockers: [{ ...blockerFeature, status: 'shipped' }],
          blocked: [],
        }),
      ),
    );
    renderWithProviders(<DependenciesRail feature={makeFeature()} />);
    const rail = await screen.findByRole('region', { name: 'Dependencies' });
    expect(await within(rail).findByText('Auth foundations')).toBeTruthy();
    expect(within(rail).queryByText(/blocked by/i)).toBeNull();
  });

  it('saves the replace-set of blockers via PUT from the edit popover', async () => {
    let putBody: unknown = null;
    server.use(
      http.put(`/api/projects/${TEST_PROJECT_ID}/features/f1/dependencies`, async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({ blockers: [], blocked: [] });
      }),
    );
    renderWithProviders(<DependenciesRail feature={makeFeature()} />);
    await screen.findByText('Auth foundations');
    await user().click(screen.getByRole('button', { name: 'Edit' }));
    // blocker pre-checked; uncheck it to clear the set
    const checkbox = await screen.findByRole('checkbox', { name: /auth foundations/i });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    await user().click(checkbox);
    await user().click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toEqual({ blockerIds: [] });
  });

  it("cycle rejection (400) toasts 'That would create a loop'", async () => {
    server.use(
      http.put(`/api/projects/${TEST_PROJECT_ID}/features/f1/dependencies`, () =>
        HttpResponse.json({ error: 'cycle' }, { status: 400 }),
      ),
    );
    renderWithProviders(<DependenciesRail feature={makeFeature()} />);
    await screen.findByText('Auth foundations');
    await user().click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('checkbox', { name: /auth foundations/i });
    await user().click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('That would create a loop'),
    );
  });
});

describe('SizeRiskRail', () => {
  it('size pills PATCH the chosen size and clicking the active pill clears it', async () => {
    const patches: Record<string, unknown>[] = [];
    server.use(
      http.patch(`/api/projects/${TEST_PROJECT_ID}/features/f1`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push(body);
        return HttpResponse.json({ ...makeFeature(), ...body });
      }),
    );
    renderWithProviders(<SizeRiskRail feature={makeFeature({ size: null })} />);
    await user().click(await screen.findByRole('button', { name: 'Size M' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ size: 'm' });

    cleanup();
    renderWithProviders(<SizeRiskRail feature={makeFeature({ size: 'm' })} />);
    const sizeM = await screen.findByRole('button', { name: 'Size M' });
    expect(sizeM.getAttribute('aria-pressed')).toBe('true');
    await user().click(sizeM);
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toEqual({ size: null });
  });

  it('risk notes expand and PATCH riskMd on blur', async () => {
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch(`/api/projects/${TEST_PROJECT_ID}/features/f1`, async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...makeFeature(), ...patched });
      }),
    );
    renderWithProviders(<SizeRiskRail feature={makeFeature()} />);
    // collapsed by default when riskMd is empty — wait for ProjectProvider to resolve first
    const riskBtn = await screen.findByRole('button', { name: /risk notes/i });
    expect(screen.queryByLabelText('Risk notes')).toBeNull();
    await user().click(riskBtn);
    const textarea = screen.getByLabelText('Risk notes');
    await user().type(textarea, 'Migration could corrupt docs');
    await user().tab(); // blur saves
    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).toEqual({ riskMd: 'Migration could corrupt docs' });
  });
});
