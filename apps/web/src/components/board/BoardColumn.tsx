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
}

export function BoardColumn({ horizon, features, onOpenFeature }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: horizon });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${horizon}`}
      className={cn(
        'flex flex-col rounded-lg border border-t-4 bg-card shadow-sm transition-colors',
        HORIZON_COLORS[horizon].header,
        isOver && 'ring-2 ring-ring',
      )}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">{HORIZON_LABELS[horizon]}</h2>
        <span
          data-testid={`column-${horizon}-count`}
          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {features.length}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-3 pb-3">
        <SortableContext items={features.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {features.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
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
          className="justify-start text-muted-foreground"
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
