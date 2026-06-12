import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CopilotNudge } from '@productmap/shared';
import { CopilotPanel, linkifyDocTitles } from './CopilotPanel';

// Node's experimental webstorage shadows jsdom's localStorage in this env —
// install a working in-memory Storage (same shim as comments-section tests).
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const docs = [
  { id: 'd1', title: 'Telemetry PRD' },
  { id: 'd2', title: 'Comments spec' },
];

const nudges: CopilotNudge[] = [
  {
    kind: 'stale_draft',
    documentId: 'd1',
    featureId: 'f1',
    title: 'Telemetry PRD',
    updatedAt: new Date().toISOString(),
  },
  { kind: 'dateless_now', featureId: 'f2', title: 'Realtime collaboration' },
];

function mockFetch(chatEvents: string[]) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/documents')) return jsonResponse(docs);
      if (url === '/api/copilot/nudges') return jsonResponse(nudges);
      if (url === '/api/ai/chat') return sseResponse(chatEvents);
      throw new Error(`unhandled fetch ${url}`);
    });
}

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CopilotPanel open onOpenChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('linkifyDocTitles', () => {
  it('wraps bold doc-title citations in doc links', () => {
    const html = '<p>See <strong>Telemetry PRD</strong> for details.</p>';
    const out = linkifyDocTitles(html, docs);
    expect(out).toContain('<a href="/docs/d1" data-doc-link="d1"><strong>Telemetry PRD</strong></a>');
  });

  it('matches HTML-escaped titles and leaves non-citations alone', () => {
    const out = linkifyDocTitles('<p><strong>Q&amp;A doc</strong> and <strong>other</strong></p>', [
      { id: 'd9', title: 'Q&A doc' },
    ]);
    expect(out).toContain('href="/docs/d9"');
    expect(out).toContain('<strong>other</strong>');
    expect(out).not.toContain('<a href="/docs/d9" data-doc-link="d9"><strong>other</strong></a>');
  });
});

describe('CopilotPanel', () => {
  it('renders Chat and Nudges tabs with the chat empty state', async () => {
    mockFetch([]);
    renderPanel();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Nudges' })).toBeTruthy();
    expect(await screen.findByText(/Ask anything about this workspace/)).toBeTruthy();
  });

  it('streams a chat answer and links doc-title citations', async () => {
    const fetchSpy = mockFetch([
      'event: chunk\ndata: {"text":"Per "}\n\n',
      'event: chunk\ndata: {"text":"**Telemetry PRD** we sample 10%."}\n\n',
      'event: done\ndata: {}\n\n',
    ]);
    renderPanel();

    fireEvent.change(screen.getByLabelText('Ask the copilot'), {
      target: { value: 'How much do we sample?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // question bubble + streamed answer
    expect(await screen.findByText('How much do we sample?')).toBeTruthy();
    const citation = await screen.findByRole('link', { name: 'Telemetry PRD' });
    expect(citation.getAttribute('href')).toBe('/docs/d1');

    const chatCall = fetchSpy.mock.calls.find(([u]) => String(u) === '/api/ai/chat')!;
    expect(JSON.parse((chatCall[1] as RequestInit).body as string)).toEqual({
      question: 'How much do we sample?',
    });
  });

  it('shows an error message when the chat stream fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/documents')) return jsonResponse(docs);
      if (url === '/api/ai/chat') return new Response('{}', { status: 503 });
      throw new Error(`unhandled fetch ${url}`);
    });
    renderPanel();
    fireEvent.change(screen.getByLabelText('Ask the copilot'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/Couldn't answer that/)).toBeTruthy();
  });

  it('lists nudges with click-through links on the Nudges tab', async () => {
    mockFetch([]);
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Nudges' }));

    const staleDraft = await screen.findByRole('link', { name: /Telemetry PRD/ });
    expect(staleDraft.getAttribute('href')).toBe('/docs/d1');
    expect(screen.getByText('Draft untouched for 2+ weeks')).toBeTruthy();

    const dateless = screen.getByRole('link', { name: /Realtime collaboration/ });
    expect(dateless.getAttribute('href')).toBe('/features/f2');
    expect(screen.getByText('Now feature missing dates')).toBeTruthy();
  });

  it('shows the tidy empty state when there are no nudges', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/documents')) return jsonResponse([]);
      if (url === '/api/copilot/nudges') return jsonResponse([]);
      throw new Error(`unhandled fetch ${url}`);
    });
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Nudges' }));
    expect(await screen.findByText(/All tidy/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Draft untouched/)).toBeNull());
  });
});
