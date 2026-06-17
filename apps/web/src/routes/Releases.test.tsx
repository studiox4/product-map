import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Releases from '@/routes/Releases';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

function projectsHandler(role: 'owner' | 'editor' | 'viewer') {
  return http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role }]),
  );
}

const server = setupServer(
  projectsHandler('owner'),
  http.get(`/api/projects/${TEST_PROJECT_ID}/releases`, () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderReleases() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter>
          <Releases />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('Releases role-aware UI', () => {
  it('editor sees the "New release" control', async () => {
    server.use(projectsHandler('editor'));
    renderReleases();
    await screen.findByRole('heading', { name: 'Releases' });
    expect(screen.getAllByRole('button', { name: /new release/i }).length).toBeGreaterThan(0);
  });

  it('viewer sees no "New release" control', async () => {
    server.use(projectsHandler('viewer'));
    renderReleases();
    await screen.findByRole('heading', { name: 'Releases' });
    expect(screen.queryByRole('button', { name: /new release/i })).toBeNull();
  });
});
