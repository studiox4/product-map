import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectProvider } from '@/lib/project';
import { ReviewSheet } from './ReviewSheet';

const TEST_PROJECT_ID = 'p1';

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

const DOC_ID = '22222222-2222-2222-2222-222222222222';

/** Minimal wrapper that provides ReactQuery + ProjectProvider (mocked projects list). */
function renderSheet(props: { open: boolean }) {
  // Mock fetch: /api/projects returns the test project; review-doc is handled per test.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <ReviewSheet documentId={DOC_ID} open={props.open} onOpenChange={vi.fn()} />
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

describe('ReviewSheet', () => {
  it('streams the rubric review into the sheet when opened', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify([{ id: TEST_PROJECT_ID, name: 'Test', vision: '', aboutMd: '', role: 'owner' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === `/api/projects/${TEST_PROJECT_ID}/ai/review-doc`) {
        return sseResponse([
          'event: chunk\ndata: {"text":"## Problem clarity\\n\\nClear (L3)."}\n\n',
          'event: chunk\ndata: {"text":"\\n\\n## Risks\\n\\nNone cited."}\n\n',
          'event: done\ndata: {}\n\n',
        ]);
      }
      throw new Error(`unhandled fetch ${url}`);
    });

    renderSheet({ open: true });

    expect(await screen.findByRole('heading', { name: 'Problem clarity' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Risks' })).toBeTruthy();
    expect(screen.getByText('Clear (L3).')).toBeTruthy();

    const reviewCall = fetchSpy.mock.calls.find(([u]) =>
      String(u).includes('/ai/review-doc'),
    )!;
    expect(reviewCall).toBeTruthy();
    expect(String(reviewCall[0])).toBe(`/api/projects/${TEST_PROJECT_ID}/ai/review-doc`);
    expect(reviewCall[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(
      JSON.parse((reviewCall[1] as RequestInit).body as string),
    ).toEqual({ documentId: DOC_ID });
  });

  it('does not fetch review-doc while closed', async () => {
    // Even while closed, ProjectProvider needs /api/projects to resolve.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify([{ id: TEST_PROJECT_ID, name: 'Test', vision: '', aboutMd: '', role: 'owner' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unhandled fetch ${url}`);
    });
    renderSheet({ open: false });
    // Wait a tick so ProjectProvider resolves; review-doc must NOT be called.
    await new Promise((r) => setTimeout(r, 50));
    const reviewCalls = fetchSpy.mock.calls.filter(([u]) =>
      String(u).includes('/ai/review-doc'),
    );
    expect(reviewCalls).toHaveLength(0);
  });

  it('shows an error with retry when the stream fails, and retries', async () => {
    let reviewCallCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/projects') {
        return new Response(JSON.stringify([{ id: TEST_PROJECT_ID, name: 'Test', vision: '', aboutMd: '', role: 'owner' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === `/api/projects/${TEST_PROJECT_ID}/ai/review-doc`) {
        reviewCallCount++;
        if (reviewCallCount === 1) return new Response('{}', { status: 503 });
        return sseResponse([
          'event: chunk\ndata: {"text":"## Non-goals\\n\\nGood."}\n\n',
          'event: done\ndata: {}\n\n',
        ]);
      }
      throw new Error(`unhandled fetch ${url}`);
    });

    renderSheet({ open: true });

    expect(await screen.findByText(/Couldn't review this document/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Non-goals' })).toBeTruthy();
    await waitFor(() => expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes('/ai/review-doc'))).toHaveLength(2));
  });
});
