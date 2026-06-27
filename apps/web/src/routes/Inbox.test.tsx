import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('Inbox pending tab', () => {
  it('shows a Pending review tab and approves a held idea', async () => {
    let patchBody: unknown;
    const heldIdea = {
      id: 'i1',
      title: 'Held',
      bodyMd: '',
      source: 'public',
      status: 'pending' as const,
      promotedFeatureId: null,
      createdBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creator: null,
      pitchDoc: null,
      submitterName: 'Alice',
      submitterEmail: 'alice@example.com',
      score: 0,
      boosts: 0,
      cools: 0,
      myVote: 0 as const,
    };

    server.use(
      http.get(`/api/projects/${TEST_PROJECT_ID}/ideas`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('status') === 'pending') {
          return HttpResponse.json([heldIdea]);
        }
        return HttpResponse.json([]);
      }),
      http.patch(`/api/projects/${TEST_PROJECT_ID}/ideas/i1`, async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ ...heldIdea, status: 'inbox' });
      }),
    );

    renderInbox();

    // Pending review tab is visible
    const pendingTab = await screen.findByRole('button', { name: /pending review/i });
    expect(pendingTab).toBeDefined();

    // Click to filter by pending
    await userEvent.click(pendingTab);

    // The held idea appears in the list
    expect(await screen.findByText('Held')).toBeDefined();

    // Approve button fires PATCH with status:'inbox'
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(patchBody).toMatchObject({ status: 'inbox' });
  });
});
