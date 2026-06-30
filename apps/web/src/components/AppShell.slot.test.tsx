import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { slotRegistry } from '@productmap/sdk';

// AppShell's data hooks fetch — mock them so the shell renders in isolation.
vi.mock('@/lib/project', () => ({
  useActiveProject: () => ({ projects: [{ id: 'p1', slug: 'p1', name: 'P1' }], projectId: 'p1' }),
  useProjectId: () => 'p1',
}));
vi.mock('@/lib/api', () => ({
  useAiStatus: () => ({ data: { enabled: false } }),
  useUnreadCount: () => ({ data: { count: 0 } }),
}));

import AppShell from './AppShell';

function renderShell() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/app']}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell nav.analytics slot', () => {
  it('renders the nav.analytics slot fill when registered', async () => {
    slotRegistry.register({
      id: 'nav.analytics',
      loader: async () => ({ default: () => <a>Analytics</a> }),
    });
    renderShell();
    await waitFor(() => expect(screen.getByText('Analytics')).toBeTruthy());
  });
});
