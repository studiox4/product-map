import {
  DOC_STATUS_COLORS,
  type DocStatus,
  type FeatureStatus,
} from '@productmap/shared';
import { cn } from '@productmap/ui';

type AnyStatus = FeatureStatus | DocStatus;

const STATUS_STYLES: Record<AnyStatus, string> = {
  // feature statuses
  idea: 'bg-wash text-body-ink',
  planned: 'bg-action-soft text-action',
  in_progress: 'bg-warm-soft text-warm',
  shipped: 'bg-sage-soft text-sage',
  // doc statuses — single shared source (@productmap/shared)
  ...DOC_STATUS_COLORS,
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
