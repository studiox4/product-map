import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useCreateRelease } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** "New release" dialog — name (required) + optional target date. */
export function NewReleaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const createRelease = useCreateRelease();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || createRelease.isPending) return;
    createRelease.mutate(
      { name: trimmed, targetDate: targetDate || null },
      {
        onSuccess: () => {
          setName('');
          setTargetDate('');
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
          <DialogTitle>New release</DialogTitle>
          <DialogDescription>
            Group features into a shippable bundle. Assign features from their page rail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="release-name">Name</Label>
            <Input
              id="release-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="v0.3 — Spring polish"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="release-date">Target date (optional)</Label>
            <Input
              id="release-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="rounded-full"
              disabled={!name.trim() || createRelease.isPending}
            >
              Create release
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default NewReleaseDialog;
