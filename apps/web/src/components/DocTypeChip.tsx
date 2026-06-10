import { DOC_TYPE_LABELS, type DocType } from '@productmap/shared';
import { cn } from '@/lib/utils';

export function DocTypeChip({ type, className }: { type: DocType; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full bg-[#edf1f7] px-2 py-0.5 text-xs font-medium text-[#46556a]',
        className,
      )}
    >
      {DOC_TYPE_LABELS[type]}
    </span>
  );
}

export default DocTypeChip;
