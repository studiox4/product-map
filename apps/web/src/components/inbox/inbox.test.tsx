import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { IdeaWithVotes } from '@productmap/shared';
import Inbox from '@/routes/Inbox';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

// Node's experimental webstorage shadows jsdom's localStorage in this env
// (methods are undefined) — install a working in-memory Storage.
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

// timeAgoShort renders against the real clock, so anchor "3d ago" off Date.now().
const now = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

function makeIdea(overrides: Partial<IdeaWithVotes>): IdeaWithVotes {
  return {
    id: 'i1',
    title: 'Idea',
    bodyMd: '',
    source: '',
    status: 'inbox',
    promotedFeatureId: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    creator: null,
    pitchDoc: null,
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0,
    ...overrides,
  };
}

const fixture: IdeaWithVotes[] = [
  makeIdea({
    id: 'i1',
    title: 'Bulk export to CSV',
    bodyMd: '## Why\n\nCustomers ask weekly.',
    source: 'sales call',
    creator: { id: 'u1', name: 'Priya Patel', color: '#7c9885' },
    score: 2,
    boosts: 3,
    cools: 1,
  }),
  makeIdea({
    id: 'i2',
    title: 'Realtime cursors',
    status: 'promoted',
    promotedFeatureId: 'f9',
    score: 5,
    boosts: 5,
  }),
];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get('/api/users', () => HttpResponse.json([])),
  http.get('/api/ai/status', () => HttpResponse.json({ enabled: true })),
  http.get(`/api/projects/${TEST_PROJECT_ID}/ideas`, async ({ request }) => {
    await delay(20);
    const status = new URL(request.url).searchParams.get('status');
    return HttpResponse.json(status ? fixture.filter((i) => i.status === status) : fixture);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// Radix puts pointer-events:none on <body> while a dialog is open;
// jsdom can't resolve the cascade back to auto on portal content.
const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderInbox(entries: string[] = ['/app/inbox']) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter initialEntries={entries}>
          <Routes>
            <Route path="/app/inbox" element={<Inbox />} />
            <Route path="/app/features/:id" element={<div>feature page</div>} />
            <Route path="/app/docs/:id" element={<div>editor route</div>} />
          </Routes>
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('Idea Inbox', () => {
  it('shows loading skeleton, then list with vote pills and detail pane', async () => {
    renderInbox();
    // ProjectProvider resolves first (no delay), then Inbox renders its own
    // loading skeleton while ideas fetch (delayed 20 ms) is in-flight.
    expect(await screen.findByTestId('inbox-skeleton')).toBeTruthy();
    await screen.findAllByText('Realtime cursors');
    const list = screen.getByRole('list', { name: /ideas/i });
    expect(within(list).getByText('Bulk export to CSV')).toBeTruthy();
    // First idea selected by default — detail shows editable title/source +
    // the quick-summary textarea (dream tier 2 replaced the markdown body render).
    const detail = screen.getByRole('region', { name: /idea detail/i });
    expect(
      (within(detail).getByLabelText('Idea title') as HTMLInputElement).value,
    ).toBe('Bulk export to CSV');
    expect((within(detail).getByLabelText('Source') as HTMLInputElement).value).toBe(
      'sales call',
    );
    expect(
      (within(detail).getByLabelText('Quick summary') as HTMLTextAreaElement).value,
    ).toBe('## Why\n\nCustomers ask weekly.');
    // Vote pills carry counts (list row for i1: 3 boosts, 1 cool, +2 score).
    const row = within(list).getByText('Bulk export to CSV').closest('[role="button"]')!;
    expect(within(row as HTMLElement).getByRole('button', { name: 'Boost' }).textContent).toContain('3');
    expect(within(row as HTMLElement).getByRole('button', { name: 'Cool' }).textContent).toContain('1');
    expect(within(row as HTMLElement).getByTestId('idea-vote-score').textContent).toBe('+2');
  });

  it('shows an empty state inviting the first idea', async () => {
    server.use(http.get(`/api/projects/${TEST_PROJECT_ID}/ideas`, () => HttpResponse.json([])));
    renderInbox();
    expect(await screen.findByText(/no ideas yet/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /capture your first idea/i })).toBeTruthy();
  });

  it('status filter chips request server-side filtering', async () => {
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: 'Promoted' }));
    await waitFor(() => {
      const list = screen.getByRole('list', { name: /ideas/i });
      expect(within(list).queryByText('Bulk export to CSV')).toBeNull();
      expect(within(list).getByText('Realtime cursors')).toBeTruthy();
    });
  });

  it('captures a new idea via the dialog', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/ideas`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeIdea({ id: 'i-new', title: String(posted.title) }),
          { status: 201 },
        );
      }),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: /new idea/i }));
    const dialog = await screen.findByRole('dialog', { name: /new idea/i });
    await user().type(within(dialog).getByLabelText(/title/i), 'Slack intake');
    await user().type(within(dialog).getByLabelText(/details/i), 'Pipe #feedback in.');
    await user().type(within(dialog).getByLabelText(/source/i), 'support');
    await user().click(within(dialog).getByRole('button', { name: /capture/i }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({
      title: 'Slack intake',
      bodyMd: 'Pipe #feedback in.',
      source: 'support',
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /new idea/i })).toBeNull();
    });
  });

  it('boost pill PUTs a vote', async () => {
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`/api/projects/${TEST_PROJECT_ID}/ideas/:id/vote`, async ({ request, params }) => {
        expect(params.id).toBe('i1');
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ score: 3, boosts: 4, cools: 1, myVote: 1 });
      }),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    const list = screen.getByRole('list', { name: /ideas/i });
    const row = within(list).getByText('Bulk export to CSV').closest('[role="button"]')!;
    await user().click(within(row as HTMLElement).getByRole('button', { name: 'Boost' }));
    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toMatchObject({ value: 1 });
  });

  it('promotes with horizon picker + AI brief checkbox', async () => {
    let promoted: Record<string, unknown> | null = null;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/ideas/:id/promote`, async ({ request, params }) => {
        expect(params.id).toBe('i1');
        promoted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { id: 'f-new', title: 'Bulk export to CSV', horizon: promoted.horizon },
          { status: 201 },
        );
      }),
      http.get(`/api/projects/${TEST_PROJECT_ID}/features`, () => HttpResponse.json([])),
      http.get(`/api/projects/${TEST_PROJECT_ID}/overview`, () => HttpResponse.json({})),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: /promote to feature/i }));
    const dialog = await screen.findByRole('dialog', { name: /promote to feature/i });
    // Later is the default; pick Next to prove the picker drives the payload.
    await user().click(within(dialog).getByRole('radio', { name: 'Next' }));
    await user().click(within(dialog).getByRole('checkbox', { name: /draft ai brief/i }));
    await user().click(within(dialog).getByRole('button', { name: /^promote$/i }));
    await waitFor(() => expect(promoted).not.toBeNull());
    expect(promoted).toMatchObject({ horizon: 'next', withAiBrief: true });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /promote to feature/i })).toBeNull();
    });
  });

  it('hides the AI brief checkbox when AI is disabled', async () => {
    server.use(http.get('/api/ai/status', () => HttpResponse.json({ enabled: false })));
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: /promote to feature/i }));
    const dialog = await screen.findByRole('dialog', { name: /promote to feature/i });
    expect(within(dialog).getByRole('radio', { name: 'Later' })).toBeTruthy();
    expect(within(dialog).queryByRole('checkbox', { name: /draft ai brief/i })).toBeNull();
  });

  it('promoted ideas link to their feature instead of promoting again', async () => {
    renderInbox(['/app/inbox?idea=i2']);
    await screen.findAllByText('Realtime cursors');
    const detail = screen.getByRole('region', { name: /idea detail/i });
    const link = within(detail).getByRole('link', { name: /view feature/i });
    expect(link.getAttribute('href')).toBe('/app/features/f9');
    expect(within(detail).queryByRole('button', { name: /promote to feature/i })).toBeNull();
  });

  it('?new=1 deep link (⌘K "New idea…") opens the capture dialog', async () => {
    renderInbox(['/app/inbox?new=1']);
    expect(await screen.findByRole('dialog', { name: /new idea/i })).toBeTruthy();
  });

  it('shows creator avatar + relative time in list row and detail', async () => {
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    const list = screen.getByRole('list', { name: /ideas/i });
    const row = within(list).getByText('Bulk export to CSV').closest('[role="button"]')!;
    expect(within(row as HTMLElement).getByLabelText('Priya Patel')).toBeTruthy();
    expect(within(row as HTMLElement).getByText(/by Priya Patel · 3d ago/)).toBeTruthy();
    const detail = screen.getByRole('region', { name: /idea detail/i });
    expect(within(detail).getByLabelText('Priya Patel')).toBeTruthy();
    expect(within(detail).getByText(/by Priya Patel · 3d ago/)).toBeTruthy();
  });

  it('saves an edited title on blur', async () => {
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch(`/api/projects/${TEST_PROJECT_ID}/ideas/:id`, async ({ request, params }) => {
        expect(params.id).toBe('i1');
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeIdea({ id: 'i1', ...patched }));
      }),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    const detail = screen.getByRole('region', { name: /idea detail/i });
    const title = within(detail).getByLabelText('Idea title');
    const u = user();
    await u.clear(title);
    await u.type(title, 'Bulk export v2');
    await u.tab();
    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).toMatchObject({ title: 'Bulk export v2' });
  });

  it('saves source and quick summary edits on blur', async () => {
    const patches: Record<string, unknown>[] = [];
    server.use(
      http.patch(`/api/projects/${TEST_PROJECT_ID}/ideas/:id`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push(body);
        return HttpResponse.json(makeIdea({ id: 'i1', ...body }));
      }),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    const detail = screen.getByRole('region', { name: /idea detail/i });
    const u = user();

    const source = within(detail).getByLabelText('Source');
    await u.clear(source);
    await u.type(source, 'q2 churn review');
    await u.tab();
    await waitFor(() =>
      expect(patches.some((p) => p.source === 'q2 churn review')).toBe(true),
    );

    const summary = within(detail).getByLabelText('Quick summary');
    await u.clear(summary);
    await u.type(summary, 'CSV out for finance.');
    await u.tab();
    await waitFor(() =>
      expect(patches.some((p) => p.bodyMd === 'CSV out for finance.')).toBe(true),
    );
  });

  it('changes status via the detail select', async () => {
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch(`/api/projects/${TEST_PROJECT_ID}/ideas/:id`, async ({ request, params }) => {
        expect(params.id).toBe('i1');
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeIdea({ id: 'i1', ...patched }));
      }),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    const u = user();
    await u.click(screen.getByRole('combobox', { name: /idea status/i }));
    await u.click(await screen.findByRole('option', { name: 'Triaged' }));
    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).toMatchObject({ status: 'triaged' });
  });

  it('"Write the pitch" creates the pitch doc and navigates to the editor', async () => {
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/ideas/:id/pitch`, ({ params }) => {
        expect(params.id).toBe('i1');
        return HttpResponse.json(
          {
            id: 'd-pitch',
            featureId: null,
            ideaId: 'i1',
            type: 'idea_pitch',
            title: 'Bulk export to CSV — Idea pitch',
            status: 'draft',
            cover: null,
            createdBy: null,
            updatedBy: null,
            createdAt: now,
            updatedAt: now,
            contentJson: { type: 'doc', content: [] },
            contentMd: '',
          },
          { status: 201 },
        );
      }),
      http.get(`/api/projects/${TEST_PROJECT_ID}/documents`, () => HttpResponse.json([])),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    await user().click(screen.getByRole('button', { name: /write the pitch/i }));
    expect(await screen.findByText('editor route')).toBeTruthy();
  });

  it('role-aware: viewer detail pane is read-only — no promote/archive, title readOnly, status disabled', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([
          { id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'viewer' },
        ]),
      ),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    const detail = screen.getByRole('region', { name: /idea detail/i });
    // Pure actions hidden for viewers.
    expect(within(detail).queryByRole('button', { name: /promote to feature/i })).toBeNull();
    expect(within(detail).queryByRole('button', { name: /mark triaged/i })).toBeNull();
    expect(within(detail).queryByRole('button', { name: /archive/i })).toBeNull();
    // Inline editors locked.
    expect((within(detail).getByLabelText('Idea title') as HTMLInputElement).readOnly).toBe(true);
    expect(
      (within(detail).getByRole('combobox', { name: /idea status/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((within(detail).getByLabelText('Source') as HTMLInputElement).readOnly).toBe(true);
  });

  it('renders the pitch doc card with chip, status, and word count', async () => {
    const withPitch = [
      { ...fixture[0], pitchDoc: { id: 'd-pitch', title: 'Bulk export to CSV — Idea pitch', status: 'draft' as const } },
      fixture[1],
    ];
    server.use(
      http.get(`/api/projects/${TEST_PROJECT_ID}/ideas`, () => HttpResponse.json(withPitch)),
      http.get(`/api/projects/${TEST_PROJECT_ID}/documents/d-pitch`, () =>
        HttpResponse.json({
          id: 'd-pitch',
          featureId: null,
          ideaId: 'i1',
          type: 'idea_pitch',
          title: 'Bulk export to CSV — Idea pitch',
          status: 'draft',
          cover: null,
          createdBy: null,
          updatedBy: null,
          createdAt: now,
          updatedAt: now,
          contentJson: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Customers ask weekly for this' }] },
            ],
          },
          contentMd: 'Customers ask weekly for this',
        }),
      ),
    );
    renderInbox();
    await screen.findAllByText('Bulk export to CSV');
    const detail = screen.getByRole('region', { name: /idea detail/i });
    expect(within(detail).queryByRole('button', { name: /write the pitch/i })).toBeNull();
    const card = within(detail).getByRole('link', { name: /open pitch/i });
    expect(card.getAttribute('href')).toBe('/app/docs/d-pitch');
    expect(within(card as HTMLElement).getByText('Idea pitch')).toBeTruthy();
    expect(within(card as HTMLElement).getByText('Draft')).toBeTruthy();
    await within(card as HTMLElement).findByText('5 words');
  });
});
