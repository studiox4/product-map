import type { DocStatus, FeatureStatus } from '@productmap/shared';
import { cn } from '@/lib/utils';

type AnyStatus = FeatureStatus | DocStatus;

const STATUS_STYLES: Record<AnyStatus, string> = {
  // feature statuses
  idea: 'bg-slate-100 text-slate-700',
  planned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  shipped: 'bg-green-100 text-green-800',
  // doc statuses
  draft: 'border border-slate-300 text-slate-600',
  in_review: 'bg-amber-100 text-amber-800',
  final: 'bg-green-100 text-green-800',
};

const STATUS_LABELS: Record<AnyStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  draft: 'Draft',
  in_review: 'In review',
  final: 'Final',
};

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export { STATUS_LABELS };
export default StatusBadge;
