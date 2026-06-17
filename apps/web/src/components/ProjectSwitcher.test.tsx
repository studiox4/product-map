import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import ProjectSwitcher from './ProjectSwitcher';
import { ActiveProjectProvider } from '@/lib/project';

// Node's experimental webstorage shadows jsdom's localStorage in this env —
// install a working in-memory Storage (mirrors project.test.tsx).
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

const projects = [
  { id: 'p1', name: 'Alpha', vision: '', aboutMd: '', role: 'owner' },
  { id: 'p2', name: 'Beta', vision: '', aboutMd: '', role: 'viewer' },
];

const server = setupServer(
  http.get('/api/projects', () => HttpResponse.json(projects)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
});
afterAll(() => server.close());

function renderInProvider(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ActiveProjectProvider>{ui}</ActiveProjectProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectSwitcher', () => {
  it("lists the caller's projects and switches on select", async () => {
    renderInProvider(<ProjectSwitcher />);
    await screen.findByText('Alpha'); // current project name shown on the trigger
    await userEvent.click(screen.getByRole('button', { name: /switch project/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Beta' }));
    await waitFor(() => expect(localStorage.getItem('pm.activeProjectId')).toBe('p2'));
  });

  it('renders nothing when there are no projects', async () => {
    server.use(http.get('/api/projects', () => HttpResponse.json([])));
    const { container } = renderInProvider(<ProjectSwitcher />);
    // Provider fetches an empty list then the switcher returns null.
    await waitFor(() => expect(container.querySelector('button')).toBeNull());
    expect(container.textContent).toBe('');
  });
});
