import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { HORIZONS, type Horizon } from '@productmap/shared';
import { toast } from 'sonner';
import { useFeatures, useUpdateFeature } from '@/lib/api';
import { BoardColumn } from '@/components/board/BoardColumn';
import { FeatureDetailPanel } from '@/components/board/FeatureDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export default function Board() {
  const { data: features, isLoading, isError, refetch } = useFeatures();
  const updateFeature = useUpdateFeature();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('feature');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const openFeature = useCallback(
    (id: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('feature', id);
        return next;
      });
    },
    [setSearchParams],
  );

  const closeFeature = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('feature');
      return next;
    });
  }, [setSearchParams]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !features) return;
    const feature = features.find((f) => f.id === active.id);
    if (!feature) return;
    // Dropped on a column (id = horizon) or on a card (resolve its column).
    let target: Horizon | undefined;
    if ((HORIZONS as readonly string[]).includes(String(over.id))) {
      target = over.id as Horizon;
    } else {
      target = features.find((f) => f.id === over.id)?.horizon;
    }
    if (!target || target === feature.horizon) return;
    updateFeature.mutate(
      { id: feature.id, horizon: target },
      {
        onError: () => {
          toast.error(`Couldn't move '${feature.title}' — restored`);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div
        data-testid="board-skeleton"
        className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-6 py-8 md:grid-cols-3"
      >
        {HORIZONS.map((h) => (
          <div key={h} className="space-y-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1280px] px-6 py-8">
        <div className="rounded-lg border bg-card p-6 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">Couldn't load the board.</p>
          <Button className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {HORIZONS.map((horizon) => (
            <BoardColumn
              key={horizon}
              horizon={horizon}
              features={(features ?? []).filter((f) => f.horizon === horizon)}
              onOpenFeature={openFeature}
            />
          ))}
        </div>
      </DndContext>
      <FeatureDetailPanel featureId={selectedId} onClose={closeFeature} />
    </div>
  );
}
