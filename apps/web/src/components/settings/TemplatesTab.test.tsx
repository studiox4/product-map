import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Template } from '@productmap/shared';
import { TemplatesTab } from '@/components/settings/TemplatesTab';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
import { toast } from 'sonner';

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

const base = {
  bodyJson: { type: 'doc', content: [] },
  bodyMd: '',
  promptHints: '',
  createdBy: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};

const fixture: Template[] = [
  {
    ...base,
    id: 't-prd-default',
    type: 'prd',
    name: 'Standard PRD',
    description: 'Problem, goals, requirements.',
    isDefault: true,
    archivedAt: null,
  },
  {
    ...base,
    id: 't-prd-light',
    type: 'prd',
    name: 'Lightweight PRD',
    description: 'A shorter PRD.',
    isDefault: false,
    archivedAt: null,
  },
  {
    ...base,
    id: 't-spec-default',
    type: 'tech_spec',
    name: 'Spec standard',
    description: 'Architecture and rollout.',
    isDefault: true,
    archivedAt: null,
  },
  {
    ...base,
    id: 't-brd-archived',
    type: 'brd',
    name: 'Old BRD',
    description: 'Retired.',
    isDefault: false,
    archivedAt: '2026-06-05T00:00:00.000Z',
  },
];

const server = setupServer(
  http.get('/api/templates', () => HttpResponse.json(fixture)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  cleanup();
});
afterAll(() => server.close());

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/settings/templates']}>
        <TemplatesTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TemplatesTab', () => {
  it('groups active templates per doc type with counts', async () => {
    renderTab();

    const prdGroup = await screen.findByRole('region', { name: 'prd templates' });
    expect(within(prdGroup).getByText('Standard PRD')).toBeTruthy();
    expect(within(prdGroup).getByText('Lightweight PRD')).toBeTruthy();
    expect(screen.getByTestId('count-prd').textContent).toBe('2');
    expect(screen.getByTestId('count-tech_spec').textContent).toBe('1');
    // archived BRD does not count toward its group
    expect(screen.getByTestId('count-brd').textContent).toBe('0');
  });

  it('shows the Default badge only on default templates', async () => {
    renderTab();

    const prdGroup = await screen.findByRole('region', { name: 'prd templates' });
    const rows = within(prdGroup).getAllByTestId('template-row');
    const defaultRow = rows.find((r) => within(r).queryByText('Standard PRD'));
    const otherRow = rows.find((r) => within(r).queryByText('Lightweight PRD'));
    expect(within(defaultRow!).getByText('Default')).toBeTruthy();
    expect(within(otherRow!).queryByText('Default')).not.toBeTruthy();
  });

  it('hides archived templates behind the toggle', async () => {
    renderTab();

    await screen.findByRole('region', { name: 'prd templates' });
    expect(screen.queryByText('Old BRD')).not.toBeTruthy();

    const user = userEvent.setup({
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    await user.click(screen.getByRole('button', { name: /archived \(1\)/i }));
    expect(screen.getByText('Old BRD')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
  });

  it('surfaces the server error when archiving the current default', async () => {
    server.use(
      http.post('/api/templates/t-prd-default/archive', () =>
        HttpResponse.json(
          { error: 'default_template', message: 'Set another default for this type first.' },
          { status: 400 },
        ),
      ),
    );
    renderTab();

    const user = userEvent.setup({
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    await user.click(
      await screen.findByRole('button', { name: 'Actions for Standard PRD' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Set another default for this type first.',
      ),
    );
  });
});
