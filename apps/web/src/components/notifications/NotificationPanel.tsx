import { Link } from 'react-router-dom';
import type { NotificationItem } from '@productmap/shared';
import { useNotificationList, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/lib/api';
import { appRoutes } from '@/lib/routes';

function summarize(n: NotificationItem): string {
  const who = n.actorName ?? 'Someone';
  switch (n.kind) {
    case 'mention': return `${who} mentioned you`;
    case 'reply': return `${who} replied in a thread`;
    case 'comment': return `${who} commented on your work`;
    case 'project_invite': return `${who} invited you to a project`;
    case 'idea_submitted': return 'New public idea submitted';
    case 'assigned': return `${who} assigned you to a feature`;
    case 'release_published': return `${who} shipped ${(n.payload?.name as string) ?? 'a release'}`;
    default: return 'New notification';
  }
}

/** Deep link to the notification's target using appRoutes builders. */
function hrefFor(n: NotificationItem): string {
  if (n.kind === 'idea_submitted') return appRoutes.inbox;
  if (n.documentId) return appRoutes.doc(n.documentId);
  if (n.featureId) return appRoutes.feature(n.featureId);
  return appRoutes.projectOverview(n.projectSlug);
}

export function NotificationPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { data, isLoading } = useNotificationList();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const items = data?.items ?? [];

  return (
    <div className="w-80 max-w-[90vw]">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">Notifications</span>
        <button
          type="button"
          className="text-xs text-muted-ink hover:text-ink"
          onClick={() => markAll.mutate()}
        >
          Mark all read
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-muted-ink">Loading…</p>}
        {!isLoading && items.length === 0 && (
          <p className="p-4 text-sm text-muted-ink">You're all caught up.</p>
        )}
        {items.map((n) => (
          <Link
            key={n.id}
            to={hrefFor(n)}
            onClick={() => { markRead.mutate(n.id); onNavigate?.(); }}
            className={`block px-3 py-2 text-sm hover:bg-surface/60 ${n.readAt ? 'opacity-60' : 'font-medium'}`}
          >
            {summarize(n)}
            <span className="block text-xs text-muted-ink">{new Date(n.createdAt).toLocaleString()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
