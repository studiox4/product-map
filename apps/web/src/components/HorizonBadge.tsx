import { HORIZON_COLORS, type Horizon } from '@productmap/shared';
import { cn } from '@productmap/ui/lib/utils';

const HORIZON_LABELS: Record<Horizon, string> = {
  now: 'Now',
  next: 'Next',
  later: 'Later',
};

export function HorizonBadge({ horizon, className }: { horizon: Horizon; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        HORIZON_COLORS[horizon].badge,
        className,
      )}
    >
      {HORIZON_LABELS[horizon]}
    </span>
  );
}

export { HORIZON_LABELS };
export default HorizonBadge;
