import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MemberRole } from '@productmap/shared';

// Mock sonner so we can assert toast.error for surfaced server errors.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
import { toast } from 'sonner';

import { ActiveProjectProvider } from '@/lib/project';
import ProjectTab from './ProjectTab';

// Node's experimental webstorage shadows jsdom's localStorage — install a shim.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});

let activeRole: MemberRole = 'owner';
let addMemberBody: unknown = null;
let createInviteBody: unknown = null;
let memberMutationStatus = 200;

function projectsHandler() {
  return http.get('/api/projects', () =>
    HttpResponse.json([
      { id: 'p1', name: 'Alpha', vision: '', aboutMd: '', role: activeRole },
    ]),
  );
}

let archiveCalled = false;

const server = setupServer(
  projectsHandler(),
  http.get('/api/projects/:id/members', () =>
    HttpResponse.json([
      { userId: 'u1', role: 'owner', name: 'Owner One', color: '#111111' },
      { userId: 'u2', role: 'editor', name: 'Editor Two', color: '#222222' },
    ]),
  ),
  http.get('/api/projects/:id/invites', () => HttpResponse.json([])),
  http.get('/api/projects', ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('archived') === '1') return HttpResponse.json([]);
    return HttpResponse.json([{ id: 'p1', name: 'Alpha', vision: '', aboutMd: '', role: activeRole }]);
  }),
  http.post('/api/projects/:id/archive', () => {
    archiveCalled = true;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('/api/projects/:id/members', async ({ request }) => {
    addMemberBody = await request.json();
    if (memberMutationStatus !== 200) {
      return HttpResponse.json({ error: 'user_not_found' }, { status: memberMutationStatus });
    }
    return HttpResponse.json({ userId: 'u3', projectId: 'p1', role: 'editor' });
  }),
  http.patch('/api/projects/:id/members/:userId', () =>
    HttpResponse.json({ error: 'last_owner' }, { status: 409 }),
  ),
  http.delete('/api/projects/:id/members/:userId', () =>
    HttpResponse.json({ error: 'last_owner' }, { status: 409 }),
  ),
  http.post('/api/projects/:id/invites', async ({ request }) => {
    createInviteBody = await request.json();
    return HttpResponse.json({
      token: 'inv-tok-123',
      projectId: 'p1',
      role: 'editor',
      email: null,
      expiresAt: '2026-07-01T00:00:00Z',
      emailSent: false,
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  activeRole = 'owner';
  addMemberBody = null;
  createInviteBody = null;
  memberMutationStatus = 200;
  archiveCalled = false;
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  server.resetHandlers();
  server.use(projectsHandler()); // keep dynamic-role handler after reset
  cleanup();
});
afterAll(() => server.close());

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ActiveProjectProvider>
        <ProjectTab />
      </ActiveProjectProvider>
    </QueryClientProvider>,
  );
}

describe('ProjectTab', () => {
  it('owner sees rename, members, invite generator, and Archive', async () => {
    renderTab();
    expect(await screen.findByLabelText('Name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    // Members list renders both members; owner gets per-row role selects.
    await screen.findByText('Owner One');
    expect(screen.getByLabelText('Role for Editor Two')).toBeTruthy();
    expect(screen.getByText('Generate invite')).toBeTruthy();
    expect(screen.getByRole('button', { name: /archive project/i })).toBeTruthy();
  });

  it('viewer sees a read-only notice and NO mutation controls', async () => {
    activeRole = 'viewer';
    renderTab();
    await screen.findByText('Only owners can manage this project.');
    // Members list still renders (GET members is viewer-allowed).
    await screen.findByText('Owner One');
    // No rename input, no Archive, no invite generator, no member role selects.
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.queryByRole('button', { name: /archive project/i })).toBeNull();
    expect(screen.queryByText('Generate invite')).toBeNull();
    expect(screen.queryByLabelText('Role for Editor Two')).toBeNull();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('generating a link-only invite renders the /invite/<token> URL + email-not-configured hint when an email was supplied', async () => {
    renderTab();
    await screen.findByText('Generate invite');
    await userEvent.type(screen.getByLabelText('Email (optional)'), 'who@x.co');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    const link = await screen.findByText(/\/invite\/inv-tok-123$/);
    expect(link.textContent).toContain('/invite/inv-tok-123');
    // email supplied + emailSent:false → manual-share hint.
    expect(screen.getByText('Email not configured — share this link manually.')).toBeTruthy();
    expect(createInviteBody).toMatchObject({ role: 'editor', email: 'who@x.co' });
  });

  it('generating a link-only invite (no email) renders the URL with NO email hint', async () => {
    renderTab();
    await screen.findByText('Generate invite');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await screen.findByText(/\/invite\/inv-tok-123$/);
    expect(screen.queryByText('Email not configured — share this link manually.')).toBeNull();
    expect(createInviteBody).toMatchObject({ role: 'editor' });
    expect((createInviteBody as { email?: string }).email).toBeUndefined();
  });

  it('adds a member by email with the correct POST body', async () => {
    renderTab();
    await screen.findByText('Add member');
    await userEvent.type(screen.getByLabelText('Email'), 'new@x.co');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addMemberBody).toMatchObject({ email: 'new@x.co', role: 'editor' }));
  });

  it('surfaces the 404 user_not_found message when adding an unknown email', async () => {
    memberMutationStatus = 404;
    renderTab();
    await screen.findByText('Add member');
    await userEvent.type(screen.getByLabelText('Email'), 'ghost@x.co');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('user_not_found')),
    );
  });

  it('surfaces the 409 last_owner message when demoting a member', async () => {
    renderTab();
    await screen.findByText('Owner One');
    const select = screen.getByLabelText('Role for Owner One');
    await userEvent.selectOptions(select, 'viewer');
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('last_owner')),
    );
  });

  it('surfaces the 409 last_owner message when removing a member', async () => {
    renderTab();
    await screen.findByText('Owner One');
    await userEvent.click(screen.getByLabelText('Remove Owner One'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('last_owner')),
    );
  });

  it('Archive project button calls the archive endpoint (not purge)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderTab();
    const btn = await screen.findByRole('button', { name: /archive project/i });
    await userEvent.click(btn);
    await waitFor(() => expect(archiveCalled).toBe(true));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Project archived'));
  });

  it('lists pending invites (bound-email + link-only branches) and revokes one', async () => {
    let revokedToken: string | null = null;
    server.use(
      http.get('/api/projects/:id/invites', () =>
        HttpResponse.json([
          {
            token: 'inv-bound',
            projectId: 'p1',
            role: 'editor',
            email: 'pending@x.co',
            expiresAt: '2026-07-01T00:00:00Z',
          },
          {
            token: 'inv-link',
            projectId: 'p1',
            role: 'viewer',
            email: null,
            expiresAt: '2026-07-01T00:00:00Z',
          },
        ]),
      ),
      http.delete('/api/projects/:id/invites/:token', ({ params }) => {
        revokedToken = params.token as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTab();
    // Bound-email branch shows the address; link-only branch shows "link only".
    expect(await screen.findByText('pending@x.co')).toBeTruthy();
    expect(screen.getByText('link only')).toBeTruthy();

    await userEvent.click(screen.getByLabelText('Revoke invite inv-bound'));
    await waitFor(() => expect(revokedToken).toBe('inv-bound'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Invite revoked'));
  });
});
