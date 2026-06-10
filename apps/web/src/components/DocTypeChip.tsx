import { DOC_TYPE_LABELS, type DocType } from '@productmap/shared';
import { cn } from '@/lib/utils';

export function DocTypeChip({ type, className }: { type: DocType; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-xs font-medium text-slate-600',
        className,
      )}
    >
      {DOC_TYPE_LABELS[type]}
    </span>
  );
}

export default DocTypeChip;
