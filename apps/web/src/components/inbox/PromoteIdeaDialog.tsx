import { useState } from 'react';
import { toast } from 'sonner';
import { HORIZONS, type Horizon, type IdeaWithVotes } from '@productmap/shared';
import { useAiStatus, usePromoteIdea } from '@/lib/api';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Button, cn } from '@productmap/ui';

interface PromoteIdeaDialogProps {
  idea: IdeaWithVotes;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Promote an idea to a feature: horizon picker + optional "Draft AI brief"
 * checkbox (hidden entirely when AI is disabled — UX guideline, not greyed).
 */
export function PromoteIdeaDialog({ idea, open, onOpenChange }: PromoteIdeaDialogProps) {
  const promote = usePromoteIdea();
  const aiEnabled = useAiStatus().data?.enabled ?? false;
  const [horizon, setHorizon] = useState<Horizon>('later');
  const [withAiBrief, setWithAiBrief] = useState(false);

  const submit = () => {
    if (promote.isPending) return;
    promote.mutate(
      { id: idea.id, horizon, ...(aiEnabled && withAiBrief ? { withAiBrief: true } : {}) },
      {
        onSuccess: (feature) => {
          onOpenChange(false);
          toast.success(`Promoted '${feature.title}' to ${HORIZON_LABELS[horizon]}`);
        },
        onError: () => toast.error(`Couldn't promote '${idea.title}'`),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote to feature</DialogTitle>
          <DialogDescription>
            '{idea.title}' becomes a feature on the board — its details carry over as
            the description.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink" id="promote-horizon-label">
              Horizon
            </p>
            <div
              role="radiogroup"
              aria-labelledby="promote-horizon-label"
              className="flex items-center gap-1.5"
            >
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={horizon === h}
                  onClick={() => setHorizon(h)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
                    horizon === h
                      ? 'bg-action-soft text-action'
                      : 'bg-inset text-muted-ink hover:bg-wash hover:text-ink',
                  )}
                >
                  {HORIZON_LABELS[h]}
                </button>
              ))}
            </div>
          </div>
          {aiEnabled ? (
            <label className="flex items-center gap-2 text-sm text-body-ink">
              <input
                type="checkbox"
                checked={withAiBrief}
                onChange={(e) => setWithAiBrief(e.target.checked)}
                className="h-4 w-4 rounded border-line-dash accent-action"
              />
              Draft AI brief
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={promote.isPending}>
            {promote.isPending ? 'Promoting…' : 'Promote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PromoteIdeaDialog;
