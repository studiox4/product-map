import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ActivityItem, DocumentListItem, FeatureWithDocs, User } from '@productmap/shared';
import FeaturePage from '@/routes/FeaturePage';

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

const now = '2026-06-09T00:00:00.000Z';

const corban: User = { id: 'u1', name: 'Corban', color: '#2b557e', createdAt: now };
const ada: User = { id: 'u2', name: 'Ada', color: '#3c6b46', createdAt: now };

const feature: FeatureWithDocs = {
  id: 'f1',
  productId: 'p1',
  score: 0,
  boosts: 0,
  cools: 0,
  myVote: 0 as const,
  title: 'Rich markdown editor',
  horizon: 'now',
  status: 'in_progress',
  startDate: '2026-06-01',
  endDate: '2026-06-20',
  sortOrder: 0,
  descriptionMd: '## Goals\n\nShip a great editor.',
  createdBy: 'u1',
  updatedBy: 'u1',
  createdAt: now,
  updatedAt: now,
  documents: [
    {
      id: 'd1',
      featureId: 'f1',
      type: 'prd',
      title: 'Editor PRD',
      status: 'draft',
      createdBy: 'u1',
      updatedBy: 'u1',
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const allDocs: DocumentListItem[] = [
  { ...feature.documents[0], featureTitle: feature.title, featureHorizon: 'now', wordCount: 42 },
];

const activity: ActivityItem[] = [
  {
    id: 'a2',
    featureId: 'f1',
    actorId: 'u2',
    actorName: 'Ada',
    actorColor: '#3c6b46',
    kind: 'status_changed',
    payload: { from: 'planned', to: 'in_progress' },
    createdAt: now,
  },
  {
    id: 'a1',
    featureId: 'f1',
    actorId: 'u1',
    actorName: 'Corban',
    actorColor: '#2b557e',
    kind: 'feature_created',
    payload: { to: 'Rich markdown editor' },
    createdAt: now,
  },
];

const server = setupServer(
  http.get('/api/users', () => HttpResponse.json([corban, ada])),
  http.get('/api/features/f1', () => HttpResponse.json(feature)),
  http.get('/api/features/f1/activity', () => HttpResponse.json(activity)),
  http.get('/api/features/f1/collaborators', () => HttpResponse.json([corban, ada])),
  http.get('/api/documents', () => HttpResponse.json(allDocs)),
  http.get('/api/comments', () => HttpResponse.json([])),
  http.patch('/api/features/f1', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...feature, ...body, documents: undefined });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/features/f1']}>
        <Routes>
          <Route path="/features/:id" element={<FeaturePage />} />
          <Route path="/board" element={<div>board page</div>} />
          <Route path="/docs/:id" element={<div>doc page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FeaturePage', () => {
  it('renders breadcrumb, title and rendered markdown description', async () => {
    renderPage();
    expect(screen.getByTestId('feature-skeleton')).toBeTruthy();
    expect(await screen.findByDisplayValue('Rich markdown editor')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Board' })).toBeTruthy();
    // markdown rendered to a real heading inside the description card
    const description = screen.getByRole('region', { name: 'Description' });
    expect(within(description).getByRole('heading', { name: 'Goals' })).toBeTruthy();
    expect(within(description).getByText('Ship a great editor.')).toBeTruthy();
  });

  it('docs grid shows type/status, word count and a dashed New doc card', async () => {
    renderPage();
    const docs = await screen.findByRole('region', { name: 'Docs' });
    expect(within(docs).getByText('Editor PRD')).toBeTruthy();
    expect(within(docs).getByText('PRD')).toBeTruthy();
    expect(within(docs).getByText('Draft')).toBeTruthy();
    expect(await within(docs).findByText('42 words')).toBeTruthy();
    // dashed + New doc card opens the dialog
    await user().click(within(docs).getByRole('button', { name: /new doc/i }));
    expect(await screen.findByRole('dialog', { name: /new doc/i })).toBeTruthy();
  });

  it('doc card click navigates to the editor route', async () => {
    renderPage();
    const docs = await screen.findByRole('region', { name: 'Docs' });
    await user().click(within(docs).getByRole('button', { name: /editor prd/i }));
    expect(await screen.findByText('doc page')).toBeTruthy();
  });

  it('activity feed lists actor + humanized verb, newest first', async () => {
    renderPage();
    const feed = await screen.findByRole('region', { name: 'Activity' });
    const items = await within(feed).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Ada');
    expect(items[0].textContent).toContain('changed status to In progress');
    expect(items[1].textContent).toContain('Corban');
    expect(items[1].textContent).toContain('created this feature');
    // relative time present
    expect(items[0].textContent).toMatch(/ago/);
  });

  it('people rail shows creator and collaborators with remove control', async () => {
    renderPage();
    const people = await screen.findByRole('region', { name: 'People' });
    expect(await within(people).findByText('Corban')).toBeTruthy();
    expect(within(people).getByText('Creator')).toBeTruthy();
    expect(await within(people).findByText('Ada')).toBeTruthy();
    expect(within(people).getByRole('button', { name: 'Remove Ada' })).toBeTruthy();
  });

  it('removing a collaborator PUTs the reduced set', async () => {
    let putBody: unknown = null;
    server.use(
      http.put('/api/features/f1/collaborators', async ({ request }) => {
        putBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    const people = await screen.findByRole('region', { name: 'People' });
    await within(people).findByText('Ada');
    await user().click(within(people).getByRole('button', { name: 'Remove Ada' }));
    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toEqual({ userIds: ['u1'] });
  });

  it('editing the description PATCHes descriptionMd', async () => {
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/features/f1', async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...feature, ...patched });
      }),
    );
    renderPage();
    const description = await screen.findByRole('region', { name: 'Description' });
    await user().click(within(description).getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByLabelText('Feature description');
    await user().clear(textarea);
    await user().type(textarea, 'New plan');
    await user().tab(); // blur saves
    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).toMatchObject({ descriptionMd: 'New plan' });
  });

  it('delete requires confirmation, then navigates to the board', async () => {
    let deleted = false;
    server.use(
      http.delete('/api/features/f1', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    await screen.findByDisplayValue('Rich markdown editor');
    await user().click(screen.getByRole('button', { name: 'Delete feature' }));
    const dialog = await screen.findByRole('dialog', { name: /delete feature/i });
    await user().click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByText('board page')).toBeTruthy();
  });
});
