import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { Feature, FeatureWithDocs } from '@productmap/shared';
import {
  isCycleError,
  useDependencies,
  useFeatures,
  useSetDependencies,
} from '@/lib/api';
import { useCanEdit } from '@/lib/project';
import { Button, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@productmap/ui';
import { STATUS_LABELS } from '@/components/StatusBadge';
import { appRoutes } from '@/lib/routes';

const STATUS_DOT_CLASSES: Record<Feature['status'], string> = {
  idea: 'bg-muted-ink',
  planned: 'bg-action',
  in_progress: 'bg-warm',
  shipped: 'bg-sage',
};

function StatusDot({ status }: { status: Feature['status'] }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    />
  );
}

/**
 * Right-rail Dependencies card (D4): blockers with status dots, an amber
 * "Blocked by N" badge while any blocker is unshipped, and a replace-set edit
 * popover. Cycle attempts are rejected server-side (400) → loop toast.
 */
export function DependenciesRail({ feature }: { feature: FeatureWithDocs }) {
  const dependenciesQuery = useDependencies(feature.id);
  const canEdit = useCanEdit();
  const { data: allFeatures } = useFeatures();
  const setDependencies = useSetDependencies();

  const [editOpen, setEditOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const blockers = dependenciesQuery.data?.blockers ?? [];
  const blocked = dependenciesQuery.data?.blocked ?? [];
  const unshippedBlockers = blockers.filter((b) => b.status !== 'shipped').length;
  const candidates = (allFeatures ?? []).filter((f) => f.id !== feature.id);

  const openEditor = (open: boolean) => {
    if (open) setDraftIds(blockers.map((b) => b.id));
    setEditOpen(open);
  };

  const toggleDraft = (id: string) => {
    setDraftIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const save = () => {
    setDependencies.mutate(
      { featureId: feature.id, blockerIds: draftIds },
      {
        onSuccess: () => setEditOpen(false),
        onError: (err) => {
          if (isCycleError(err)) {
            toast.error('That would create a loop');
          } else {
            toast.error(`Couldn't update dependencies for '${feature.title}'`);
          }
        },
      },
    );
  };

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card" aria-label="Dependencies">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-ink">Dependencies</h2>
        {canEdit ? (
        <Popover open={editOpen} onOpenChange={openEditor}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="rounded-full">
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 rounded-xl p-3">
            <p className="text-xs font-medium text-muted-ink">Blocked by</p>
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
              {candidates.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-body-ink transition-colors duration-150 ease-out hover:bg-panel">
                    <input
                      type="checkbox"
                      checked={draftIds.includes(f.id)}
                      onChange={() => toggleDraft(f.id)}
                      className="h-3.5 w-3.5 accent-[var(--pm-action,currentColor)]"
                    />
                    <StatusDot status={f.status} />
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                  </label>
                </li>
              ))}
              {candidates.length === 0 ? (
                <li className="px-2 py-1.5 text-sm text-muted-ink">No other features yet.</li>
              ) : null}
            </ul>
            <div className="mt-2 flex justify-end gap-2 border-t border-line pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={setDependencies.isPending} onClick={save}>
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        ) : null}
      </div>

      {unshippedBlockers > 0 ? (
        <p className="mt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-warm-soft px-2 py-0.5 text-xs font-medium text-warm">
            <Link2 className="h-3 w-3" aria-hidden />
            Blocked by {unshippedBlockers}
          </span>
        </p>
      ) : null}

      {dependenciesQuery.isLoading ? (
        <Skeleton className="mt-3 h-12 w-full rounded-xl" />
      ) : (
        <>
          <ul className="mt-3 space-y-1.5" aria-label="Blockers">
            {blockers.length === 0 ? (
              <li className="text-sm text-muted-ink">Nothing blocks this feature.</li>
            ) : (
              blockers.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-sm text-body-ink">
                  <StatusDot status={b.status} />
                  <Link
                    to={appRoutes.feature(b.id)}
                    className="min-w-0 flex-1 truncate rounded transition-colors duration-150 ease-out hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {b.title}
                  </Link>
                </li>
              ))
            )}
          </ul>
          {blocked.length > 0 ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-xs font-medium text-muted-ink">Blocks</p>
              <ul className="mt-1.5 space-y-1.5" aria-label="Blocks">
                {blocked.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 text-sm text-body-ink">
                    <StatusDot status={b.status} />
                    <Link
                      to={appRoutes.feature(b.id)}
                      className="min-w-0 flex-1 truncate rounded transition-colors duration-150 ease-out hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {b.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default DependenciesRail;
