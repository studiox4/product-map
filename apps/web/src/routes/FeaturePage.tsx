import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  FEATURE_STATUSES,
  HORIZONS,
  type FeatureWithDocs,
} from '@productmap/shared';
import { useDeleteFeature, useFeature, useUpdateFeature } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { HorizonBadge, HORIZON_LABELS } from '@/components/HorizonBadge';
import { STATUS_LABELS } from '@/components/StatusBadge';
import { DescriptionBlock } from '@/components/feature/DescriptionBlock';
import { DocsGrid } from '@/components/feature/DocsGrid';
import { ActivityFeed } from '@/components/feature/ActivityFeed';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { PeopleRail } from '@/components/feature/PeopleRail';
import { morphStyle } from '@/lib/transitions';
import { confettiBurst } from '@/lib/delight';
import { VoteWidget } from '@/components/VoteWidget';

function FeatureSkeleton() {
  return (
    <div data-testid="feature-skeleton" className="mx-auto max-w-[1280px] space-y-6 px-6 py-8">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export default function FeaturePage() {
  const { id = '' } = useParams<{ id: string }>();
  const featureQuery = useFeature(id);

  if (featureQuery.isLoading) return <FeatureSkeleton />;

  if (featureQuery.isError || !featureQuery.data) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <p className="text-sm text-body-ink">Couldn't load this feature.</p>
          <Button className="mt-4" variant="outline" onClick={() => void featureQuery.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return <FeatureBody key={id} feature={featureQuery.data} />;
}

const pillTriggerClass =
  'rounded-full border-transparent bg-inset px-4 transition-colors duration-150 ease-out hover:bg-wash';

function FeatureBody({ feature }: { feature: FeatureWithDocs }) {
  const navigate = useNavigate();
  const updateFeature = useUpdateFeature();
  const deleteFeature = useDeleteFeature();

  const [startDate, setStartDate] = useState(feature.startDate ?? '');
  const [endDate, setEndDate] = useState(feature.endDate ?? '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const datesInverted = Boolean(startDate && endDate && startDate > endDate);

  const saveDates = (nextStart: string, nextEnd: string) => {
    if (nextStart && nextEnd && nextStart > nextEnd) return;
    updateFeature.mutate(
      { id: feature.id, startDate: nextStart || null, endDate: nextEnd || null },
      { onError: () => toast.error(`Couldn't update dates for '${feature.title}' — restored`) },
    );
  };

  const confirmDelete = () => {
    deleteFeature.mutate(feature.id, {
      onSuccess: () => {
        toast.success(`Deleted '${feature.title}'`);
        setConfirmDeleteOpen(false);
        navigate('/board');
      },
      onError: () => toast.error(`Couldn't delete '${feature.title}'`),
    });
  };

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-ink">
        <Link
          to="/board"
          className="rounded-full outline-none transition-colors duration-150 ease-out hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          Board
        </Link>
        <span aria-hidden>/</span>
        <span className="text-body-ink">{HORIZON_LABELS[feature.horizon]}</span>
      </nav>

      <header
        className="mt-4 flex flex-wrap items-center gap-4"
        style={morphStyle('feature', feature.id)}
      >
        <Input
          aria-label="Feature title"
          defaultValue={feature.title}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== feature.title) {
              updateFeature.mutate(
                { id: feature.id, title: next },
                { onError: () => toast.error(`Couldn't rename '${feature.title}' — restored`) },
              );
            }
          }}
          className="h-auto min-w-64 flex-1 rounded-xl border-transparent bg-transparent px-2 py-1 font-display text-[32px] font-bold leading-tight text-ink transition-colors duration-150 ease-out hover:bg-surface focus-visible:bg-surface md:text-[32px]"
        />
        <div className="flex items-center gap-2">
          <HorizonBadge horizon={feature.horizon} />
          <Select
            value={feature.status}
            onValueChange={(status) => {
              if (status === 'shipped' && feature.status !== 'shipped') confettiBurst();
              updateFeature.mutate(
                { id: feature.id, status: status as FeatureWithDocs['status'] },
                { onError: () => toast.error(`Couldn't update '${feature.title}' — restored`) },
              );
            }}
          >
            <SelectTrigger aria-label="Status" className={pillTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEATURE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <VoteWidget featureId={feature.id} summary={feature} />
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-8">
          <DescriptionBlock feature={feature} />
          <DocsGrid feature={feature} />
          <CommentsSection target={{ featureId: feature.id }} />
          <ActivityFeed featureId={feature.id} />
        </div>

        <aside className="space-y-4">
          <PeopleRail feature={feature} />

          <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-card" aria-label="Dates">
            <h2 className="font-display text-sm font-semibold text-ink">Dates</h2>
            <div className="space-y-2">
              <Label htmlFor="feature-page-start-date" className="text-xs font-medium text-muted-ink">
                Start date
              </Label>
              <Input
                id="feature-page-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  saveDates(e.target.value, endDate);
                }}
                className="rounded-full border-transparent bg-inset px-4 transition-colors duration-150 ease-out focus-visible:bg-surface"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feature-page-end-date" className="text-xs font-medium text-muted-ink">
                End date
              </Label>
              <Input
                id="feature-page-end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  saveDates(startDate, e.target.value);
                }}
                className="rounded-full border-transparent bg-inset px-4 transition-colors duration-150 ease-out focus-visible:bg-surface"
              />
            </div>
            {datesInverted ? (
              <p className="text-sm text-destructive" role="alert">
                Start date must be on or before end date
              </p>
            ) : null}
          </section>

          <section className="space-y-2 rounded-2xl bg-surface p-4 shadow-card" aria-label="Horizon">
            <h2 className="font-display text-sm font-semibold text-ink">Horizon</h2>
            <Select
              value={feature.horizon}
              onValueChange={(horizon) =>
                updateFeature.mutate(
                  { id: feature.id, horizon: horizon as FeatureWithDocs['horizon'] },
                  { onError: () => toast.error(`Couldn't move '${feature.title}' — restored`) },
                )
              }
            >
              <SelectTrigger aria-label="Horizon" className={pillTriggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HORIZONS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {HORIZON_LABELS[h]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <div className="pt-2">
            <Button
              variant="destructive"
              size="sm"
              className="rounded-full"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Delete feature
            </Button>
          </div>
        </aside>
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete feature?</DialogTitle>
            <DialogDescription>
              This will permanently delete '{feature.title}'
              {feature.documents.length > 0
                ? ` and its ${feature.documents.length} doc${feature.documents.length === 1 ? '' : 's'}`
                : ''}
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteFeature.isPending} onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
