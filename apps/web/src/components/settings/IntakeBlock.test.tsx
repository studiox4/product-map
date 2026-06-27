import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectProvider } from '@/lib/project';
import { IntakeBlock } from './IntakeBlock';

let createCalls = 0;
let lastMintBody: unknown = null;
let revokedToken: string | null = null;

const server = setupServer(
  // ProjectProvider calls GET /api/projects to resolve the active project id.
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: 'p-test', name: 'Test Project', role: 'owner' }]),
  ),
  // Mint route: POST /api/projects/:projectId/share/intake
  http.post('/api/projects/:projectId/share/intake', async ({ request }) => {
    createCalls += 1;
    lastMintBody = await request.json().catch(() => null);
    return HttpResponse.json(
      { url: '/p/tok-x/submit', expiresAt: null },
      { status: 201 },
    );
  }),
  http.delete('/api/share/:token', ({ params }) => {
    revokedToken = params.token as string;
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  createCalls = 0;
  lastMintBody = null;
  revokedToken = null;
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderIntakeBlock() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <IntakeBlock />
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('IntakeBlock', () => {
  it('mints an intake link with the chosen intro + moderation and shows the URL', async () => {
    const user = userEvent.setup();
    renderIntakeBlock();

    // Wait for ProjectProvider to resolve, then type intro and create.
    await user.type(await screen.findByLabelText(/intro/i), 'Tell us your idea');
    await user.click(screen.getByRole('button', { name: /create intake link/i }));

    const input = await screen.findByLabelText(/intake link/i);
    expect((input as HTMLInputElement).value).toContain('/p/tok-x/submit');
    expect(createCalls).toBe(1);
  });

  it('sends introMd + moderation in the mint request body', async () => {
    const user = userEvent.setup();
    renderIntakeBlock();

    await user.type(await screen.findByLabelText(/intro/i), 'My intro text');
    await user.click(screen.getByRole('button', { name: /create intake link/i }));

    await screen.findByLabelText(/intake link/i);
    expect((lastMintBody as Record<string, unknown>)?.introMd).toBe('My intro text');
  });

  it('revokes the link and returns to the create state', async () => {
    const user = userEvent.setup();
    renderIntakeBlock();

    // Create the link first.
    await user.click(await screen.findByRole('button', { name: /create intake link/i }));
    await screen.findByLabelText(/intake link/i);

    // Now revoke it.
    await user.click(screen.getByRole('button', { name: /revoke link/i }));

    expect(await screen.findByRole('button', { name: /create intake link/i })).toBeDefined();
    expect(revokedToken).toBe('tok-x');
    expect(screen.queryByLabelText(/intake link/i)).toBeNull();
  });

  it('clears the link when the server says it was already revoked (404)', async () => {
    server.use(
      http.delete('/api/share/:token', () =>
        HttpResponse.json({ error: 'not_found' }, { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderIntakeBlock();

    // Create first, then revoke against 404.
    await user.click(await screen.findByRole('button', { name: /create intake link/i }));
    await screen.findByLabelText(/intake link/i);

    await user.click(screen.getByRole('button', { name: /revoke link/i }));

    expect(await screen.findByRole('button', { name: /create intake link/i })).toBeDefined();
    expect(screen.queryByLabelText(/intake link/i)).toBeNull();
  });
});
