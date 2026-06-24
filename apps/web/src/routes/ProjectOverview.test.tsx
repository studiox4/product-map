import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ActiveProjectProvider } from '@/lib/project';
import ProjectOverview from './ProjectOverview';

const projectsList = [
  { id: 'pa', name: 'Alpha', slug: 'alpha', vision: '', aboutMd: '', role: 'owner' },
];

// Minimal overview payload so the resolved Landing can render without erroring.
const overview = {
  project: { id: 'pa', name: 'Alpha', slug: 'alpha', vision: 'Vision text', aboutMd: '' },
  features: [],
  attention: [],
};

const server = setupServer(
  http.get('/api/projects', () => HttpResponse.json(projectsList)),
  http.get('/api/projects/:id/overview', () => HttpResponse.json(overview)),
  http.get('/api/projects/:id/activity', () => HttpResponse.json([])),
  http.get('/api/ai/status', () => HttpResponse.json({ enabled: false })),
);

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ActiveProjectProvider>
          <Routes>
            <Route path="/app/p/:slug" element={<ProjectOverview />} />
          </Routes>
        </ActiveProjectProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); cleanup(); });
afterAll(() => server.close());

describe('ProjectOverview (/app/p/:slug)', () => {
  it('resolves a known slug and renders the overview (no 404)', async () => {
    renderAt('/app/p/alpha');
    // Landing renders the project vision once the slug resolves to the project.
    expect(await screen.findByText('Vision text')).toBeTruthy();
    expect(screen.queryByTestId('overview-not-found')).toBeNull();
  });

  it('shows a not-found state for an unknown slug', async () => {
    renderAt('/app/p/nope');
    expect(await screen.findByTestId('overview-not-found')).toBeTruthy();
  });
});
