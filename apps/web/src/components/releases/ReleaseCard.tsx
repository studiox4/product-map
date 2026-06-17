import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarDays, Package } from 'lucide-react';
import type { ReleaseListItem } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { ReleaseStatusSelect } from './ReleaseStatusSelect';

/** One release row on /releases: name, target date, feature count, status select. */
export function ReleaseCard({ release }: { release: ReleaseListItem }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-transparent bg-surface px-5 py-4 shadow-card transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover">
      <div className="min-w-0 flex-1">
        <Link
          to={appRoutes.release(release.id)}
          className="block truncate font-display text-base font-semibold text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {release.name}
        </Link>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-ink">
          <span className="inline-flex items-center gap-1">
            <Package className="h-3.5 w-3.5" aria-hidden />
            {release.featureCount} feature{release.featureCount === 1 ? '' : 's'}
          </span>
          {release.targetDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {format(new Date(`${release.targetDate}T00:00:00`), 'MMM d, yyyy')}
            </span>
          ) : null}
        </div>
      </div>
      <ReleaseStatusSelect release={release} />
    </div>
  );
}

export default ReleaseCard;
