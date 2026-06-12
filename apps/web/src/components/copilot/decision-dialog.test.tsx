import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DecisionDialog } from './DecisionDialog';

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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const initial = {
  title: 'Adopt SSE for streaming',
  decisionMd: 'We will stream over SSE because it is simple.',
  alternativesMd: '- WebSockets\n- Polling',
};

function renderDialog(onOpenChange = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <DecisionDialog
        open
        onOpenChange={onOpenChange}
        initial={initial}
        featureId="f1"
        sourceCommentId="c4"
      />
    </QueryClientProvider>,
  );
}

describe('DecisionDialog', () => {
  it('prefills the suggested decision fields (still editable)', () => {
    renderDialog();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(initial.title);
    expect((screen.getByLabelText('Decision') as HTMLTextAreaElement).value).toBe(
      initial.decisionMd,
    );
    expect(
      (screen.getByLabelText('Alternatives considered') as HTMLTextAreaElement).value,
    ).toBe(initial.alternativesMd);
  });

  it('POSTs the decision with feature and source-comment links, then closes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'dec1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Adopt SSE everywhere' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/decisions');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      featureId: 'f1',
      title: 'Adopt SSE everywhere',
      decisionMd: initial.decisionMd,
      alternativesMd: initial.alternativesMd,
      sourceCommentId: 'c4',
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('disables save until title and decision are filled', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <DecisionDialog open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const save = screen.getByRole('button', { name: 'Save decision' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'T' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'D' } });
    expect(save.disabled).toBe(false);
  });
});
