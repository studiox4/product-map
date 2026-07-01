import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { OBJECTIVE_STATUSES, type Objective, type ObjectiveStatus } from '@productmap/shared';
import { useCreateObjective, useUpdateObjective, useUsers } from '@/lib/api';
import { Button } from '@productmap/ui';
import { Input } from '@productmap/ui';
import { Label } from '@productmap/ui';
import { Textarea } from '@productmap/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@productmap/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@productmap/ui';

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  achieved: 'Achieved',
  dropped: 'Dropped',
};

const NONE = '__none__';

/** Next 8 quarters starting from the current one (plus `extra` when set and absent). */
export function quarterOptions(extra?: string, today = new Date()): string[] {
  const options: string[] = [];
  let quarter = Math.floor(today.getMonth() / 3) + 1;
  let year = today.getFullYear();
  for (let i = 0; i < 8; i += 1) {
    options.push(`Q${quarter} ${year}`);
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }
  if (extra && !options.includes(extra)) options.unshift(extra);
  return options;
}

/**
 * "New objective" / edit dialog (dream tier 2 §3): every objective property —
 * title, description, metric, target, current, quarter, owner (from useUsers),
 * status. Create when `objective` is null, edit otherwise.
 */
export function ObjectiveDialog({
  open,
  onOpenChange,
  objective,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Objective being edited; null/undefined = create. */
  objective?: Objective | null;
}) {
  const usersQuery = useUsers();
  const createObjective = useCreateObjective();
  const updateObjective = useUpdateObjective();

  const [title, setTitle] = useState('');
  const [descriptionMd, setDescriptionMd] = useState('');
  const [metric, setMetric] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [quarter, setQuarter] = useState<string>(NONE);
  const [ownerId, setOwnerId] = useState<string>(NONE);
  const [status, setStatus] = useState<ObjectiveStatus>('on_track');

  // Re-seed the form whenever the dialog opens (fresh create or a new target).
  useEffect(() => {
    if (!open) return;
    setTitle(objective?.title ?? '');
    setDescriptionMd(objective?.descriptionMd ?? '');
    setMetric(objective?.metric ?? '');
    setTarget(objective?.target ?? '');
    setCurrent(objective?.current ?? '');
    setQuarter(objective?.quarter ? objective.quarter : NONE);
    setOwnerId(objective?.ownerId ?? NONE);
    setStatus(objective?.status ?? 'on_track');
  }, [open, objective]);

  const isPending = createObjective.isPending || updateObjective.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isPending) return;
    const body = {
      title: trimmed,
      descriptionMd,
      metric,
      target,
      current,
      quarter: quarter === NONE ? '' : quarter,
      ownerId: ownerId === NONE ? null : ownerId,
      status,
    };
    const done = { onSuccess: () => onOpenChange(false) };
    if (objective) {
      updateObjective.mutate(
        { id: objective.id, ...body },
        { ...done, onError: () => toast.error(`Couldn't update '${trimmed}'`) },
      );
    } else {
      createObjective.mutate(body, {
        ...done,
        onError: () => toast.error(`Couldn't create '${trimmed}'`),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{objective ? 'Edit objective' : 'New objective'}</DialogTitle>
          <DialogDescription>
            An outcome to drive — give it a metric and a target so progress is honest.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="objective-title">Title</Label>
            <Input
              id="objective-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Make collaboration sticky"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="objective-description">Description (optional)</Label>
            <Textarea
              id="objective-description"
              value={descriptionMd}
              onChange={(e) => setDescriptionMd(e.target.value)}
              placeholder="Why this outcome matters…"
              className="min-h-[72px]"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="objective-metric">Metric</Label>
              <Input
                id="objective-metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                placeholder="Weekly actives"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="objective-target">Target</Label>
              <Input
                id="objective-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="40%"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="objective-current">Current</Label>
              <Input
                id="objective-current"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="12%"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="objective-quarter">Quarter</Label>
              <Select value={quarter} onValueChange={setQuarter}>
                <SelectTrigger id="objective-quarter" aria-label="Quarter">
                  <SelectValue placeholder="No quarter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No quarter</SelectItem>
                  {quarterOptions(objective?.quarter).map((q) => (
                    <SelectItem key={q} value={q}>
                      {q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="objective-owner">Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger id="objective-owner" aria-label="Owner">
                  <SelectValue placeholder="Unowned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unowned</SelectItem>
                  {(usersQuery.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="objective-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ObjectiveStatus)}>
                <SelectTrigger id="objective-status" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {OBJECTIVE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={!title.trim() || isPending}>
              {objective ? 'Save changes' : 'Create objective'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ObjectiveDialog;
