import { useState } from 'react';
import { toast } from 'sonner';
import type { Horizon } from '@productmap/shared';
import { useCreateFeature } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const HORIZON_LABELS: Record<Horizon, string> = {
  now: 'Now',
  next: 'Next',
  later: 'Later',
};

interface NewFeatureDialogProps {
  horizon: Horizon;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewFeatureDialog({ horizon, open, onOpenChange }: NewFeatureDialogProps) {
  const createFeature = useCreateFeature();
  const [title, setTitle] = useState('');

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createFeature.mutate(
      { title: trimmed, horizon },
      {
        onSuccess: () => {
          setTitle('');
          onOpenChange(false);
        },
        onError: () => toast.error(`Couldn't create '${trimmed}'`),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add feature</DialogTitle>
          <DialogDescription>
            New feature in {HORIZON_LABELS[horizon]}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-feature-title">Title</Label>
          <Input
            id="new-feature-title"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!title.trim() || createFeature.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
