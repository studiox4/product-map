import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useArchivedFeatures, useFeatures, usePurgeFeature, useRestoreFeature, useUpdateFeature } from '@/lib/api';
import { useCanEdit } from '@/lib/project';
import { BoardColumn } from '@/components/board/BoardColumn';
import { FeatureDetailPanel } from '@/components/board/FeatureDetailPanel';
import { Skeleton } from '@productmap/ui';
import { Button } from '@productmap/ui';
import { cn } from '@productmap/ui/lib/utils';
import { navigateWithTransition } from '@/lib/transitions';
import { hasOpenOverlay, isEditableTarget } from '@/components/command/useGlobalShortcuts';

export const BOARD_SORT_KEY = 'pmBoardSort';
type BoardSort = 'manual' | 'score';
type BoardView = 'active' | 'archived';

function ArchivedView() {
  const { data: archived, isLoading } = useArchivedFeatures();
  const restore = useRestoreFeature();
  const purge = usePurgeFeature();

  if (isLoading) {
    return (
      <div className="space-y-3 pt-4">
        <div className="h-16 w-full animate-pulse rounded-xl bg-surface" />
        <div className="h-16 w-full animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  if (!archived || archived.length === 0) {
    return (
      <div className="rounded-2xl border border-transparent bg-surface p-8 text-center shadow-card">
        <p className="text-sm text-muted-ink">No archived features.</p>
      </div>
    );
  }

  return (
    <div data-testid="archived-features-list" className="space-y-2 pt-4">
      {archived.map((feature) => (
        <div
          key={feature.id}
          data-testid={`archived-feature-${feature.id}`}
          className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 shadow-sm-card"
        >
          <span className="text-sm font-medium text-ink">{feature.title}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={restore.isPending}
              onClick={() => {
                restore.mutate(feature.id, {
                  onError: () => toast.error(`Couldn't restore '${feature.title}'`),
                  onSuccess: () => toast.success(`'${feature.title}' restored`),
                });
              }}
            >
              Restore
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-full"
              disabled={purge.isPending}
              onClick={() => {
                if (window.confirm(`Permanently delete '${feature.title}'? This cannot be undone.`)) {
                  purge.mutate(feature.id, {
                    onError: () => toast.error(`Couldn't delete '${feature.title}'`),
                    onSuccess: () => toast.success(`'${feature.title}' permanently deleted`),
                  });
                }
              }}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function getStoredSort(): BoardSort {
  try {
    return localStorage.getItem(BOARD_SORT_KEY) === 'score' ? 'score' : 'manual';
  } catch {
    return 'manual';
  }
}

export default function Board() {
  const { data: features, isLoading, isError, refetch } = useFeatures();
  const canEdit = useCanEdit();
  const updateFeature = useUpdateFeature();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('feature');
  const [sort, setSort] = useState<BoardSort>(getStoredSort);
  const [view, setView] = useState<BoardView>('active');
  const [dragOverHorizon, setDragOverHorizon] = useState<Horizon | null>(null);
  // Destination column header dot pulses briefly after a drop.
  const [droppedHorizon, setDroppedHorizon] = useState<Horizon | null>(null);
  const dropPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pulseDrop = (horizon: Horizon) => {
    if (dropPulseTimer.current) clearTimeout(dropPulseTimer.current);
    setDroppedHorizon(horizon);
    dropPulseTimer.current = setTimeout(() => setDroppedHorizon(null), 500);
  };

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

  // j/k keyboard selection across the three columns (Now → Next → Later top
  // to bottom), Enter opens the peek — quiet while typing or a dialog is open.
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const keyNavRef = useRef({ ordered: [] as string[], activeCardId, openFeature });
  keyNavRef.current = {
    ordered: HORIZONS.flatMap((h) => columnFeatures(h).map((f) => f.id)),
    activeCardId,
    openFeature,
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target) || hasOpenOverlay()) return;
      const { ordered, activeCardId: active, openFeature: open } = keyNavRef.current;
      if (ordered.length === 0) return;
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const index = active ? ordered.indexOf(active) : -1;
        const next =
          e.key === 'j'
            ? Math.min(index + 1, ordered.length - 1)
            : Math.max(index - 1, 0);
        setActiveCardId(ordered[next]);
      } else if (e.key === 'Enter' && active && ordered.includes(active)) {
        e.preventDefault();
        open(active);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleDragOver = (event: DragOverEvent) => {
    setDragOverHorizon(resolveHorizon(event.over?.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragOverHorizon(null);
    // Viewers can't move cards — cards are already non-draggable (useSortable
    // disabled), but guard the handler too so no stray drag mutates features.
    if (!canEdit) return;
    const { active, over } = event;
    if (!over || !features) return;
    const feature = features.find((f) => f.id === active.id);
    if (!feature) return;
    const target = resolveHorizon(over.id);
    if (!target) return;
    pulseDrop(target);
    if (target === feature.horizon) return;
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
      <div className="mb-4 flex items-center justify-between">
        <div
          role="group"
          aria-label="Board view"
          className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-card"
        >
          {(['active', 'archived'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize',
                'transition-colors duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === v
                  ? 'bg-action-soft text-action'
                  : 'text-muted-ink hover:bg-wash',
              )}
            >
              {v === 'active' ? 'Active' : 'Archived'}
            </button>
          ))}
        </div>
        {view === 'active' && (
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
        )}
      </div>
      {view === 'archived' ? (
        <ArchivedView />
      ) : (
        <>
          <DndContext
            sensors={sensors}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDragOverHorizon(null)}
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {HORIZONS.map((horizon, i) => (
                <BoardColumn
                  key={horizon}
                  horizon={horizon}
                  features={columnFeatures(horizon)}
                  onOpenFeature={openFeature}
                  isDropTarget={dragOverHorizon === horizon}
                  isDropPulse={droppedHorizon === horizon}
                  staggerIndex={i}
                  activeCardId={activeCardId}
                />
              ))}
            </div>
          </DndContext>
          <FeatureDetailPanel featureId={selectedId} onClose={closeFeature} />
        </>
      )}
    </div>
  );
}
