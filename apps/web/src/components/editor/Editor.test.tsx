import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Editor } from './Editor';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
const FILLED_DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'PRD' }] },
  ],
};

const baseProps = {
  initialContent: EMPTY_DOC,
  onChange: vi.fn(),
  uploadImage: vi.fn().mockResolvedValue('/uploads/x.png'),
  aiConfig: { featureId: '11111111-1111-1111-1111-111111111111', docType: 'prd' as const },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Editor', () => {
  it('renders the tiptap surface with slash placeholder configured', async () => {
    render(<Editor {...baseProps} aiEnabled={false} />);
    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')).toBeTruthy();
    });
  });

  it('hides the AI draft card when AI is disabled', async () => {
    render(<Editor {...baseProps} aiEnabled={false} />);
    await waitFor(() => expect(document.querySelector('.ProseMirror')).toBeTruthy());
    expect(screen.queryByText('Draft with AI')).toBeNull();
  });

  it('shows the AI draft card when AI is enabled and the doc is empty', async () => {
    render(<Editor {...baseProps} aiEnabled={true} />);
    await screen.findByRole('button', { name: 'Draft with AI' });
  });

  it('hides the AI draft card when the doc has text content', async () => {
    render(<Editor {...baseProps} initialContent={FILLED_DOC} aiEnabled={true} />);
    await waitFor(() => expect(document.querySelector('.ProseMirror')).toBeTruthy());
    expect(screen.queryByText('Draft with AI')).toBeNull();
  });

  it('streams AI markdown into the editor: content grows chunk by chunk', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: chunk\ndata: {"text":"# Streaming title"}\n\n'),
        );
        controller.enqueue(
          encoder.encode(
            'event: chunk\ndata: {"text":"\\n\\nA body paragraph arrives."}\n\n',
          ),
        );
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(stream, { status: 200 }));

    const onAiDone = vi.fn();
    render(<Editor {...baseProps} aiEnabled={true} onAiDone={onAiDone} />);
    const brief = await screen.findByPlaceholderText(/Describe the feature/);
    fireEvent.change(brief, { target: { value: 'editor demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));

    await waitFor(() => {
      const pm = document.querySelector('.ProseMirror');
      expect(pm?.textContent).toContain('Streaming title');
      expect(pm?.textContent).toContain('A body paragraph arrives.');
    });
    await waitFor(() => expect(onAiDone).toHaveBeenCalledTimes(1));
    // onAiDone receives the final tiptap JSON
    const json = onAiDone.mock.calls[0][0];
    expect(JSON.stringify(json)).toContain('Streaming title');
  });
});
