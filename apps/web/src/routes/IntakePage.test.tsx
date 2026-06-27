import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IntakePage from './IntakePage';

// Node's experimental webstorage shadows jsdom's localStorage in this env —
// install a working in-memory Storage (mirrors SharePage.test.tsx).
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

const server = setupServer(
  http.get('/api/intake/:token', ({ params }) => {
    if (params.token === 'dead') {
      return HttpResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return HttpResponse.json({ projectName: 'ProductMap', introMd: 'Tell us', active: true });
  }),
  http.post('/api/intake/:token', () => {
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderIntake(token: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/p/${token}/submit`]}>
        <Routes>
          <Route path="/p/:token/submit" element={<IntakePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('IntakePage', () => {
  it('renders intro + form, submits, shows success', async () => {
    renderIntake('tok-1');
    expect(await screen.findByText('Tell us')).toBeDefined();
    await userEvent.type(screen.getByLabelText(/title/i), 'My idea');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByText(/thanks/i)).toBeDefined();
  });

  it('shows the inactive state on a 404 meta', async () => {
    renderIntake('dead');
    expect(await screen.findByText(/isn't active/i)).toBeDefined();
  });

  it('injects noindex on mount, removes on unmount', async () => {
    const sel = 'meta[name="robots"]';
    expect(document.head.querySelector(sel)).toBeNull();
    const { unmount } = renderIntake('tok-1');
    await screen.findByText('Tell us');
    expect(document.head.querySelector(sel)?.getAttribute('content')).toBe('noindex, nofollow');
    unmount();
    expect(document.head.querySelector(sel)).toBeNull();
  });

  it('renders a hidden honeypot website field', () => {
    renderIntake('tok-1');
    const hp = document.querySelector('input[name="website"]') as HTMLInputElement | null;
    expect(hp).not.toBeNull();
  });
});
