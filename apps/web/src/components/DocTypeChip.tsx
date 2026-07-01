import { DOC_TYPE_COLORS, DOC_TYPE_LABELS, type DocType } from '@productmap/shared';
import { cn } from '@productmap/ui/lib/utils';

export function DocTypeChip({ type, className }: { type: DocType; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        DOC_TYPE_COLORS[type].chip,
        className,
      )}
    >
      {DOC_TYPE_LABELS[type]}
    </span>
  );
}

export default DocTypeChip;
