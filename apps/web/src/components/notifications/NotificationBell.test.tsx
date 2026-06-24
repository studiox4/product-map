import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// jsdom polyfills for Radix components
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

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  useUnreadCount: () => ({ data: { count: 3 } }),
  useNotificationList: () => ({ data: { items: [], nextCursor: null }, isLoading: false }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
}));

import { NotificationBell } from './NotificationBell';

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  it('shows the unread count badge', () => {
    renderBell();
    expect(screen.getByLabelText(/notifications/i)).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
