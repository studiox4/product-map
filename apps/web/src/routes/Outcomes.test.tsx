import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Outcomes from '@/routes/Outcomes';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

function projectsHandler(role: 'owner' | 'editor' | 'viewer') {
  return http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role }]),
  );
}

const server = setupServer(
  projectsHandler('owner'),
  http.get(`/api/projects/${TEST_PROJECT_ID}/objectives`, () => HttpResponse.json([])),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features`, () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderOutcomes() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter>
          <Outcomes />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('Outcomes role-aware UI', () => {
  it('editor sees the "New objective" control', async () => {
    server.use(projectsHandler('editor'));
    renderOutcomes();
    await screen.findByRole('heading', { name: 'Outcomes' });
    expect(screen.getAllByRole('button', { name: /new objective/i }).length).toBeGreaterThan(0);
  });

  it('viewer sees no "New objective" control', async () => {
    server.use(projectsHandler('viewer'));
    renderOutcomes();
    await screen.findByRole('heading', { name: 'Outcomes' });
    expect(screen.queryByRole('button', { name: /new objective/i })).toBeNull();
  });
});
