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
          <div key={h} className="space-y-3 rounded-2xl bg-white/50 p-3">
            <Skeleton className="h-8 w-1/2 rounded-full bg-white" />
            <Skeleton className="h-24 w-full rounded-xl bg-white shadow-[0_4px_14px_rgba(60,75,95,.08)]" />
            <Skeleton className="h-24 w-full rounded-xl bg-white shadow-[0_4px_14px_rgba(60,75,95,.08)]" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1280px] px-6 py-8">
        <div className="rounded-2xl border border-transparent bg-white p-8 text-center shadow-card">
          <p className="text-sm text-muted-ink">Couldn't load the board.</p>
          <Button className="mt-4 rounded-full" onClick={() => refetch()}>
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
