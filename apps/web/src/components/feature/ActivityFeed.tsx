import { formatDistanceToNow } from 'date-fns';
import type { ActivityItem } from '@productmap/shared';
import { useActivity } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import { STATUS_LABELS } from '@/components/StatusBadge';

function payloadString(payload: ActivityItem['payload'], key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
}

function label<T extends string>(map: Record<string, string>, value: T | null): string | null {
  return value ? (map[value] ?? value) : null;
}

/** Humanized verb phrase for an activity item, e.g. "moved this to Next". */
export function activityVerb(item: ActivityItem): string {
  const to = payloadString(item.payload, 'to');
  switch (item.kind) {
    case 'feature_created':
      return 'created this feature';
    case 'horizon_changed':
      return `moved this to ${label(HORIZON_LABELS, to) ?? 'a new horizon'}`;
    case 'status_changed':
      return `changed status to ${label(STATUS_LABELS, to) ?? 'a new status'}`;
    case 'dates_changed':
      return 'updated the dates';
    case 'description_edited':
      return 'edited the description';
    case 'doc_created':
      return to ? `created doc “${to}”` : 'created a doc';
    case 'doc_status_changed':
      return `marked a doc as ${label(STATUS_LABELS, to) ?? 'a new status'}`;
    case 'doc_renamed':
      return to ? `renamed a doc to “${to}”` : 'renamed a doc';
    case 'comment_added':
      return payloadString(item.payload, 'documentId') ? 'commented on a doc' : 'commented';
    case 'comment_resolved':
      return item.payload?.['resolved'] === false
        ? 'reopened a comment thread'
        : 'resolved a comment thread';
    // Dream-tier kinds (D1–D9).
    case 'idea_promoted':
      return 'promoted this from the idea inbox';
    case 'decision_logged': {
      const title = payloadString(item.payload, 'title');
      return title ? `logged decision “${title}”` : 'logged a decision';
    }
    case 'dependency_added':
      return 'added a dependency';
    case 'dependency_removed':
      return 'removed a dependency';
    case 'release_shipped': {
      const name = payloadString(item.payload, 'releaseName');
      return name ? `shipped this in ${name}` : 'shipped this in a release';
    }
    case 'size_changed':
      return to ? `sized this ${to.toUpperCase()}` : 'changed the size';
    default:
      return 'updated this feature';
  }
}

/** Newest-first feed of who did what, with avatar dots and relative times. */
export function ActivityFeed({ featureId }: { featureId: string }) {
  const { data: items, isLoading } = useActivity(featureId);

  return (
    <section aria-label="Activity">
      <h2 className="font-display text-sm font-semibold text-ink">Activity</h2>
      {isLoading ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : !items || items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-line-dash px-3 py-4 text-center text-sm text-muted-ink">
          No activity yet
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5 text-sm text-body-ink">
              <UserAvatar
                user={{ name: item.actorName, color: item.actorColor }}
                size="sm"
                className="mt-0.5"
              />
              <p>
                <span className="font-medium text-ink">{item.actorName}</span>{' '}
                {activityVerb(item)}{' '}
                <span className="whitespace-nowrap text-xs text-muted-ink">
                  · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ActivityFeed;
