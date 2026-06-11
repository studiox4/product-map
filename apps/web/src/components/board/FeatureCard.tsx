import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FeatureWithDocs } from '@productmap/shared';
import { cn } from '@/lib/utils';
import { fetchJson, queryKeys } from '@/lib/api';
import { makeHoverPrefetch, prefersReducedMotion, SPRING_EASING } from '@/lib/delight';
import { morphStyle } from '@/lib/transitions';
import { StatusBadge } from '@/components/StatusBadge';
import { DocTypeChip } from '@/components/DocTypeChip';
import { VoteWidget } from '@/components/VoteWidget';

interface FeatureCardProps {
  feature: FeatureWithDocs;
  onOpen: (id: string) => void;
}

export function FeatureCard({ feature, onOpen }: FeatureCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: feature.id,
    // Spring-feel settle on drop: slight overshoot, transform-only.
    transition: prefersReducedMotion() ? null : { duration: 200, easing: SPRING_EASING },
  });
  const queryClient = useQueryClient();

  // Hover-prefetch the detail query so opening feels instant.
  const hoverPrefetch = useMemo(
    () =>
      makeHoverPrefetch(() => {
        void queryClient.prefetchQuery({
          queryKey: queryKeys.feature(feature.id),
          queryFn: () => fetchJson<FeatureWithDocs>(`/api/features/${feature.id}`),
        });
      }),
    [queryClient, feature.id],
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        ...morphStyle('feature', feature.id),
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
      onMouseEnter={hoverPrefetch.onMouseEnter}
      onMouseLeave={hoverPrefetch.onMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(feature.id);
        }
      }}
      className={cn(
        'cursor-grab rounded-xl border border-transparent bg-surface p-3 shadow-sm-card',
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
      <div className="mt-2">
        <VoteWidget featureId={feature.id} summary={feature} size="compact" />
      </div>
    </div>
  );
}
