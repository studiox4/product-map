import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarDays, Package, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { useShipRelease, type ReleaseListItem } from '@/lib/api';
import { confettiBurst } from '@/lib/delight';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Sage when shipped, action-soft while planned — mirrors StatusBadge tones. */
export function ReleaseStatusPill({ status }: { status: ReleaseListItem['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        status === 'shipped' ? 'bg-sage-soft text-sage' : 'bg-action-soft text-action',
      )}
    >
      {status}
    </span>
  );
}

/** One release row on /releases: name, status, target date, feature count, ship. */
export function ReleaseCard({ release }: { release: ReleaseListItem }) {
  const shipRelease = useShipRelease();

  const ship = () => {
    if (shipRelease.isPending) return;
    shipRelease.mutate(release.id, {
      onSuccess: () => {
        confettiBurst();
        toast.success(`Shipped ${release.name} 🎉`);
      },
      onError: () => toast.error(`Couldn't ship '${release.name}'`),
    });
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-transparent bg-surface px-5 py-4 shadow-card transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover">
      <div className="min-w-0 flex-1">
        <Link
          to={`/releases/${release.id}`}
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
      <ReleaseStatusPill status={release.status} />
      {release.status === 'planned' ? (
        <Button
          size="sm"
          className="rounded-full"
          onClick={ship}
          disabled={shipRelease.isPending}
          aria-label={`Ship ${release.name}`}
        >
          <Rocket className="h-3.5 w-3.5" aria-hidden />
          Ship
        </Button>
      ) : null}
    </div>
  );
}

export default ReleaseCard;
