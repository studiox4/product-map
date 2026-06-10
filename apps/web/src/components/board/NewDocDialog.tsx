import { useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DOC_TYPES, DOC_TYPE_LABELS, type DocType, type FeatureWithDocs } from '@productmap/shared';
import { TEMPLATES } from '@productmap/templates';
import { useCreateDocument } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TemplateChoice = DocType | 'blank';

interface NewDocDialogProps {
  feature: FeatureWithDocs;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Focus returns here on close (dialog is opened from state, not a Radix trigger). */
  returnFocusRef?: RefObject<HTMLElement>;
}

function defaultTitle(feature: FeatureWithDocs, choice: TemplateChoice) {
  return choice === 'blank'
    ? `${feature.title} — Doc`
    : `${feature.title} — ${DOC_TYPE_LABELS[choice]}`;
}

export function NewDocDialog({ feature, open, onOpenChange, returnFocusRef }: NewDocDialogProps) {
  const navigate = useNavigate();
  const createDocument = useCreateDocument();
  const [choice, setChoice] = useState<TemplateChoice>('prd');
  const [title, setTitle] = useState(() => defaultTitle(feature, 'prd'));
  const [titleEdited, setTitleEdited] = useState(false);

  const selectChoice = (next: TemplateChoice) => {
    setChoice(next);
    if (!titleEdited) setTitle(defaultTitle(feature, next));
  };

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createDocument.mutate(
      {
        featureId: feature.id,
        type: choice === 'blank' ? 'feature_brief' : choice,
        title: trimmed,
        fromTemplate: choice !== 'blank',
      },
      {
        onSuccess: (doc) => {
          onOpenChange(false);
          navigate(`/docs/${doc.id}`);
        },
        onError: () => toast.error(`Couldn't create '${trimmed}'`),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          if (returnFocusRef?.current) {
            e.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>New doc</DialogTitle>
          <DialogDescription>Pick a template for '{feature.title}'.</DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={choice}
          onValueChange={(v) => selectChoice(v as TemplateChoice)}
          className="gap-2"
        >
          {DOC_TYPES.map((type) => (
            <Label
              key={type}
              htmlFor={`tpl-${type}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent has-[[data-state=checked]]:border-ring"
            >
              <RadioGroupItem id={`tpl-${type}`} value={type} className="mt-0.5" />
              <span className="space-y-1">
                <span className="block text-sm font-medium">{DOC_TYPE_LABELS[type]}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {TEMPLATES[type].description}
                </span>
              </span>
            </Label>
          ))}
          <Label
            htmlFor="tpl-blank"
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent has-[[data-state=checked]]:border-ring"
          >
            <RadioGroupItem id="tpl-blank" value="blank" className="mt-0.5" />
            <span className="space-y-1">
              <span className="block text-sm font-medium">Blank</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Start from an empty page.
              </span>
            </span>
          </Label>
        </RadioGroup>
        <div className="space-y-2">
          <Label htmlFor="new-doc-title">Title</Label>
          <Input
            id="new-doc-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!title.trim() || createDocument.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
