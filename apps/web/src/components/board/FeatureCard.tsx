import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FeatureWithDocs } from '@productmap/shared';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import { DocTypeChip } from '@/components/DocTypeChip';

interface FeatureCardProps {
  feature: FeatureWithDocs;
  onOpen: (id: string) => void;
}

export function FeatureCard({ feature, onOpen }: FeatureCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: feature.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: isDragging
          ? `${CSS.Transform.toString(transform) ?? ''} rotate(1deg)`
          : CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={feature.title}
      onClick={() => onOpen(feature.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(feature.id);
        }
      }}
      className={cn(
        'cursor-grab rounded-xl border border-transparent bg-white p-3 shadow-[0_4px_14px_rgba(60,75,95,.08)]',
        'transition-[box-shadow,transform] duration-150 ease-out',
        'hover:-translate-y-px hover:shadow-card-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'active:cursor-grabbing',
        isDragging && 'opacity-50 shadow-card-hover',
      )}
    >
      <p className="text-sm font-medium leading-snug text-ink">{feature.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StatusBadge status={feature.status} />
        {feature.documents.map((doc) => (
          <DocTypeChip key={doc.id} type={doc.type} />
        ))}
      </div>
    </div>
  );
}
