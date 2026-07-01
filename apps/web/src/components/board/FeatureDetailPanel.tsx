import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  FEATURE_STATUSES,
  HORIZONS,
  type FeatureWithDocs,
} from '@productmap/shared';
import { useFeature, useUpdateFeature, useUsers } from '@/lib/api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@productmap/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@productmap/ui';
import { Button } from '@productmap/ui';
import { Input } from '@productmap/ui';
import { Label } from '@productmap/ui';
import { Skeleton } from '@productmap/ui';
import { DocTypeChip } from '@/components/DocTypeChip';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import { STATUS_LABELS } from '@/components/StatusBadge';
import { NewDocDialog } from '@/components/board/NewDocDialog';
import { appRoutes } from '@/lib/routes';
import { morphStyle } from '@/lib/transitions';
import { confettiBurst } from '@/lib/delight';

interface FeatureDetailPanelProps {
  featureId: string | null;
  onClose: () => void;
}

/** Slim "peek" sheet: quick edits + jump-off to the full feature page. */
export function FeatureDetailPanel({ featureId, onClose }: FeatureDetailPanelProps) {
  return (
    <Sheet open={!!featureId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto rounded-l-2xl sm:max-w-md">
        <SheetTitle className="sr-only">Feature details</SheetTitle>
        <SheetDescription className="sr-only">View and edit this feature.</SheetDescription>
        {featureId ? <PanelBody key={featureId} featureId={featureId} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({ featureId, onClose }: { featureId: string; onClose: () => void }) {
  const { data: feature, isLoading } = useFeature(featureId);

  if (isLoading || !feature) {
    return (
      <div className="space-y-4 pt-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return <PanelFields feature={feature} onClose={onClose} />;
}

const pillTriggerClass =
  'rounded-full border-transparent bg-inset px-4 transition-colors duration-150 ease-out hover:bg-wash';

function PanelFields({ feature, onClose }: { feature: FeatureWithDocs; onClose: () => void }) {
  const navigate = useNavigate();
  const updateFeature = useUpdateFeature();
  const { data: users } = useUsers();

  const [startDate, setStartDate] = useState(feature.startDate ?? '');
  const [endDate, setEndDate] = useState(feature.endDate ?? '');
  const [newDocOpen, setNewDocOpen] = useState(false);
  const newDocTriggerRef = useRef<HTMLButtonElement>(null);

  const datesInverted = Boolean(startDate && endDate && startDate > endDate);

  const creator = users?.find((u) => u.id === feature.createdBy);
  const createdOn = format(parseISO(feature.createdAt), 'MMM d');

  const saveDates = (nextStart: string, nextEnd: string) => {
    if (nextStart && nextEnd && nextStart > nextEnd) return; // inline error shown, no save
    updateFeature.mutate(
      { id: feature.id, startDate: nextStart || null, endDate: nextEnd || null },
      { onError: () => toast.error(`Couldn't update dates for '${feature.title}' — restored`) },
    );
  };

  return (
    <div className="space-y-8 pt-6">
      <SheetHeader className="space-y-2 text-left" style={morphStyle('feature-peek', feature.id)}>
        <Label htmlFor="feature-title" className="text-xs font-medium text-muted-ink">
          Title
        </Label>
        <Input
          id="feature-title"
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
          className="rounded-xl border-transparent bg-inset font-display text-base font-semibold text-ink transition-colors duration-150 ease-out focus-visible:bg-surface"
        />
      </SheetHeader>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-ink">Horizon</Label>
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
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-ink">Status</Label>
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
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="feature-start-date" className="text-xs font-medium text-muted-ink">
              Start date
            </Label>
            <Input
              id="feature-start-date"
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
            <Label htmlFor="feature-end-date" className="text-xs font-medium text-muted-ink">
              End date
            </Label>
            <Input
              id="feature-end-date"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                saveDates(startDate, e.target.value);
              }}
              className="rounded-full border-transparent bg-inset px-4 transition-colors duration-150 ease-out focus-visible:bg-surface"
            />
          </div>
        </div>
        {datesInverted ? (
          <p className="text-sm text-destructive" role="alert">
            Start date must be on or before end date
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-ink">Docs</Label>
          <Button
            ref={newDocTriggerRef}
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setNewDocOpen(true)}
          >
            New doc
          </Button>
        </div>
        {feature.documents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-dash px-3 py-4 text-center text-sm text-muted-ink">
            No docs yet
          </p>
        ) : (
          <ul className="space-y-2">
            {feature.documents.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => navigate(appRoutes.doc(doc.id))}
                  className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm text-body-ink shadow-sm-card transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <DocTypeChip type={doc.type} />
                  <span className="flex-1 truncate">{doc.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4 border-t border-line pt-5">
        <p className="text-xs text-muted-ink">
          {creator ? `Added by ${creator.name} · ${createdOn}` : `Added ${createdOn}`}
        </p>
        <Button
          className="w-full rounded-full"
          onClick={() => {
            onClose();
            navigate(appRoutes.feature(feature.id));
          }}
        >
          Open feature ↗
        </Button>
      </div>

      <NewDocDialog
        feature={feature}
        open={newDocOpen}
        onOpenChange={setNewDocOpen}
        returnFocusRef={newDocTriggerRef}
      />
    </div>
  );
}
