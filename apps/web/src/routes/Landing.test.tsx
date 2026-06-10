import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { OverviewResponse } from '@productmap/shared';
import Landing from './Landing';

const product = {
  id: 'p1',
  name: 'ProductMap',
  vision: 'Roadmaps and docs your security team will let you run.',
  aboutMd: '',
};

function feature(overrides: Partial<OverviewResponse['features'][number]> & { id: string; title: string }) {
  return {
    productId: 'p1',
    horizon: 'now' as const,
    status: 'idea' as const,
    startDate: null,
    endDate: null,
    sortOrder: 0,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    documents: [],
    ...overrides,
  };
}

const fixture: OverviewResponse = {
  product,
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

const server = setupServer(
  http.get('/api/overview', () => HttpResponse.json(fixture)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
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
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/board" element={<div>board page</div>} />
          <Route path="/roadmap" element={<div>roadmap page</div>} />
          <Route path="/docs/:id" element={<div>doc page</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
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
      http.patch('/api/products/p1', async ({ request }) => {
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
