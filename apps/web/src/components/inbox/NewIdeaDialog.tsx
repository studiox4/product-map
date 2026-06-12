import { useState } from 'react';
import { toast } from 'sonner';
import type { IdeaWithVotes } from '@productmap/shared';
import { useCreateIdea } from '@/lib/api';
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
import { Textarea } from '@/components/ui/textarea';

interface NewIdeaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created idea so the inbox can select it. */
  onCreated?: (idea: IdeaWithVotes) => void;
}

/** Capture dialog for the Idea Inbox: title + optional details and source. */
export function NewIdeaDialog({ open, onOpenChange, onCreated }: NewIdeaDialogProps) {
  const createIdea = useCreateIdea();
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [source, setSource] = useState('');

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed || createIdea.isPending) return;
    createIdea.mutate(
      {
        title: trimmed,
        ...(bodyMd.trim() ? { bodyMd: bodyMd.trim() } : {}),
        ...(source.trim() ? { source: source.trim() } : {}),
      },
      {
        onSuccess: (idea) => {
          setTitle('');
          setBodyMd('');
          setSource('');
          onOpenChange(false);
          onCreated?.(idea);
        },
        onError: () => toast.error(`Couldn't capture '${trimmed}'`),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New idea</DialogTitle>
          <DialogDescription>
            Capture it now — triage and promote it when it earns a spot.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-idea-title">Title</Label>
            <Input
              id="new-idea-title"
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
          <div className="space-y-2">
            <Label htmlFor="new-idea-body">Details</Label>
            <Textarea
              id="new-idea-body"
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              placeholder="What's the idea? Markdown works…"
              className="min-h-24 rounded-xl text-sm leading-6"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-idea-source">Source</Label>
            <Input
              id="new-idea-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="sales call, support ticket, hallway chat…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!title.trim() || createIdea.isPending}>
            Capture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewIdeaDialog;
