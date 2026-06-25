import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardResponse, Project } from '@productmap/shared';
import Dashboard from './Dashboard';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
import { toast } from 'sonner';

function fixture(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    projects: [
      {
        id: 'pz', name: 'Zeta', slug: 'zeta', role: 'editor', favorite: false,
        counts: { idea: 1, planned: 0, in_progress: 2, shipped: 3 },
        nextRelease: { id: 'r1', name: 'v1', date: '2026-07-01' }, staleCount: 1,
      },
      {
        id: 'pb', name: 'Beta', slug: 'beta', role: 'owner', favorite: true,
        counts: { idea: 0, planned: 0, in_progress: 0, shipped: 0 },
        nextRelease: null, staleCount: 0,
      },
    ],
    nextActions: [
      { kind: 'doc_in_review', projectId: 'pz', projectSlug: 'zeta', documentId: 'd1', featureId: 'f1', title: 'PRD', docType: 'prd' },
    ],
    myWork: [
      { featureId: 'f1', projectId: 'pz', projectSlug: 'zeta', title: 'My feature', status: 'in_progress', horizon: 'now' },
    ],
    activity: [
      { id: 'a1', featureId: 'f1', featureTitle: 'My feature', projectId: 'pz', projectSlug: 'zeta', actorId: 'u1', actorName: 'Priya', actorColor: '#2b557e', kind: 'status_changed', payload: { from: 'idea', to: 'in_progress' }, createdAt: new Date().toISOString() },
    ],
    ...overrides,
  };
}

let payload: DashboardResponse = fixture();
let archivedPayload: Project[] = [];
function setFavorite(id: string, favorite: boolean) {
  payload = { ...payload, projects: payload.projects.map((p) => (p.id === id ? { ...p, favorite } : p)) };
}
const server = setupServer(
  http.get('/api/dashboard', () => HttpResponse.json(payload)),
  http.get('/api/projects', ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('archived') === '1') return HttpResponse.json(archivedPayload);
    return HttpResponse.json([]);
  }),
  http.post('/api/projects/:id/favorite', ({ params }) => {
    setFavorite(params.id as string, true);
    return HttpResponse.json({ favorite: true });
  }),
  http.delete('/api/projects/:id/favorite', ({ params }) => {
    setFavorite(params.id as string, false);
    return HttpResponse.json({ favorite: false });
  }),
);

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); cleanup(); payload = fixture(); archivedPayload = []; vi.clearAllMocks(); });
afterAll(() => server.close());

describe('Dashboard', () => {
  it('renders project cards, next actions, my work, and the feed', async () => {
    renderDashboard();
    expect(await screen.findByText('Zeta')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText(/Review/)).toBeTruthy(); // next action
    expect(screen.getByRole('heading', { name: 'My work' })).toBeTruthy();
    expect(screen.getByText('Priya')).toBeTruthy(); // feed actor
  });

  it('renders projects in the order the API returns them (server sorts favorites first)', async () => {
    // The API returns favorites-first; the page trusts that order. Here the
    // fixture is intentionally favorite-last to prove the page does NOT reorder.
    renderDashboard();
    await screen.findByText('Zeta');
    const grid = screen.getByRole('heading', { name: 'Your projects' }).parentElement!;
    const names = within(grid).getAllByRole('link').map((a) => a.textContent?.trim());
    expect(names).toEqual(['Zeta', 'Beta']);
  });

  it('shows the empty/onboarding state when there are no projects', async () => {
    payload = fixture({ projects: [], nextActions: [], myWork: [], activity: [] });
    renderDashboard();
    expect(await screen.findByTestId('dashboard-empty')).toBeTruthy();
  });

  it('optimistically toggles a favorite pin', async () => {
    renderDashboard();
    await screen.findByText('Zeta');
    // Beta starts favorited; Zeta does not.
    expect(screen.getAllByRole('button', { name: 'Unfavorite project' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Favorite project' })); // Zeta
    // Optimistic update flips Zeta without waiting for the network → both pinned.
    expect(await screen.findAllByRole('button', { name: 'Unfavorite project' })).toHaveLength(2);
  });

  it('renders archived projects section with Restore and Delete permanently buttons', async () => {
    archivedPayload = [
      { id: 'pa', name: 'Archived Alpha', slug: 'archived-alpha', vision: '', aboutMd: '', role: 'owner' } as Project,
    ];
    server.use(
      http.post('/api/projects/pa/restore', () => new HttpResponse(null, { status: 204 })),
    );
    renderDashboard();
    expect(await screen.findByTestId('archived-projects')).toBeTruthy();
    expect(screen.getByText('Archived Alpha')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore Archived Alpha' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Archived Alpha permanently' })).toBeTruthy();
  });

  it('Restore button calls the restore endpoint', async () => {
    let restoreCalled = false;
    archivedPayload = [
      { id: 'pa', name: 'Archived Alpha', slug: 'archived-alpha', vision: '', aboutMd: '', role: 'owner' } as Project,
    ];
    server.use(
      http.post('/api/projects/pa/restore', () => {
        restoreCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDashboard();
    await screen.findByTestId('archived-projects');
    await userEvent.click(screen.getByRole('button', { name: 'Restore Archived Alpha' }));
    await waitFor(() => expect(restoreCalled).toBe(true));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('"Archived Alpha" restored'));
  });

  it('archived section is hidden when there are no archived projects', async () => {
    archivedPayload = [];
    renderDashboard();
    await screen.findByText('Zeta'); // wait for dashboard to render
    expect(screen.queryByTestId('archived-projects')).toBeNull();
  });

  it('archived section is reachable even when all active projects are gone (EmptyState path)', async () => {
    payload = fixture({ projects: [], nextActions: [], myWork: [], activity: [] });
    archivedPayload = [
      { id: 'pa', name: 'Archived Alpha', slug: 'archived-alpha', vision: '', aboutMd: '', role: 'owner' } as Project,
    ];
    server.use(
      http.post('/api/projects/pa/restore', () => new HttpResponse(null, { status: 204 })),
    );
    renderDashboard();
    // EmptyState renders alongside the archived section.
    expect(await screen.findByTestId('dashboard-empty')).toBeTruthy();
    expect(await screen.findByTestId('archived-projects')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Restore Archived Alpha' })).toBeTruthy();
  });
});
