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
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
        'cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'active:cursor-grabbing',
        isDragging && 'opacity-50',
      )}
    >
      <p className="text-sm font-medium leading-snug">{feature.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StatusBadge status={feature.status} />
        {feature.documents.map((doc) => (
          <DocTypeChip key={doc.id} type={doc.type} />
        ))}
      </div>
    </div>
  );
}
