import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CommentThread, User } from '@productmap/shared';
import { CommentsSection } from './CommentsSection';
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

const now = new Date().toISOString();

const corban: User = { id: 'u1', name: 'Corban', color: '#2b557e', role: 'member', createdAt: now };
const ada: User = { id: 'u2', name: 'Ada', color: '#3c6b46', role: 'member', createdAt: now };

function comment(overrides: Partial<CommentThread> & { id: string }): CommentThread {
  return {
    authorId: 'u1',
    authorName: 'Corban',
    authorColor: '#2b557e',
    featureId: 'f1',
    documentId: null,
    parentId: null,
    body: 'Hello',
    resolvedAt: null,
    resolvedBy: null,
    createdAt: now,
    updatedAt: now,
    replies: [],
    ...overrides,
  };
}

function reply(overrides: Partial<CommentThread> & { id: string }) {
  const { replies: _replies, ...rest } = comment(overrides);
  return rest;
}

const myThread = comment({
  id: 'c1',
  body: 'Root by Corban',
  replies: [
    reply({
      id: 'c2',
      authorId: 'u2',
      authorName: 'Ada',
      authorColor: '#3c6b46',
      parentId: 'c1',
      body: 'Reply by Ada',
    }),
  ],
});

const adaThread = comment({
  id: 'c3',
  authorId: 'u2',
  authorName: 'Ada',
  authorColor: '#3c6b46',
  body: 'Root by Ada',
});

const resolvedThread = comment({
  id: 'c4',
  authorId: 'u2',
  authorName: 'Ada',
  authorColor: '#3c6b46',
  body: 'Old resolved thread',
  resolvedAt: now,
  resolvedBy: 'u1',
});

let threads: CommentThread[] = [];
// Default: me = corban (u1). Override per-test with server.use().
let meUser: User = corban;

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get('/api/auth/me', () => HttpResponse.json(meUser)),
  http.get('/api/users', () => HttpResponse.json([corban, ada])),
  http.get(`/api/projects/${TEST_PROJECT_ID}/comments`, () => HttpResponse.json(threads)),
  // Decision extraction gates on AI status; enabled by default in tests.
  http.get('/api/ai/status', () => HttpResponse.json({ enabled: true })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  meUser = corban;
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderSection() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter>
          <CommentsSection target={{ featureId: 'f1' }} />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('CommentsSection', () => {
  it('renders threads with author, body, relative time and nested replies', async () => {
    threads = [myThread, adaThread, resolvedThread];
    renderSection();
    const root = await screen.findByText('Root by Corban');
    expect(root).toBeTruthy();
    expect(screen.getByText('Root by Ada')).toBeTruthy();
    // reply nests inside its thread, one level deep, with no Reply/Resolve of its own
    const thread = screen.getByRole('article', { name: /thread by Corban/i });
    expect(within(thread).getByText('Reply by Ada')).toBeTruthy();
    expect(within(thread).getAllByRole('button', { name: 'Reply' })).toHaveLength(1);
    expect(within(thread).getAllByRole('button', { name: /^Resolve$/ })).toHaveLength(1);
    // relative time shown
    expect(thread.textContent).toMatch(/ago/);
  });

  it('shows the empty state when there are no comments', async () => {
    threads = [];
    renderSection();
    expect(
      await screen.findByText('No comments yet — start the discussion.'),
    ).toBeTruthy();
  });

  it('collapses resolved threads under a toggle and expands on click', async () => {
    threads = [myThread, adaThread, resolvedThread];
    renderSection();
    await screen.findByText('Root by Corban');
    expect(screen.queryByText('Old resolved thread')).toBeNull();
    const toggle = screen.getByRole('button', { name: /1 resolved/i });
    await user().click(toggle);
    expect(await screen.findByText('Old resolved thread')).toBeTruthy();
    // resolved thread offers Reopen, not Resolve
    const resolved = screen.getByRole('article', { name: /thread by Ada.*resolved/i });
    expect(within(resolved).getByRole('button', { name: 'Reopen' })).toBeTruthy();
  });

  it('resolving a thread PATCHes and moves it into the resolved group', async () => {
    threads = [adaThread];
    let patched: { url: string; body: unknown } | null = null;
    server.use(
      http.patch(`/api/projects/${TEST_PROJECT_ID}/comments/:id/resolve`, async ({ request, params }) => {
        patched = { url: String(params.id), body: await request.json() };
        threads = [{ ...adaThread, resolvedAt: now, resolvedBy: 'u1' }];
        return HttpResponse.json({ ...adaThread, resolvedAt: now, resolvedBy: 'u1' });
      }),
    );
    renderSection();
    await screen.findByText('Root by Ada');
    await user().click(screen.getByRole('button', { name: /^Resolve$/ }));
    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).toMatchObject({ url: 'c3', body: { resolved: true } });
    // optimistically moved under the resolved toggle
    expect(await screen.findByRole('button', { name: /1 resolved/i })).toBeTruthy();
  });

  it('shows the actions menu only on my own comments', async () => {
    threads = [myThread, adaThread];
    // me = corban (u1) → only c1 root is mine
    renderSection();
    await screen.findByText('Root by Ada');
    expect(screen.getAllByRole('button', { name: 'Comment actions' })).toHaveLength(1);
    const mine = screen.getByRole('article', { name: /thread by Corban/i });
    expect(within(mine).getByRole('button', { name: 'Comment actions' })).toBeTruthy();
  });

  it('switching identity moves the menus to the other user', async () => {
    // me = ada (u2) → owns the reply (c2) and the ada root (c3)
    meUser = ada;
    threads = [myThread, adaThread];
    renderSection();
    await screen.findByText('Root by Ada');
    expect(screen.getAllByRole('button', { name: 'Comment actions' })).toHaveLength(2);
    const mine = screen.getByRole('article', { name: /thread by Corban/i });
    // Corban's root has no menu now, but Ada's nested reply does
    expect(within(mine).getAllByRole('button', { name: 'Comment actions' })).toHaveLength(1);
  });

  it('posts a new comment with Cmd+Enter', async () => {
    threads = [];
    let posted: unknown = null;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/comments`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(comment({ id: 'c9', body: 'Ship it' }), { status: 201 });
      }),
    );
    renderSection();
    const box = await screen.findByPlaceholderText('Add a comment…');
    await user().type(box, 'Ship it');
    await user().keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ featureId: 'f1', body: 'Ship it' });
  });

  it('replies post with the thread root as parentId', async () => {
    threads = [adaThread];
    let posted: unknown = null;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/comments`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          comment({ id: 'c10', parentId: 'c3', body: 'Agreed' }),
          { status: 201 },
        );
      }),
    );
    renderSection();
    await screen.findByText('Root by Ada');
    await user().click(screen.getByRole('button', { name: 'Reply' }));
    const box = await screen.findByPlaceholderText('Reply…');
    await user().type(box, 'Agreed');
    const form = box.closest('form')!;
    await user().click(within(form).getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ parentId: 'c3', body: 'Agreed' });
  });

  it('shows "Log decision" only on resolved roots when AI is enabled', async () => {
    threads = [adaThread, resolvedThread];
    renderSection();
    await screen.findByText('Root by Ada');
    // unresolved thread: no sparkle affordance
    expect(screen.queryByRole('button', { name: /Log decision/ })).toBeNull();
    await user().click(screen.getByRole('button', { name: /1 resolved/i }));
    expect(await screen.findByRole('button', { name: /Log decision/ })).toBeTruthy();
  });

  it('hides "Log decision" when AI is disabled', async () => {
    threads = [resolvedThread];
    server.use(http.get('/api/ai/status', () => HttpResponse.json({ enabled: false })));
    renderSection();
    await user().click(await screen.findByRole('button', { name: /1 resolved/i }));
    await screen.findByText('Old resolved thread');
    expect(screen.queryByRole('button', { name: /Log decision/ })).toBeNull();
  });

  it('Log decision: suggest-decision call → prefilled dialog → POST decision', async () => {
    threads = [resolvedThread];
    let suggestBody: unknown = null;
    let decisionBody: unknown = null;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/ai/suggest-decision`, async ({ request }) => {
        suggestBody = await request.json();
        return HttpResponse.json({
          suggested: true,
          title: 'Adopt SSE for streaming',
          decisionMd: 'We will stream over SSE.',
          alternativesMd: '- WebSockets',
        });
      }),
      http.post(`/api/projects/${TEST_PROJECT_ID}/decisions`, async ({ request }) => {
        decisionBody = await request.json();
        return HttpResponse.json({ id: 'dec1' }, { status: 201 });
      }),
    );
    renderSection();
    await user().click(await screen.findByRole('button', { name: /1 resolved/i }));
    await user().click(await screen.findByRole('button', { name: /Log decision/ }));

    await waitFor(() => expect(suggestBody).not.toBeNull());
    expect(suggestBody).toEqual({ commentId: 'c4' });

    // dialog opens prefilled with the AI suggestion
    const title = (await screen.findByLabelText('Title')) as HTMLInputElement;
    expect(title.value).toBe('Adopt SSE for streaming');
    expect((screen.getByLabelText('Decision') as HTMLTextAreaElement).value).toBe(
      'We will stream over SSE.',
    );

    await user().click(screen.getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(decisionBody).not.toBeNull());
    expect(decisionBody).toEqual({
      featureId: 'f1',
      title: 'Adopt SSE for streaming',
      decisionMd: 'We will stream over SSE.',
      alternativesMd: '- WebSockets',
      sourceCommentId: 'c4',
    });
  });

  it('deletes my own comment from the actions menu', async () => {
    threads = [myThread, adaThread];
    let deleted: string | null = null;
    server.use(
      http.delete(`/api/projects/${TEST_PROJECT_ID}/comments/:id`, ({ params }) => {
        deleted = String(params.id);
        threads = [adaThread];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderSection();
    await screen.findByText('Root by Corban');
    await user().click(screen.getByRole('button', { name: 'Comment actions' }));
    await user().click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe('c1'));
    // optimistic removal
    expect(screen.queryByText('Root by Corban')).toBeNull();
  });
});
