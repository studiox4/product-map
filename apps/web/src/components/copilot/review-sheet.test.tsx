import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ReviewSheet } from './ReviewSheet';

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

describe('ReviewSheet', () => {
  it('streams the rubric review into the sheet when opened', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'event: chunk\ndata: {"text":"## Problem clarity\\n\\nClear (L3)."}\n\n',
        'event: chunk\ndata: {"text":"\\n\\n## Risks\\n\\nNone cited."}\n\n',
        'event: done\ndata: {}\n\n',
      ]),
    );
    render(<ReviewSheet documentId={DOC_ID} open onOpenChange={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Problem clarity' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Risks' })).toBeTruthy();
    expect(screen.getByText('Clear (L3).')).toBeTruthy();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/ai/review-doc',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string),
    ).toEqual({ documentId: DOC_ID });
  });

  it('does not fetch while closed', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<ReviewSheet documentId={DOC_ID} open={false} onOpenChange={vi.fn()} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows an error with retry when the stream fails, and retries', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(
        sseResponse([
          'event: chunk\ndata: {"text":"## Non-goals\\n\\nGood."}\n\n',
          'event: done\ndata: {}\n\n',
        ]),
      );
    render(<ReviewSheet documentId={DOC_ID} open onOpenChange={vi.fn()} />);

    expect(await screen.findByText(/Couldn't review this document/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Non-goals' })).toBeTruthy();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
