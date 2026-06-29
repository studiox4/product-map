import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const markReadMutate = vi.fn();
const markAllMutate = vi.fn();

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  useNotificationList: () => ({
    data: {
      items: [
        {
          id: 'n1',
          kind: 'mention',
          actorName: 'Alice',
          documentId: 'doc-123',
          featureId: null,
          projectSlug: 'my-project',
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'n2',
          kind: 'comment',
          actorName: 'Bob',
          documentId: null,
          featureId: 'feat-456',
          projectSlug: 'my-project',
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'n3',
          kind: 'project_invite',
          actorName: 'Carol',
          documentId: null,
          featureId: null,
          projectSlug: 'other-project',
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'n4',
          kind: 'assigned',
          actorName: 'Dana',
          documentId: null,
          featureId: 'feat-789',
          projectSlug: 'my-project',
          payload: null,
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'n5',
          kind: 'release_published',
          actorName: 'Eli',
          documentId: null,
          featureId: null,
          projectSlug: 'my-project',
          payload: { releaseId: 'r1', name: 'v2.0' },
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
    },
    isLoading: false,
  }),
  useMarkNotificationRead: () => ({ mutate: markReadMutate }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllMutate }),
}));

import { NotificationPanel } from './NotificationPanel';

function renderPanel(onNavigate?: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationPanel onNavigate={onNavigate} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, panel: within(result.container) };
}

describe('NotificationPanel', () => {
  it('links documentId item to doc route', () => {
    const { panel } = renderPanel();
    const mentionLink = panel.getByText(/alice mentioned you/i).closest('a');
    expect(mentionLink?.getAttribute('href')).toContain('/docs/');
    expect(mentionLink?.getAttribute('href')).toContain('doc-123');
  });

  it('links featureId-only item to feature route', () => {
    const { panel } = renderPanel();
    const commentLink = panel.getByText(/bob commented/i).closest('a');
    expect(commentLink?.getAttribute('href')).toContain('/features/');
    expect(commentLink?.getAttribute('href')).toContain('feat-456');
  });

  it('links project_invite (no doc/feature) to project overview route', () => {
    const { panel } = renderPanel();
    const inviteLink = panel.getByText(/carol invited you/i).closest('a');
    expect(inviteLink?.getAttribute('href')).toContain('/p/');
    expect(inviteLink?.getAttribute('href')).toContain('other-project');
  });

  it('clicking a row calls markRead.mutate with the notification id and fires onNavigate', async () => {
    const onNavigate = vi.fn();
    const { panel } = renderPanel(onNavigate);
    const mentionLink = panel.getByText(/alice mentioned you/i).closest('a')!;
    await userEvent.click(mentionLink);
    expect(markReadMutate).toHaveBeenCalledWith('n1');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('clicking "Mark all read" calls markAll.mutate', async () => {
    const { panel } = renderPanel();
    const markAllBtn = panel.getByText(/mark all read/i);
    await userEvent.click(markAllBtn);
    expect(markAllMutate).toHaveBeenCalled();
  });

  it('mention item shows mention-appropriate text', () => {
    const { panel } = renderPanel();
    expect(panel.getByText(/alice mentioned you/i)).toBeTruthy();
  });

  it('assigned item links to the feature', () => {
    const { panel } = renderPanel();
    const link = panel.getByText(/dana assigned you/i).closest('a');
    expect(link?.getAttribute('href')).toContain('/features/');
    expect(link?.getAttribute('href')).toContain('feat-789');
  });

  it('release_published item shows the release name', () => {
    const { panel } = renderPanel();
    expect(panel.getByText(/eli shipped v2\.0/i)).toBeTruthy();
  });
});
