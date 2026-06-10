import type { DocStatus, FeatureStatus } from '@productmap/shared';
import { cn } from '@/lib/utils';

type AnyStatus = FeatureStatus | DocStatus;

const STATUS_STYLES: Record<AnyStatus, string> = {
  // feature statuses
  idea: 'bg-[#edf1f7] text-[#46556a]',
  planned: 'bg-[#dcebff] text-[#2b557e]',
  in_progress: 'bg-[#fdf0e3] text-[#9a6428]',
  shipped: 'bg-[#e4f0e4] text-[#3c6b46]',
  // doc statuses
  draft: 'bg-[#f0f3f7] text-[#7c8794]',
  in_review: 'bg-[#fdf0e3] text-[#9a6428]',
  final: 'bg-[#e4f0e4] text-[#3c6b46]',
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
