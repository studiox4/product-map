import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  ActiveProjectProvider,
  ProjectProvider,
  useActiveProject,
  useCanEdit,
  useProjectId,
} from './project';
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

interface ProjectListItem extends Project {
  role: 'owner' | 'editor' | 'viewer';
}

const project1: ProjectListItem = {
  id: 'p1',
  name: 'Test Project',
  slug: 'test-project',
  vision: 'Ship great products.',
  aboutMd: '',
  role: 'owner',
};
const project2: ProjectListItem = {
  id: 'p2',
  name: 'Second Project',
  slug: 'second-project',
  vision: '',
  aboutMd: '',
  role: 'viewer',
};

/** Probe component — renders the active project id provided by useProjectId(). */
function ProjectIdProbe() {
  const id = useProjectId();
  return <div data-testid="project-id">{id}</div>;
}

/** Probe exposing the full active-project contract + setter + useCanEdit. */
function ActiveProbe() {
  const { projectId, role, projects, isLoading, setProjectId } = useActiveProject();
  const canEdit = useCanEdit();
  return (
    <div>
      <div data-testid="active-id">{projectId ?? 'null'}</div>
      <div data-testid="active-role">{role ?? 'null'}</div>
      <div data-testid="project-count">{projects.length}</div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="can-edit">{String(canEdit)}</div>
      <button data-testid="switch-p2" onClick={() => setProjectId('p2')}>
        switch
      </button>
    </div>
  );
}

function makeWrapper(Provider: typeof ProjectProvider | typeof ActiveProjectProvider) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={qc}>
        <Provider>{children}</Provider>
      </QueryClientProvider>
    );
  };
}

const ProjectWrapper = makeWrapper(ProjectProvider);
const ActiveWrapper = makeWrapper(ActiveProjectProvider);

/** ActiveProjectProvider renders children immediately (id 'null' pre-fetch), so
 *  wait for the resolved active id rather than first appearance of the node. */
async function waitForActiveId(expected: string) {
  await waitFor(() =>
    expect(screen.getByTestId('active-id').textContent).toBe(expected),
  );
}

const server = setupServer(
  http.get('/api/projects', () => {
    return HttpResponse.json([project1, project2]);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
});
afterAll(() => server.close());

describe('ProjectProvider + useProjectId (back-compat)', () => {
  it('exposes the first project id to consumers via useProjectId()', async () => {
    render(
      <ProjectWrapper>
        <ProjectIdProbe />
      </ProjectWrapper>,
    );

    const el = await screen.findByTestId('project-id');
    expect(el.textContent).toBe('p1');
  });

  it('renders the first-run fallback when GET /api/projects returns an empty list', async () => {
    server.use(http.get('/api/projects', () => HttpResponse.json([])));

    render(
      <ProjectWrapper>
        <ProjectIdProbe />
      </ProjectWrapper>,
    );

    const el = await screen.findByTestId('first-run');
    expect(el.textContent).toContain('Create your first project');
  });

  it('renders the error fallback when GET /api/projects fails', async () => {
    server.use(http.get('/api/projects', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));

    render(
      <ProjectWrapper>
        <ProjectIdProbe />
      </ProjectWrapper>,
    );

    const el = await screen.findByTestId('projects-error');
    expect(el.textContent).toContain('Could not load projects');
  });
});

describe('ActiveProjectProvider + useActiveProject', () => {
  it('auto-selects the first project when no id is persisted, exposing role + projects', async () => {
    render(
      <ActiveWrapper>
        <ActiveProbe />
      </ActiveWrapper>,
    );

    await waitForActiveId('p1');
    expect(screen.getByTestId('active-role').textContent).toBe('owner');
    expect(screen.getByTestId('project-count').textContent).toBe('2');
    expect(screen.getByTestId('loading').textContent).toBe('false');
    // Auto-select is pure derived state — it does NOT write localStorage.
    expect(localStorage.getItem('pm.activeProjectId')).toBeNull();
  });

  it('honors a persisted id when it is still in the fetched list', async () => {
    localStorage.setItem('pm.activeProjectId', 'p2');

    render(
      <ActiveWrapper>
        <ActiveProbe />
      </ActiveWrapper>,
    );

    await waitForActiveId('p2');
    // role comes from the active project — p2 is a viewer.
    expect(screen.getByTestId('active-role').textContent).toBe('viewer');
  });

  it('falls back to the first project when the persisted id is stale/absent', async () => {
    localStorage.setItem('pm.activeProjectId', 'gone');

    render(
      <ActiveWrapper>
        <ActiveProbe />
      </ActiveWrapper>,
    );

    await waitForActiveId('p1');
  });

  it('setProjectId persists the chosen id and updates state', async () => {
    render(
      <ActiveWrapper>
        <ActiveProbe />
      </ActiveWrapper>,
    );

    await waitForActiveId('p1');
    act(() => {
      screen.getByTestId('switch-p2').click();
    });

    expect(screen.getByTestId('active-id').textContent).toBe('p2');
    expect(screen.getByTestId('active-role').textContent).toBe('viewer');
    expect(localStorage.getItem('pm.activeProjectId')).toBe('p2');
  });

  it('useCanEdit is true for owner', async () => {
    render(
      <ActiveWrapper>
        <ActiveProbe />
      </ActiveWrapper>,
    );
    await waitForActiveId('p1');
    expect(screen.getByTestId('can-edit').textContent).toBe('true');
  });

  it('useCanEdit is true for editor', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([{ ...project1, role: 'editor' }]),
      ),
    );
    render(
      <ActiveWrapper>
        <ActiveProbe />
      </ActiveWrapper>,
    );
    await waitForActiveId('p1');
    expect(screen.getByTestId('can-edit').textContent).toBe('true');
  });

  it('useCanEdit is false for viewer', async () => {
    localStorage.setItem('pm.activeProjectId', 'p2'); // p2 is viewer
    render(
      <ActiveWrapper>
        <ActiveProbe />
      </ActiveWrapper>,
    );
    await waitForActiveId('p2');
    expect(screen.getByTestId('can-edit').textContent).toBe('false');
  });

  it('renders children even when the project list is empty (no gating here)', async () => {
    server.use(http.get('/api/projects', () => HttpResponse.json([])));
    render(
      <ActiveWrapper>
        <ActiveProbe />
      </ActiveWrapper>,
    );
    expect((await screen.findByTestId('active-id')).textContent).toBe('null');
    expect(screen.getByTestId('active-role').textContent).toBe('null');
    expect(screen.getByTestId('can-edit').textContent).toBe('false');
  });
});
