import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AiDraftCard } from './AiDraftCard';

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AiDraftCard', () => {
  it('disables the draft button until a brief is entered', () => {
    render(
      <AiDraftCard
        featureId="11111111-1111-1111-1111-111111111111"
        docType="prd"
        onMarkdown={vi.fn()}
        onDone={vi.fn()}
        onStreamingChange={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Draft with AI' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Describe the feature/), {
      target: { value: 'A markdown editor' },
    });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('streams SSE chunks: onMarkdown receives growing cumulative markdown, then onDone', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'event: chunk\ndata: {"text":"# Hello"}\n\n',
        'event: chunk\ndata: {"text":"\\n\\nMore content here."}\n\n',
        'event: done\ndata: {}\n\n',
      ]),
    );
    const onMarkdown = vi.fn();
    const onDone = vi.fn();
    render(
      <AiDraftCard
        featureId="11111111-1111-1111-1111-111111111111"
        docType="prd"
        onMarkdown={onMarkdown}
        onDone={onDone}
        onStreamingChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Describe the feature/), {
      target: { value: 'A markdown editor with slash commands' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/ai/generate-doc',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toMatchObject({
      docType: 'prd',
      featureId: '11111111-1111-1111-1111-111111111111',
      brief: 'A markdown editor with slash commands',
    });

    expect(onMarkdown).toHaveBeenCalledTimes(2);
    expect(onMarkdown.mock.calls[0][0]).toBe('# Hello');
    expect(onMarkdown.mock.calls[1][0]).toBe('# Hello\n\nMore content here.');
    expect(onDone).toHaveBeenCalledWith('# Hello\n\nMore content here.');
  });

  it('shows a stop button while streaming; abort keeps partial content', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encoder.encode('event: chunk\ndata: {"text":"# Partial"}\n\n'),
        );
        await gate; // never released before abort
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
          resolve(new Response(stream, { status: 200 }));
        }),
    );
    const onMarkdown = vi.fn();
    const onDone = vi.fn();
    render(
      <AiDraftCard
        featureId="11111111-1111-1111-1111-111111111111"
        docType="prd"
        onMarkdown={onMarkdown}
        onDone={onDone}
        onStreamingChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Describe the feature/), {
      target: { value: 'brief' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));

    await waitFor(() =>
      expect(onMarkdown).toHaveBeenCalledWith('# Partial'),
    );
    const stop = await screen.findByRole('button', { name: 'Stop' });
    fireEvent.click(stop);
    release();

    // back to non-streaming state, partial kept (onDone NOT called, no reset of markdown)
    await screen.findByRole('button', { name: 'Draft with AI' });
    expect(onDone).not.toHaveBeenCalled();
    expect(onMarkdown).toHaveBeenCalledWith('# Partial');
  });

  it('shows an error message when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 503 }),
    );
    render(
      <AiDraftCard
        featureId="11111111-1111-1111-1111-111111111111"
        docType="prd"
        onMarkdown={vi.fn()}
        onDone={vi.fn()}
        onStreamingChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Describe the feature/), {
      target: { value: 'brief' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));
    await screen.findByText(/Couldn't draft/);
  });
});
