import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProjectProvider, useProjectId } from './project';
import type { Project } from '@productmap/shared';

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

// --- test helpers ---

export interface ProjectListItem extends Project {
  role: 'owner' | 'editor' | 'viewer';
}

const project1: ProjectListItem = {
  id: 'p1',
  name: 'Test Project',
  vision: 'Ship great products.',
  aboutMd: '',
  role: 'owner',
};

/** Probe component — renders the active project id provided by useProjectId(). */
function ProjectIdProbe() {
  const id = useProjectId();
  return <div data-testid="project-id">{id}</div>;
}

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ProjectProvider>{children}</ProjectProvider>
    </QueryClientProvider>
  );
}

const server = setupServer(
  http.get('/api/projects', () => {
    return HttpResponse.json([project1]);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

describe('ProjectProvider + useProjectId', () => {
  it('exposes the first project id to consumers via useProjectId()', async () => {
    render(
      <Wrapper>
        <ProjectIdProbe />
      </Wrapper>,
    );

    const el = await screen.findByTestId('project-id');
    expect(el.textContent).toBe('p1');
  });

  it('renders the first-run fallback when GET /api/projects returns an empty list', async () => {
    server.use(http.get('/api/projects', () => HttpResponse.json([])));

    render(
      <Wrapper>
        <ProjectIdProbe />
      </Wrapper>,
    );

    const el = await screen.findByTestId('first-run');
    expect(el.textContent).toContain('Create your first project');
  });
});
