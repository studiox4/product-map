import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { OverviewResponse, WorkspaceActivityItem } from '@productmap/shared';
import Landing from './Landing';
import { digestCacheKey } from '@/components/landing/AiDigestCard';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

const product = {
  id: 'p1',
  name: 'ProductMap',
  vision: 'Roadmaps and docs your security team will let you run.',
  aboutMd: '',
};

function feature(overrides: Partial<OverviewResponse['features'][number]> & { id: string; title: string }) {
  return {
    projectId: 'p1',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0 as const,
    horizon: 'now' as const,
    status: 'idea' as const,
    startDate: null,
    endDate: null,
    sortOrder: 0,
    descriptionMd: '',
    size: null,
    riskMd: '',
    objectiveId: null,
    releaseId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    documents: [],
    ...overrides,
  };
}

const fixture: OverviewResponse = {
  project: product,
  features: [
    feature({ id: 'f1', title: 'Rich markdown editor', horizon: 'now', status: 'in_progress', startDate: '2026-06-01', endDate: '2026-06-20', sortOrder: 0 }),
    feature({ id: 'f2', title: 'Now-next-later board', horizon: 'now', status: 'in_progress', startDate: '2026-06-05', endDate: '2026-06-25', sortOrder: 1 }),
    feature({ id: 'f3', title: 'Gantt roadmap', horizon: 'next', status: 'planned', startDate: '2026-07-01', endDate: '2026-07-21', sortOrder: 0 }),
    feature({ id: 'f4', title: 'AI doc drafting', horizon: 'next', status: 'planned', startDate: '2026-07-10', endDate: '2026-07-30', sortOrder: 1 }),
    feature({ id: 'f5', title: 'Comments & review', horizon: 'later', sortOrder: 0 }),
    feature({ id: 'f6', title: 'Up/down voting', horizon: 'later', sortOrder: 1 }),
    feature({ id: 'f7', title: 'Realtime collaboration (Yjs)', horizon: 'later', sortOrder: 2 }),
    feature({ id: 'f8', title: 'ECS deployment', horizon: 'later', sortOrder: 3 }),
  ],
  attention: [
    { kind: 'draft_doc', documentId: 'd1', featureId: 'f1', title: 'Rich markdown editor — PRD', docType: 'prd' },
    { kind: 'missing_dates', featureId: 'f8', title: 'ECS deployment' },
  ],
};

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function activityItem(id: string, createdAt: string): WorkspaceActivityItem {
  return {
    id,
    featureId: 'f1',
    featureTitle: 'Rich markdown editor',
    actorId: 'u1',
    actorName: 'Mara',
    actorColor: '#6d3f9e',
    kind: 'status_changed',
    payload: { from: 'planned', to: 'in_progress' },
    createdAt,
  };
}

// Three events this week, one ~3 weeks back, one outside the 12-week heatmap window.
const activityFixture: WorkspaceActivityItem[] = [
  activityItem('a1', daysAgo(0)),
  activityItem('a2', daysAgo(1)),
  activityItem('a3', daysAgo(1)),
  activityItem('a4', daysAgo(21)),
  activityItem('a5', daysAgo(120)),
];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get('/api/overview', () => HttpResponse.json(fixture)),
  http.get('/api/activity', () => HttpResponse.json(activityFixture)),
  http.get('/api/ai/status', () => HttpResponse.json({ enabled: false })),
);

/**
 * SSE for the digest is mocked at the fetch layer (like AiDraftCard.test) —
 * jsdom's AbortSignal isn't accepted by undici's Request inside MSW.
 * Everything else still flows through the MSW server.
 */
function mockDigestStream(chunks: string[]): { calls: () => number } {
  const body =
    chunks
      .map((text) => `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`)
      .join('') + 'event: done\ndata: {}\n\n';
  let calls = 0;
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/ai/digest')) {
      calls += 1;
      return Promise.resolve(
        new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
      );
    }
    return realFetch(input, init ? { ...init, signal: undefined } : init);
  });
  return { calls: () => calls };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  sessionStorage.clear();
  cleanup();
});
afterAll(() => server.close());

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderLanding() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/board" element={<div>board page</div>} />
            <Route path="/roadmap" element={<div>roadmap page</div>} />
            <Route path="/docs/:id" element={<div>doc page</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('Landing', () => {
  it('renders all four panels from the overview fixture', async () => {
    renderLanding();
    expect(await screen.findByRole('heading', { name: 'ProductMap' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Now' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Next' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Later' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeTruthy();
  });

  it('shows top 3 per horizon with a +N more link', async () => {
    renderLanding();
    const later = (await screen.findByRole('heading', { name: 'Later' })).closest('section')!;
    expect(within(later).getByText('Comments & review')).toBeTruthy();
    expect(within(later).getByText('Up/down voting')).toBeTruthy();
    expect(within(later).getByText('Realtime collaboration (Yjs)')).toBeTruthy();
    expect(within(later).queryByText('ECS deployment')).toBeNull();
    expect(within(later).getByRole('link', { name: '+1 more' })).toBeTruthy();
  });

  it('hero renders one bar per dated feature plus a today line', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'ProductMap' });
    const bars = screen.getAllByTestId('gantt-hero-bar');
    expect(bars.length).toBe(4); // f1-f4 are dated
    expect(screen.getByTestId('gantt-hero-today')).toBeTruthy();
  });

  it('attention doc item navigates to the doc editor', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'Needs attention' });
    await userEvent.click(screen.getByRole('button', { name: /Rich markdown editor — PRD/ }));
    expect(screen.getByTestId('location').textContent).toBe('/docs/d1');
  });

  it('attention feature item navigates to board with feature param', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'Needs attention' });
    await userEvent.click(screen.getByRole('button', { name: /ECS deployment/ }));
    expect(screen.getByTestId('location').textContent).toBe('/board?feature=f8');
  });

  it('horizon panel feature click deep-links to board detail', async () => {
    renderLanding();
    const now = (await screen.findByRole('heading', { name: 'Now' })).closest('section')!;
    await userEvent.click(within(now).getByRole('button', { name: /Rich markdown editor/ }));
    expect(screen.getByTestId('location').textContent).toBe('/board?feature=f1');
  });

  it('shows an error card with retry when overview fails', async () => {
    server.use(http.get('/api/overview', () => HttpResponse.json({ error: 'internal' }, { status: 500 })));
    renderLanding();
    expect(await screen.findByText(/Couldn't load the overview/)).toBeTruthy();
    server.resetHandlers();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'ProductMap' })).toBeTruthy();
  });

  it('saves an edited vision and PATCHes the product', async () => {
    let patched: unknown = null;
    server.use(
      http.patch('/api/projects/p1', async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ ...product, vision: 'New vision' });
      }),
    );
    renderLanding();
    await screen.findByRole('heading', { name: 'ProductMap' });
    await userEvent.click(screen.getByText(product.vision));
    const input = screen.getByRole('textbox', { name: 'Product vision' });
    await userEvent.clear(input);
    await userEvent.type(input, 'New vision{Enter}');
    expect(patched).toEqual({ vision: 'New vision' });
  });
});

describe('Landing viz layer', () => {
  it('renders the velocity sparkline with this week’s event count', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'ProductMap' });
    const spark = await screen.findByTestId('velocity-sparkline');
    expect(spark.getAttribute('aria-label')).toContain('last 8 weeks');
    // 3 fixture events fall in the current 7-day window
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('events this week')).toBeTruthy();
  });

  it('renders the Pulse panel with a 12-week heatmap and intensity levels', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'Pulse' });
    const days = await screen.findAllByTestId('pulse-day');
    // 12 weeks × 7 days minus future days in the trailing week
    expect(days.length).toBeGreaterThanOrEqual(12 * 7 - 6);
    expect(days.length).toBeLessThanOrEqual(12 * 7);
    const active = days.filter((d) => d.getAttribute('data-level') !== '0');
    // a1 (today), a2+a3 (yesterday), a4 (3 weeks ago) — a5 is outside the window
    expect(active.length).toBe(3);
    const levels = active.map((d) => Number(d.getAttribute('data-level')));
    expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels)); // 2-event day hotter than 1-event days
    expect(active[0].getAttribute('title')).toMatch(/event/);
  });

  it('shows the horizon arc in the Pulse header with the distribution label', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'Pulse' });
    const arc = screen.getByTestId('horizon-arc');
    expect(arc.getAttribute('aria-label')).toBe('Features by horizon: Now 2, Next 2, Later 4');
  });

  it('hides the AI digest card when AI is disabled', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'Pulse' });
    expect(screen.queryByTestId('ai-digest-card')).toBeNull();
  });

  it('streams the digest when AI is enabled and caches it for the day', async () => {
    server.use(http.get('/api/ai/status', () => HttpResponse.json({ enabled: true })));
    const digest = mockDigestStream(['Shipped the **editor**', ' and planned the roadmap.']);
    renderLanding();
    expect(await screen.findByTestId('ai-digest-card')).toBeTruthy();
    expect(await screen.findByText(/and planned the roadmap/)).toBeTruthy();
    expect(screen.getByText('editor').tagName).toBe('STRONG'); // markdown rendered
    expect(digest.calls()).toBe(1);
    expect(sessionStorage.getItem(digestCacheKey())).toBe(
      'Shipped the **editor** and planned the roadmap.',
    );
  });

  it('serves the digest from the sessionStorage day-cache without refetching', async () => {
    sessionStorage.setItem(digestCacheKey(), 'Cached digest from earlier today.');
    server.use(http.get('/api/ai/status', () => HttpResponse.json({ enabled: true })));
    const digest = mockDigestStream(['fresh']);
    renderLanding();
    expect(await screen.findByText('Cached digest from earlier today.')).toBeTruthy();
    expect(digest.calls()).toBe(0);
  });
});
