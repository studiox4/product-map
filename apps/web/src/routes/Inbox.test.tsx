import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Inbox from '@/routes/Inbox';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

function projectsHandler(role: 'owner' | 'editor' | 'viewer') {
  return http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role }]),
  );
}

const server = setupServer(
  projectsHandler('owner'),
  http.get(`/api/projects/${TEST_PROJECT_ID}/ideas`, () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderInbox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter>
          <Inbox />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('Inbox role-aware UI', () => {
  it('editor sees the "New idea" control', async () => {
    server.use(projectsHandler('editor'));
    renderInbox();
    await screen.findByRole('heading', { name: 'Idea Inbox' });
    expect(screen.getByRole('button', { name: /new idea/i })).toBeTruthy();
  });

  it('viewer sees no "New idea" control', async () => {
    server.use(projectsHandler('viewer'));
    renderInbox();
    await screen.findByRole('heading', { name: 'Idea Inbox' });
    expect(screen.queryByRole('button', { name: /new idea/i })).toBeNull();
  });
});
