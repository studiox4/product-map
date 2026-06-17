import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import type { DocumentListItem, FeatureWithDocs } from '@productmap/shared';
import CommandPalette from './CommandPalette';
import ShortcutsOverlay from './ShortcutsOverlay';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { RECENTS_KEY, getRecents, recordRecent } from './recents';
import { ProjectProvider } from '@/lib/project';

const TEST_PROJECT_ID = 'p1';

// Node's experimental webstorage shadows jsdom's localStorage in this env
// (methods are undefined) — install a working in-memory Storage.
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

// jsdom polyfills for Radix + cmdk
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

const now = '2026-06-09T00:00:00.000Z';

function makeFeature(partial: Partial<FeatureWithDocs> & { id: string; title: string }): FeatureWithDocs {
  return {
    projectId: 'p1',
    score: 0,
    boosts: 0,
    cools: 0,
    myVote: 0,
    horizon: 'now',
    status: 'in_progress',
    startDate: null,
    endDate: null,
    sortOrder: 0,
    descriptionMd: '',
    size: null,
    riskMd: '',
    objectiveId: null,
    releaseId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    documents: [],
    ...partial,
  };
}

const features: FeatureWithDocs[] = [
  makeFeature({ id: 'f1', title: 'Rich markdown editor' }),
  makeFeature({ id: 'f2', title: 'Gantt roadmap', horizon: 'next' }),
];

const docs: DocumentListItem[] = [
  {
    id: 'd1',
    featureId: 'f1',
    featureTitle: 'Rich markdown editor',
    featureHorizon: 'now',
    wordCount: 0,
    type: 'prd',
    title: 'Editor PRD',
    status: 'draft',
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  },
];

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([{ id: TEST_PROJECT_ID, name: 'Test Project', vision: '', aboutMd: '', role: 'owner' }]),
  ),
  http.get(`/api/projects/${TEST_PROJECT_ID}/features`, () => HttpResponse.json(features)),
  http.get(`/api/projects/${TEST_PROJECT_ID}/documents`, () => HttpResponse.json(docs)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => window.localStorage.removeItem(RECENTS_KEY));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

/** Mimics the AppShell wiring: global shortcuts + palette + shortcuts overlay. */
function Harness() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useGlobalShortcuts({
    onTogglePalette: () => setPaletteOpen((o) => !o),
    onToggleShortcuts: () => setShortcutsOpen((o) => !o),
  });
  return (
    <>
      <input aria-label="decoy text field" />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <Routes>
        <Route path="/" element={<div>home page</div>} />
        <Route path="/features/:id" element={<div>feature page</div>} />
        <Route path="/docs/:id" element={<div>doc page</div>} />
      </Routes>
    </>
  );
}

function renderHarness(entries: string[] = ['/']) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider>
        <MemoryRouter initialEntries={entries}>
          <Harness />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

async function openPalette() {
  await user().keyboard('{Meta>}k{/Meta}');
  return await screen.findByPlaceholderText(/type a command or search/i);
}

describe('CommandPalette', () => {
  it('opens on ⌘K and closes on a second ⌘K', async () => {
    renderHarness();
    expect(screen.queryByPlaceholderText(/type a command/i)).toBeNull();
    await openPalette();
    expect(await screen.findByText('Overview')).toBeTruthy();
    await user().keyboard('{Meta>}k{/Meta}');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/type a command/i)).toBeNull();
    });
  });

  it('fuzzy-filters features and docs', async () => {
    renderHarness();
    const input = await openPalette();
    await screen.findByText(/Feature: Gantt roadmap/);
    await user().type(input, 'gantt');
    await waitFor(() => {
      expect(screen.getByText(/Feature: Gantt roadmap/)).toBeTruthy();
      expect(screen.queryByText(/Feature: Rich markdown editor/)).toBeNull();
    });
    await user().clear(input);
    await user().type(input, 'prd');
    await waitFor(() => {
      expect(screen.getByText(/Doc: Editor PRD — PRD/)).toBeTruthy();
      expect(screen.queryByText(/Feature: Gantt roadmap/)).toBeNull();
    });
  });

  it('creates a feature in a horizon with an inline title and navigates to it', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post(`/api/projects/${TEST_PROJECT_ID}/features`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeFeature({ id: 'f-new', title: String(posted.title), horizon: 'later' }),
          { status: 201 },
        );
      }),
    );
    renderHarness();
    const input = await openPalette();
    await user().type(input, 'new feature in later');
    await user().click(await screen.findByText(/New feature in Later…/));
    // sub-page: input becomes the title field
    const titleInput = await screen.findByPlaceholderText(/created in Later/i);
    await user().type(titleInput, 'Palette-born feature');
    await user().keyboard('{Enter}');
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ title: 'Palette-born feature', horizon: 'later' });
    expect(await screen.findByText('feature page')).toBeTruthy();
    // palette closed after creating
    expect(screen.queryByPlaceholderText(/created in Later/i)).toBeNull();
  });

  it('shows recents in order, most recent first, capped at 5', async () => {
    recordRecent({ kind: 'feature', id: 'f1', title: 'Rich markdown editor' });
    recordRecent({ kind: 'doc', id: 'd1', title: 'Editor PRD' });
    renderHarness();
    await openPalette();
    const group = (await screen.findByText('Recents')).closest('[cmdk-group]') as HTMLElement;
    const items = within(group).getAllByRole('option');
    expect(items[0].textContent).toContain('Editor PRD');
    expect(items[1].textContent).toContain('Rich markdown editor');
  });

  it("'?' opens the shortcuts overlay, but not while typing in an input", async () => {
    renderHarness();
    const decoy = await screen.findByLabelText('decoy text field');
    await user().type(decoy, '?');
    expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).toBeNull();
    (decoy as HTMLInputElement).blur();
    await user().keyboard('?');
    expect(await screen.findByRole('dialog', { name: /keyboard shortcuts/i })).toBeTruthy();
  });
});

describe('recents store', () => {
  it('dedupes by kind+id and caps at 5, most recent first', () => {
    for (let i = 1; i <= 6; i++) {
      recordRecent({ kind: 'feature', id: `f${i}`, title: `Feature ${i}` });
    }
    recordRecent({ kind: 'feature', id: 'f4', title: 'Feature 4' });
    const recents = getRecents();
    expect(recents).toHaveLength(5);
    expect(recents.map((r) => r.id)).toEqual(['f4', 'f6', 'f5', 'f3', 'f2']);
  });

  it('survives malformed localStorage', () => {
    window.localStorage.setItem(RECENTS_KEY, 'not-json{');
    expect(getRecents()).toEqual([]);
  });
});
