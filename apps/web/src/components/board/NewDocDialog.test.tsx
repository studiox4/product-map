import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { FeatureWithDocs, Template } from '@productmap/shared';
import { NewDocDialog } from '@/components/board/NewDocDialog';

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
  archivedAt: null,
};

const templates: Template[] = [
  {
    ...base,
    id: 't-prd-default',
    type: 'prd',
    name: 'Standard PRD',
    description: 'Problem, goals, requirements.',
    isDefault: true,
  },
  {
    ...base,
    id: 't-prd-light',
    type: 'prd',
    name: 'Lightweight PRD',
    description: 'A shorter PRD.',
    isDefault: false,
  },
  {
    ...base,
    id: 't-brd-default',
    type: 'brd',
    name: 'Business BRD',
    description: 'Business case.',
    isDefault: true,
  },
];

const feature = {
  id: 'f1',
  title: 'Rich markdown editor',
} as FeatureWithDocs;

let createBodies: unknown[] = [];

const server = setupServer(
  http.get('/api/templates', () => HttpResponse.json(templates)),
  http.post('/api/documents', async ({ request }) => {
    const body = await request.json();
    createBodies.push(body);
    return HttpResponse.json(
      {
        id: 'doc-new',
        featureId: feature.id,
        type: (body as { type: string }).type,
        title: (body as { title: string }).title,
        status: 'draft',
        contentJson: { type: 'doc', content: [] },
        contentMd: '',
      },
      { status: 201 },
    );
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  createBodies = [];
  cleanup();
});
afterAll(() => server.close());

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NewDocDialog feature={feature} open onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const user = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

describe('NewDocDialog', () => {
  it('lists templates per type with the default preselected, plus Blank', async () => {
    renderDialog();

    expect(await screen.findByText('Lightweight PRD')).toBeTruthy();
    expect(screen.getByText('Business BRD')).toBeTruthy();
    expect(screen.getByText('Blank')).toBeTruthy();
    // hint text comes from the template description
    expect(screen.getByText('A shorter PRD.')).toBeTruthy();

    const defaultRadio = screen.getByRole('radio', { name: /Standard PRD Default/ });
    expect(defaultRadio.getAttribute('aria-checked')).toBe('true');
  });

  it('sends the selected templateId and its type', async () => {
    renderDialog();
    const u = user();

    await u.click(await screen.findByText('Lightweight PRD'));
    await u.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createBodies).toHaveLength(1));
    expect(createBodies[0]).toMatchObject({
      featureId: 'f1',
      type: 'prd',
      templateId: 't-prd-light',
    });
  });

  it('creates a blank doc without a templateId', async () => {
    renderDialog();
    const u = user();

    await u.click(await screen.findByText('Blank'));
    await u.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createBodies).toHaveLength(1));
    const body = createBodies[0] as Record<string, unknown>;
    expect(body.fromTemplate).toBe(false);
    expect(body.templateId).toBeUndefined();
  });
});
