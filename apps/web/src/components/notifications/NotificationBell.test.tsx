import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
  Toaster: () => null,
}));

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

// Mutable count the toast-guard test can control
let mockCount = 3;

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  useUnreadCount: () => ({ data: { count: mockCount } }),
  useNotificationList: () => ({ data: { items: [], nextCursor: null }, isLoading: false }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
}));

import { NotificationBell } from './NotificationBell';
import { toast } from 'sonner';

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
    mockCount = 3;
    renderBell();
    expect(screen.getByLabelText(/notifications/i)).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('does NOT toast on first render and DOES toast when count increases', () => {
    mockCount = 0;
    vi.clearAllMocks();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ count }: { count: number }) => {
      mockCount = count;
      return (
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <NotificationBell />
          </MemoryRouter>
        </QueryClientProvider>
      );
    };

    // First render with count = 0: ref starts at null, so no toast
    const { rerender } = render(<Wrapper count={0} />);
    expect(toast).not.toHaveBeenCalled();

    // Rerender with higher count: prev.current is now 0, count is 3 → toast fires
    rerender(<Wrapper count={3} />);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
