import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FEATURE_STATUSES, type FeatureWithDocs } from '@productmap/shared';
import { useDeleteFeature, useFeature, useUpdateFeature } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { DocTypeChip } from '@/components/DocTypeChip';
import { NewDocDialog } from '@/components/board/NewDocDialog';

const STATUS_LABELS: Record<(typeof FEATURE_STATUSES)[number], string> = {
  idea: 'Idea',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
};

interface FeatureDetailPanelProps {
  featureId: string | null;
  onClose: () => void;
}

export function FeatureDetailPanel({ featureId, onClose }: FeatureDetailPanelProps) {
  return (
    <Sheet open={!!featureId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
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

function PanelFields({ feature, onClose }: { feature: FeatureWithDocs; onClose: () => void }) {
  const navigate = useNavigate();
  const updateFeature = useUpdateFeature();
  const deleteFeature = useDeleteFeature();

  const [startDate, setStartDate] = useState(feature.startDate ?? '');
  const [endDate, setEndDate] = useState(feature.endDate ?? '');
  const [newDocOpen, setNewDocOpen] = useState(false);
  const newDocTriggerRef = useRef<HTMLButtonElement>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const datesInverted = Boolean(startDate && endDate && startDate > endDate);

  const saveDates = (nextStart: string, nextEnd: string) => {
    if (nextStart && nextEnd && nextStart > nextEnd) return; // inline error shown, no save
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
        onClose();
      },
      onError: () => toast.error(`Couldn't delete '${feature.title}'`),
    });
  };

  return (
    <div className="space-y-6 pt-6">
      <SheetHeader className="space-y-2 text-left">
        <SheetTitle className="sr-only">{feature.title}</SheetTitle>
        <Label htmlFor="feature-title" className="text-xs text-muted-foreground">
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
          className="text-base font-semibold"
        />
      </SheetHeader>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select
          value={feature.status}
          onValueChange={(status) =>
            updateFeature.mutate(
              { id: feature.id, status: status as FeatureWithDocs['status'] },
              { onError: () => toast.error(`Couldn't update '${feature.title}' — restored`) },
            )
          }
        >
          <SelectTrigger aria-label="Status">
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

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="feature-start-date" className="text-xs text-muted-foreground">
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="feature-end-date" className="text-xs text-muted-foreground">
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
          <Label className="text-xs text-muted-foreground">Docs</Label>
          <Button
            ref={newDocTriggerRef}
            variant="outline"
            size="sm"
            onClick={() => setNewDocOpen(true)}
          >
            New doc
          </Button>
        </div>
        {feature.documents.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            No docs yet
          </p>
        ) : (
          <ul className="space-y-2">
            {feature.documents.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/docs/${doc.id}`)}
                  className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <DocTypeChip type={doc.type} />
                  <span className="flex-1 truncate">{doc.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t pt-4">
        <Button variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
          Delete feature
        </Button>
      </div>

      <NewDocDialog
        feature={feature}
        open={newDocOpen}
        onOpenChange={setNewDocOpen}
        returnFocusRef={newDocTriggerRef}
      />

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
            <Button
              variant="destructive"
              disabled={deleteFeature.isPending}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
