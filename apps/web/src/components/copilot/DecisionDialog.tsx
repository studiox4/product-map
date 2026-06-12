import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { useCreateDecision } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface DecisionDraft {
  title: string;
  decisionMd: string;
  alternativesMd: string;
}

export interface DecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** AI-suggested prefill (decision extraction) — fields stay editable. */
  initial?: DecisionDraft;
  /** Feature the decision belongs to (omitted for doc-only threads). */
  featureId?: string;
  /** Resolved thread root the decision was extracted from. */
  sourceCommentId?: string;
}

const EMPTY: DecisionDraft = { title: '', decisionMd: '', alternativesMd: '' };

/** Prefilled "Log decision" dialog: edit the AI suggestion, then POST /api/decisions. */
export function DecisionDialog({
  open,
  onOpenChange,
  initial,
  featureId,
  sourceCommentId,
}: DecisionDialogProps) {
  const [draft, setDraft] = useState<DecisionDraft>(initial ?? EMPTY);
  const createDecision = useCreateDecision();

  // Re-seed the form whenever a (new) suggestion opens the dialog.
  useEffect(() => {
    if (open) setDraft(initial ?? EMPTY);
  }, [open, initial]);

  const canSave = draft.title.trim().length > 0 && draft.decisionMd.trim().length > 0;

  const save = () => {
    if (!canSave || createDecision.isPending) return;
    createDecision.mutate(
      {
        ...(featureId ? { featureId } : {}),
        title: draft.title.trim(),
        decisionMd: draft.decisionMd.trim(),
        ...(draft.alternativesMd.trim()
          ? { alternativesMd: draft.alternativesMd.trim() }
          : {}),
        ...(sourceCommentId ? { sourceCommentId } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Decision logged');
          onOpenChange(false);
        },
        onError: () => toast.error("Couldn't log the decision — try again."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-action-soft text-action">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            Log decision
          </DialogTitle>
          <DialogDescription>
            Review the suggested decision before saving it to the feature.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="decision-title">Title</Label>
            <Input
              id="decision-title"
              value={draft.title}
              placeholder="What was decided?"
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="decision-md">Decision</Label>
            <Textarea
              id="decision-md"
              rows={4}
              value={draft.decisionMd}
              placeholder="What was decided, and why (markdown)"
              onChange={(e) => setDraft((d) => ({ ...d, decisionMd: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="decision-alternatives">Alternatives considered</Label>
            <Textarea
              id="decision-alternatives"
              rows={3}
              value={draft.alternativesMd}
              placeholder="Options ruled out (optional, markdown)"
              onChange={(e) =>
                setDraft((d) => ({ ...d, alternativesMd: e.target.value }))
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || createDecision.isPending}>
              {createDecision.isPending ? 'Saving…' : 'Save decision'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default DecisionDialog;
