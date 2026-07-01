import { useState, type FormEvent } from 'react';
import {
  BookOpen,
  Link as LinkIcon,
  Paperclip,
  Plus,
  Quote,
  Ticket,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { EVIDENCE_KINDS, type EvidenceKind } from '@productmap/shared';
import {
  useAddEvidence,
  useDeleteEvidence,
  useEvidence,
  type EvidenceItem,
} from '@/lib/api';
import { useCanEdit } from '@/lib/project';
import { Button, Input, Label, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@productmap/ui';

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  quote: 'Quote',
  research: 'Research',
  ticket: 'Ticket',
  metric: 'Metric',
  other: 'Other',
};

const KIND_ICONS: Record<EvidenceKind, LucideIcon> = {
  quote: Quote,
  research: BookOpen,
  ticket: Ticket,
  metric: TrendingUp,
  other: Paperclip,
};

const KIND_ICON_CLASSES: Record<EvidenceKind, string> = {
  quote: 'bg-action-soft text-action',
  research: 'bg-[var(--pm-violet-soft)] text-[var(--pm-violet)]',
  ticket: 'bg-warm-soft text-warm',
  metric: 'bg-sage-soft text-sage',
  other: 'bg-wash text-body-ink',
};

function EvidenceCard({
  item,
  onDelete,
}: {
  item: EvidenceItem;
  onDelete: (item: EvidenceItem) => void;
}) {
  const Icon = KIND_ICONS[item.kind];
  return (
    <li className="group flex items-start gap-3 rounded-xl bg-surface p-3 shadow-sm-card">
      <span
        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${KIND_ICON_CLASSES[item.kind]}`}
        title={EVIDENCE_KIND_LABELS[item.kind]}
        aria-label={EVIDENCE_KIND_LABELS[item.kind]}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium leading-snug text-ink">{item.title}</p>
          {item.weight > 1 ? (
            <span
              className="inline-flex items-center rounded-full bg-inset px-2 py-0.5 text-xs font-medium text-body-ink"
              title={`Weight ${item.weight}`}
            >
              ×{item.weight}
            </span>
          ) : null}
        </div>
        {item.bodyMd ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-body-ink">{item.bodyMd}</p>
        ) : null}
        {item.sourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-action underline-offset-2 hover:underline"
          >
            <LinkIcon className="h-3 w-3" aria-hidden />
            <span className="truncate">{item.sourceUrl}</span>
          </a>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`Delete evidence ${item.title}`}
        onClick={() => onDelete(item)}
        className="rounded-full p-1 text-muted-ink opacity-0 transition-opacity duration-150 ease-out hover:bg-panel hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}

/** Feature-page Evidence section (D2): kind-icon cards with weight badges + add popover. */
export function EvidenceSection({ featureId }: { featureId: string }) {
  const evidenceQuery = useEvidence(featureId);
  const addEvidence = useAddEvidence();
  const deleteEvidence = useDeleteEvidence();
  const canEdit = useCanEdit();

  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<EvidenceKind>('quote');
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [weight, setWeight] = useState('1');

  const items = evidenceQuery.data ?? [];

  const resetForm = () => {
    setKind('quote');
    setTitle('');
    setBodyMd('');
    setSourceUrl('');
    setWeight('1');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const parsedWeight = Math.max(1, Number.parseInt(weight, 10) || 1);
    addEvidence.mutate(
      {
        featureId,
        kind,
        title: trimmed,
        ...(bodyMd.trim() ? { bodyMd: bodyMd.trim() } : {}),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        ...(parsedWeight !== 1 ? { weight: parsedWeight } : {}),
      },
      {
        onSuccess: () => {
          setAddOpen(false);
          resetForm();
        },
        onError: () => toast.error("Couldn't add evidence"),
      },
    );
  };

  const remove = (item: EvidenceItem) => {
    deleteEvidence.mutate(
      { id: item.id, featureId },
      { onError: () => toast.error(`Couldn't delete '${item.title}'`) },
    );
  };

  return (
    <section className="rounded-2xl bg-panel p-6" aria-label="Evidence">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-ink">
          Evidence
          {items.length > 0 ? (
            <span className="ml-2 font-sans text-xs font-medium text-muted-ink">
              {items.length}
            </span>
          ) : null}
        </h2>
        {canEdit ? (
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="rounded-full">
              <Plus className="h-4 w-4" aria-hidden />
              Add evidence
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 rounded-xl p-4">
            <form className="space-y-3" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="evidence-kind" className="text-xs font-medium text-muted-ink">
                  Kind
                </Label>
                <Select value={kind} onValueChange={(v) => setKind(v as EvidenceKind)}>
                  <SelectTrigger id="evidence-kind" aria-label="Evidence kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {EVIDENCE_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="evidence-title" className="text-xs font-medium text-muted-ink">
                  Title
                </Label>
                <Input
                  id="evidence-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What did you learn?"
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- popover form entry point
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="evidence-body" className="text-xs font-medium text-muted-ink">
                  Notes
                </Label>
                <Textarea
                  id="evidence-body"
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  placeholder="Details, quotes, links — markdown works…"
                  className="min-h-20 text-sm"
                />
              </div>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="evidence-url" className="text-xs font-medium text-muted-ink">
                    Source URL
                  </Label>
                  <Input
                    id="evidence-url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="w-20 space-y-1.5">
                  <Label htmlFor="evidence-weight" className="text-xs font-medium text-muted-ink">
                    Weight
                  </Label>
                  <Input
                    id="evidence-weight"
                    type="number"
                    min={1}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!title.trim() || addEvidence.isPending}>
                  Add
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
        ) : null}
      </div>

      <div className="mt-3">
        {evidenceQuery.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-dash px-3 py-5 text-center text-sm text-muted-ink">
            No evidence yet — back this feature with quotes, tickets or metrics.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <EvidenceCard key={item.id} item={item} onDelete={remove} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default EvidenceSection;
