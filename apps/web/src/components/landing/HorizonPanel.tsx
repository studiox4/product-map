import { Link, useNavigate } from 'react-router-dom';
import { HORIZON_COLORS, type FeatureWithDocs, type Horizon } from '@productmap/shared';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';

const TOP_N = 3;

export function HorizonPanel({
  horizon,
  features,
}: {
  horizon: Horizon;
  features: FeatureWithDocs[];
}) {
  const navigate = useNavigate();
  const sorted = [...features].sort((a, b) => a.sortOrder - b.sortOrder);
  const top = sorted.slice(0, TOP_N);
  const moreCount = sorted.length - top.length;

  return (
    <section
      className={cn(
        'flex flex-col rounded-lg border border-t-2 bg-card shadow-sm',
        HORIZON_COLORS[horizon].header,
      )}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <h2 className="text-sm font-semibold">{HORIZON_LABELS[horizon]}</h2>
        <span className="text-xs text-muted-foreground">{sorted.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2 pb-3">
        {top.length === 0 && (
          <p className="px-2 py-2 text-sm text-muted-foreground">Nothing here yet</p>
        )}
        {top.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => navigate(`/board?feature=${f.id}`)}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{f.title}</span>
            <StatusBadge status={f.status} />
          </button>
        ))}
        {moreCount > 0 && (
          <Link
            to="/board"
            className="rounded-md px-2 py-1 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{moreCount} more
          </Link>
        )}
      </div>
    </section>
  );
}

export default HorizonPanel;
