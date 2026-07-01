import { useMemo, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { File, FileText, Briefcase, Wrench, Sparkles, Lightbulb, Megaphone } from 'lucide-react';
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  type DocType,
  type FeatureWithDocs,
  type Template,
} from '@productmap/shared';
import { useCreateDocument, useTemplates } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, RadioGroup, RadioGroupItem, Button, Input, Label, Skeleton } from '@productmap/ui';

const TYPE_ICONS: Record<DocType, typeof FileText> = {
  prd: FileText,
  brd: Briefcase,
  tech_spec: Wrench,
  feature_brief: Sparkles,
  idea_pitch: Lightbulb,
  release_notes: Megaphone,
};

/**
 * idea_pitch and release_notes docs are created from their owning surfaces
 * (idea detail / release detail), never from the feature new-doc dialog.
 */
const isFeatureDocType = (t: DocType) => t !== 'idea_pitch' && t !== 'release_notes';
const FEATURE_DOC_TYPES = DOC_TYPES.filter(isFeatureDocType);

const templateCardClass =
  'flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3 ' +
  'transition-[box-shadow,background-color] duration-150 ease-out hover:bg-panel ' +
  'has-[[data-state=checked]]:border-transparent has-[[data-state=checked]]:bg-[var(--pm-selected)] ' +
  'has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-[#dcebff] ' +
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring';

interface NewDocDialogProps {
  feature: FeatureWithDocs;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Focus returns here on close (dialog is opened from state, not a Radix trigger). */
  returnFocusRef?: RefObject<HTMLElement>;
}

function defaultTitle(feature: FeatureWithDocs, type: DocType | null) {
  return type === null
    ? `${feature.title} — Doc`
    : `${feature.title} — ${DOC_TYPE_LABELS[type]}`;
}

export function NewDocDialog({ feature, open, onOpenChange, returnFocusRef }: NewDocDialogProps) {
  const navigate = useNavigate();
  const createDocument = useCreateDocument();
  // Active (non-archived) templates; server orders defaults first, then name.
  const templatesQuery = useTemplates();
  const templates = templatesQuery.data;

  // Grouped per type in canonical doc-type order (spec: per-type list).
  const groups = useMemo(
    () =>
      FEATURE_DOC_TYPES.map((type) => ({
        type,
        templates: (templates ?? []).filter((t) => t.type === type),
      })).filter((g) => g.templates.length > 0),
    [templates],
  );

  // Default selection: the PRD default template, else the first default, else first template, else Blank.
  const initialChoice = useMemo(() => {
    const eligible = (templates ?? []).filter((t) =>
      isFeatureDocType(t.type),
    );
    if (!eligible.length) return 'blank';
    const prdDefault = eligible.find((t) => t.type === 'prd' && t.isDefault);
    return (prdDefault ?? eligible.find((t) => t.isDefault) ?? eligible[0]).id;
  }, [templates]);

  const [choice, setChoice] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [titleEdited, setTitleEdited] = useState(false);

  const selected: Template | undefined = templates?.find(
    (t) => t.id === (choice ?? initialChoice),
  );
  const effectiveChoice = choice ?? initialChoice;
  const effectiveTitle =
    title ?? defaultTitle(feature, selected ? selected.type : null);

  const selectChoice = (next: string) => {
    setChoice(next);
    if (!titleEdited) {
      const tpl = templates?.find((t) => t.id === next);
      setTitle(defaultTitle(feature, tpl ? tpl.type : null));
    }
  };

  const create = () => {
    const trimmed = effectiveTitle.trim();
    if (!trimmed) return;
    createDocument.mutate(
      {
        featureId: feature.id,
        type: selected ? selected.type : 'feature_brief',
        title: trimmed,
        ...(selected
          ? { templateId: selected.id }
          : { fromTemplate: false }),
      },
      {
        onSuccess: (doc) => {
          onOpenChange(false);
          navigate(appRoutes.doc(doc.id));
        },
        onError: () => toast.error(`Couldn't create '${trimmed}'`),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto"
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
        {templatesQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (
          <RadioGroup
            value={effectiveChoice}
            onValueChange={selectChoice}
            className="gap-2"
          >
            {groups.map(({ type, templates: groupTemplates }) => {
              const Icon = TYPE_ICONS[type];
              return (
                <div key={type} className="space-y-2">
                  <p className="px-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-ink">
                    {DOC_TYPE_LABELS[type]}
                  </p>
                  {groupTemplates.map((tpl) => (
                    <Label key={tpl.id} htmlFor={`tpl-${tpl.id}`} className={templateCardClass}>
                      <RadioGroupItem id={`tpl-${tpl.id}`} value={tpl.id} className="sr-only" />
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wash text-action">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="space-y-1">
                        <span className="flex items-center gap-2 text-sm font-medium text-ink">
                          {tpl.name}
                          {tpl.isDefault ? (
                            <span className="inline-flex items-center rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-medium text-sage">
                              Default
                            </span>
                          ) : null}
                        </span>
                        {tpl.description ? (
                          <span className="block text-xs font-normal text-muted-ink">
                            {tpl.description}
                          </span>
                        ) : null}
                      </span>
                    </Label>
                  ))}
                </div>
              );
            })}
            <Label htmlFor="tpl-blank" className={templateCardClass}>
              <RadioGroupItem id="tpl-blank" value="blank" className="sr-only" />
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wash text-action">
                <File className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="space-y-1">
                <span className="block text-sm font-medium text-ink">Blank</span>
                <span className="block text-xs font-normal text-muted-ink">
                  Start from an empty page.
                </span>
              </span>
            </Label>
          </RadioGroup>
        )}
        <div className="space-y-2">
          <Label htmlFor="new-doc-title">Title</Label>
          <Input
            id="new-doc-title"
            value={effectiveTitle}
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
          <Button
            onClick={create}
            disabled={!effectiveTitle.trim() || createDocument.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
