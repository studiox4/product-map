import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardResponse } from '@productmap/shared';
import Dashboard from './Dashboard';

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
function setFavorite(id: string, favorite: boolean) {
  payload = { ...payload, projects: payload.projects.map((p) => (p.id === id ? { ...p, favorite } : p)) };
}
const server = setupServer(
  http.get('/api/dashboard', () => HttpResponse.json(payload)),
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
afterEach(() => { server.resetHandlers(); cleanup(); payload = fixture(); });
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
});
