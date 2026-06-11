import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { HORIZONS, type Horizon } from '@productmap/shared';
import { toast } from 'sonner';
import { useFeatures, useUpdateFeature } from '@/lib/api';
import { BoardColumn } from '@/components/board/BoardColumn';
import { FeatureDetailPanel } from '@/components/board/FeatureDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { navigateWithTransition } from '@/lib/transitions';

export const BOARD_SORT_KEY = 'pmBoardSort';
type BoardSort = 'manual' | 'score';

function getStoredSort(): BoardSort {
  try {
    return localStorage.getItem(BOARD_SORT_KEY) === 'score' ? 'score' : 'manual';
  } catch {
    return 'manual';
  }
}

export default function Board() {
  const { data: features, isLoading, isError, refetch } = useFeatures();
  const updateFeature = useUpdateFeature();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('feature');
  const [sort, setSort] = useState<BoardSort>(getStoredSort);
  const [dragOverHorizon, setDragOverHorizon] = useState<Horizon | null>(null);

  const changeSort = (next: BoardSort) => {
    setSort(next);
    try {
      localStorage.setItem(BOARD_SORT_KEY, next);
    } catch {
      // private mode etc. — sort still applies for this session
    }
  };

  const columnFeatures = (horizon: Horizon) => {
    const list = (features ?? []).filter((f) => f.horizon === horizon);
    if (sort === 'score') {
      return [...list].sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder);
    }
    return list;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const openFeature = useCallback(
    (id: string) => {
      navigateWithTransition(() => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('feature', id);
          return next;
        });
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

  // Over a column (id = horizon) or over a card (resolve its column).
  const resolveHorizon = (overId: string | number | undefined): Horizon | null => {
    if (overId == null) return null;
    if ((HORIZONS as readonly string[]).includes(String(overId))) return overId as Horizon;
    return features?.find((f) => f.id === overId)?.horizon ?? null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    setDragOverHorizon(resolveHorizon(event.over?.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragOverHorizon(null);
    const { active, over } = event;
    if (!over || !features) return;
    const feature = features.find((f) => f.id === active.id);
    if (!feature) return;
    const target = resolveHorizon(over.id);
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
          <div key={h} className="space-y-3 rounded-2xl bg-surface/50 p-3">
            <Skeleton className="h-8 w-1/2 rounded-full bg-surface" />
            <Skeleton className="h-24 w-full rounded-xl bg-surface shadow-sm-card" />
            <Skeleton className="h-24 w-full rounded-xl bg-surface shadow-sm-card" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1280px] px-6 py-8">
        <div className="rounded-2xl border border-transparent bg-surface p-8 text-center shadow-card">
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
      <div className="mb-4 flex justify-end">
        <div
          role="group"
          aria-label="Board order"
          className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-card"
        >
          <span className="pl-3 pr-1 text-xs font-medium text-muted-ink">Order ▾</span>
          {(['manual', 'score'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sort === option}
              onClick={() => changeSort(option)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize',
                'transition-colors duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                sort === option
                  ? 'bg-action-soft text-action'
                  : 'text-muted-ink hover:bg-wash',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <DndContext
        sensors={sensors}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragOverHorizon(null)}
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {HORIZONS.map((horizon) => (
            <BoardColumn
              key={horizon}
              horizon={horizon}
              features={columnFeatures(horizon)}
              onOpenFeature={openFeature}
              isDropTarget={dragOverHorizon === horizon}
            />
          ))}
        </div>
      </DndContext>
      <FeatureDetailPanel featureId={selectedId} onClose={closeFeature} />
    </div>
  );
}
