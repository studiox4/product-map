import { useMemo, useState } from 'react';
import type { DocStatus, DocType, FeatureWithDocs } from '@productmap/shared';
import { HORIZON_COLORS } from '@productmap/shared';
import { useAllDocuments, useFeatures } from '@/lib/api';
import { NewDocDialog } from '@/components/board/NewDocDialog';
import { DocsFilters } from '@/components/docs/DocsFilters';
import { DocsTable, type DocsSort, type DocsSortKey } from '@/components/docs/DocsTable';
import { DocPreviewSheet } from '@/components/docs/DocPreviewSheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { navigateWithTransition } from '@/lib/transitions';

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Step 1 of "+ New doc": pick the feature the doc belongs to (step 2 reuses NewDocDialog). */
function PickFeatureDialog({
  open,
  onOpenChange,
  features,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  features: FeatureWithDocs[];
  onPick: (feature: FeatureWithDocs) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New doc</DialogTitle>
          <DialogDescription>Which feature is this doc for?</DialogDescription>
        </DialogHeader>
        <div className="max-h-[320px] space-y-2 overflow-y-auto">
          {features.length === 0 && (
            <p className="text-sm text-muted-ink">
              No features yet — create one on the board first.
            </p>
          )}
          {features.map((feature) => (
            <button
              key={feature.id}
              type="button"
              onClick={() => onPick(feature)}
              className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm text-body-ink shadow-sm-card transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex-1 truncate font-medium text-ink">{feature.title}</span>
              <span
                className={cn(
                  'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                  HORIZON_COLORS[feature.horizon].badge,
                )}
              >
                {feature.horizon}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-transparent bg-surface shadow-card">
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DocsPage() {
  const docsQuery = useAllDocuments();
  const featuresQuery = useFeatures();

  const [typeFilters, setTypeFilters] = useState<DocType[]>([]);
  const [statusFilters, setStatusFilters] = useState<DocStatus[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<DocsSort>({ key: 'updatedAt', dir: 'desc' });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pickingFeature, setPickingFeature] = useState(false);
  const [newDocFeature, setNewDocFeature] = useState<FeatureWithDocs | null>(null);

  const docs = docsQuery.data;

  // type/status filters AND search compose; empty filter group = all.
  const visibleDocs = useMemo(() => {
    if (!docs) return [];
    const needle = search.trim().toLowerCase();
    const filtered = docs.filter((doc) => {
      if (typeFilters.length > 0 && !typeFilters.includes(doc.type)) return false;
      if (statusFilters.length > 0 && !statusFilters.includes(doc.status)) return false;
      if (
        needle &&
        !doc.title.toLowerCase().includes(needle) &&
        !doc.featureTitle.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.key === 'title'
        ? dir * a.title.localeCompare(b.title)
        : dir * a.updatedAt.localeCompare(b.updatedAt),
    );
  }, [docs, typeFilters, statusFilters, search, sort]);

  const previewDoc = previewId ? (docs?.find((d) => d.id === previewId) ?? null) : null;

  const handleSortChange = (key: DocsSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'updatedAt' ? 'desc' : 'asc' },
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Docs</h1>
      <DocsFilters
        typeFilters={typeFilters}
        statusFilters={statusFilters}
        search={search}
        onToggleType={(t) => setTypeFilters((prev) => toggle(prev, t))}
        onToggleStatus={(s) => setStatusFilters((prev) => toggle(prev, s))}
        onSearchChange={setSearch}
        onNewDoc={() => setPickingFeature(true)}
      />

      {docsQuery.isLoading && <DocsSkeleton />}

      {docsQuery.isError && (
        <div className="rounded-2xl border border-transparent bg-surface p-6 shadow-card">
          <p className="text-sm text-body-ink">Couldn't load docs.</p>
          <Button
            className="mt-4 rounded-full"
            variant="outline"
            onClick={() => void docsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {docs && visibleDocs.length === 0 && (
        <div className="rounded-2xl border border-transparent bg-surface p-10 text-center shadow-card">
          <p className="text-sm text-muted-ink">No docs match.</p>
        </div>
      )}

      {docs && visibleDocs.length > 0 && (
        <DocsTable
          docs={visibleDocs}
          sort={sort}
          onSortChange={handleSortChange}
          onRowClick={(id) => navigateWithTransition(() => setPreviewId(id))}
        />
      )}

      <DocPreviewSheet
        doc={previewDoc}
        open={previewDoc !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null);
        }}
      />

      <PickFeatureDialog
        open={pickingFeature}
        onOpenChange={setPickingFeature}
        features={featuresQuery.data ?? []}
        onPick={(feature) => {
          setPickingFeature(false);
          setNewDocFeature(feature);
        }}
      />
      {newDocFeature && (
        <NewDocDialog
          feature={newDocFeature}
          open
          onOpenChange={(open) => {
            if (!open) setNewDocFeature(null);
          }}
        />
      )}
    </div>
  );
}
