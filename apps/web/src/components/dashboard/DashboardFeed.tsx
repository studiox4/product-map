import { formatDistanceToNow } from 'date-fns';
import type { DashboardActivityItem } from '@productmap/shared';
import { activityVerb } from '@/components/feature/ActivityFeed';

export default function DashboardFeed({ items }: { items: DashboardActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="feed-heading" className="space-y-3">
      <h2 id="feed-heading" className="font-display text-lg font-semibold text-ink">
        Recent activity
      </h2>
      <ul className="space-y-2.5">
        {items.slice(0, 30).map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 text-sm">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.actorColor }}
              aria-hidden
            />
            <p className="text-muted-ink">
              <span className="font-medium text-ink">{item.actorName}</span> {activityVerb(item)}{' '}
              <span className="text-ink">{item.featureTitle}</span>
              <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs"> {item.projectSlug}</span>
              <span className="text-muted-ink"> · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
