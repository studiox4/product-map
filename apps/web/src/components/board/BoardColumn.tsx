import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { HORIZON_COLORS, type Horizon, type FeatureWithDocs } from '@productmap/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FeatureCard } from '@/components/board/FeatureCard';
import { NewFeatureDialog } from '@/components/board/NewFeatureDialog';

const HORIZON_LABELS: Record<Horizon, string> = {
  now: 'Now',
  next: 'Next',
  later: 'Later',
};

interface BoardColumnProps {
  horizon: Horizon;
  features: FeatureWithDocs[];
  onOpenFeature: (id: string) => void;
  /** True while a drag hovers this column or any card inside it. */
  isDropTarget?: boolean;
  /** True briefly after a card drops here — pulses the header dot. */
  isDropPulse?: boolean;
  /** Column position for the first-mount staggered fade-up (40ms steps). */
  staggerIndex?: number;
}

export function BoardColumn({
  horizon,
  features,
  onOpenFeature,
  isDropTarget = false,
  isDropPulse = false,
  staggerIndex = 0,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: horizon });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${horizon}`}
      className={cn(
        'fade-up flex flex-col rounded-2xl bg-surface/50 transition-shadow duration-150 ease-out',
        (isOver || isDropTarget) && 'ring-2 ring-inset ring-[#dcebff]',
      )}
      style={{ animationDelay: `${staggerIndex * 40}ms` }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 rounded-full', isDropPulse && 'dot-pulse')}
            style={{ backgroundColor: HORIZON_COLORS[horizon].bar }}
          />
          {HORIZON_LABELS[horizon]}
        </h2>
        <span
          data-testid={`column-${horizon}-count`}
          className="rounded-full bg-wash px-2 py-0.5 text-xs font-medium text-muted-ink"
        >
          {features.length}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-3 pb-3">
        <SortableContext items={features.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {features.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-dash px-3 py-6 text-center text-sm text-muted-ink">
              Nothing here yet
            </p>
          ) : (
            features.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} onOpen={onOpenFeature} />
            ))
          )}
        </SortableContext>
        <Button
          variant="ghost"
          className="justify-start rounded-full text-muted-ink hover:bg-wash"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add feature
        </Button>
      </div>
      <NewFeatureDialog horizon={horizon} open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  );
}
