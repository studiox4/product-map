import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, CalendarDays, FileText, Plus, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { DOC_STATUS_COLORS, type Feature } from '@productmap/shared';
import {
  useCreateReleaseNotesDoc,
  useDocument,
  useFeatures,
  useGenerateReleaseNotes,
  useRelease,
  useSetReleaseFeatures,
  type ReleaseDetail as ReleaseDetailData,
} from '@/lib/api';
import { cn } from '@productmap/ui/lib/utils';
import { appRoutes } from '@/lib/routes';
import { Button } from '@productmap/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@productmap/ui';
import { Skeleton } from '@productmap/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@productmap/ui';
import DocTypeChip from '@/components/DocTypeChip';
import HorizonBadge from '@/components/HorizonBadge';
import StatusBadge from '@/components/StatusBadge';
import { ReleaseStatusSelect } from './ReleaseStatusSelect';

function wordCount(md: string): number {
  const words = md.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Member rows + remove ✕ + "Add features" popover checklist (replace-set PUT). */
function FeaturesSection({ release }: { release: ReleaseDetailData }) {
  const { data: allFeatures } = useFeatures();
  const setFeatures = useSetReleaseFeatures();

  const [addOpen, setAddOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const memberIds = release.features.map((f) => f.id);
  // Candidates: features not bundled into any release yet.
  const candidates = (allFeatures ?? []).filter((f) => f.releaseId === null);

  const openAdd = (open: boolean) => {
    if (open) setDraftIds([]);
    setAddOpen(open);
  };

  const toggleDraft = (id: string) => {
    setDraftIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const save = (featureIds: string[], onSuccess?: () => void) => {
    setFeatures.mutate(
      { releaseId: release.id, featureIds },
      {
        onSuccess,
        onError: () => toast.error(`Couldn't update features for '${release.name}'`),
      },
    );
  };

  const addSelected = () => save([...memberIds, ...draftIds], () => setAddOpen(false));
  const remove = (feature: Feature) =>
    save(memberIds.filter((id) => id !== feature.id));

  return (
    <section className="space-y-3" aria-label="Features">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-base font-semibold text-ink">Features</h2>
        <Popover open={addOpen} onOpenChange={openAdd}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto rounded-full">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add features
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 rounded-xl p-3">
            <p className="text-xs font-medium text-muted-ink">Unassigned features</p>
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
              {candidates.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-body-ink transition-colors duration-150 ease-out hover:bg-panel">
                    <input
                      type="checkbox"
                      checked={draftIds.includes(f.id)}
                      onChange={() => toggleDraft(f.id)}
                      className="h-3.5 w-3.5 accent-[var(--pm-action,currentColor)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    <HorizonBadge horizon={f.horizon} />
                  </label>
                </li>
              ))}
              {candidates.length === 0 ? (
                <li className="px-2 py-1.5 text-sm text-muted-ink">
                  Every feature is already in a release.
                </li>
              ) : null}
            </ul>
            <div className="mt-2 flex justify-end gap-2 border-t border-line pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={draftIds.length === 0 || setFeatures.isPending}
                onClick={addSelected}
              >
                Add
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {release.features.length === 0 ? (
        <p className="rounded-2xl border border-transparent bg-surface p-6 text-sm text-muted-ink shadow-card">
          No features in this release yet — add some with the button above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-transparent bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-muted-ink">
                <th className="px-4 py-2.5 font-medium">Feature</th>
                <th className="px-4 py-2.5 font-medium">Horizon</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {release.features.map((feature) => (
                <tr key={feature.id} className="transition-colors duration-150 hover:bg-wash/60">
                  <td className="px-4 py-3">
                    <Link
                      to={appRoutes.feature(feature.id)}
                      className="font-medium text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {feature.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <HorizonBadge horizon={feature.horizon} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={feature.status} />
                  </td>
                  <td className="px-4 py-3">
                    {feature.size ? (
                      <span className="inline-flex items-center rounded-full bg-wash px-2 py-0.5 text-xs font-medium uppercase text-body-ink">
                        {feature.size}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-ink">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-muted-ink hover:text-ink"
                      aria-label={`Remove ${feature.title} from release`}
                      disabled={setFeatures.isPending}
                      onClick={() => remove(feature)}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Notes doc card / create / generate-draft-with-confirm (dream tier 2 §4). */
function NotesSection({ release }: { release: ReleaseDetailData }) {
  const navigate = useNavigate();
  const createNotesDoc = useCreateReleaseNotesDoc();
  const generateNotes = useGenerateReleaseNotes();
  const docQuery = useDocument(release.notesDocId ?? '');

  const [confirmOpen, setConfirmOpen] = useState(false);

  const create = () => {
    if (createNotesDoc.isPending) return;
    createNotesDoc.mutate(release.id, {
      onSuccess: (doc) => navigate(appRoutes.doc(doc.id)),
      onError: () => toast.error(`Couldn't create notes for '${release.name}'`),
    });
  };

  const generate = () => {
    if (generateNotes.isPending) return;
    generateNotes.mutate(release.id, {
      onSuccess: (doc) => {
        setConfirmOpen(false);
        navigate(appRoutes.doc(doc.id));
      },
      onError: () => toast.error(`Couldn't assemble notes for '${release.name}'`),
    });
  };

  const doc = docQuery.data;

  return (
    <section className="space-y-3" aria-label="Release notes">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-base font-semibold text-ink">Release notes</h2>
        {release.notesDocId ? (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto rounded-full"
            onClick={() => setConfirmOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Generate draft from features
          </Button>
        ) : null}
      </div>

      {!release.notesDocId ? (
        <div className="rounded-2xl border border-dashed border-line bg-wash/50 p-6 text-center">
          <p className="text-sm text-muted-ink">
            No notes yet — write them as a full doc in the editor.
          </p>
          <Button
            className="mt-4 rounded-full"
            onClick={create}
            disabled={createNotesDoc.isPending}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Create notes doc
          </Button>
        </div>
      ) : doc ? (
        <Link
          to={appRoutes.doc(doc.id)}
          className="flex items-center gap-3 rounded-2xl border border-transparent bg-surface px-5 py-4 shadow-card outline-none transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{doc.title}</span>
          <DocTypeChip type={doc.type} />
          <span
            className={cn(
              'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize',
              DOC_STATUS_COLORS[doc.status],
            )}
          >
            {doc.status.replace('_', ' ')}
          </span>
          <span className="whitespace-nowrap text-xs text-muted-ink">
            {wordCount(doc.contentMd)} words
          </span>
        </Link>
      ) : (
        <Skeleton className="h-[60px] rounded-2xl" />
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate draft from features?</DialogTitle>
            <DialogDescription>
              This assembles a draft from this release's features and their final docs,
              overwriting the current notes doc body.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={generate}
              disabled={generateNotes.isPending}
            >
              Generate draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** /releases/:id — membership management, notes doc, status select (dream tier 2 §4/5/7). */
export default function ReleaseDetail() {
  const { id = '' } = useParams();
  const releaseQuery = useRelease(id);
  const release = releaseQuery.data;

  if (releaseQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!release) {
    return (
      <div className="rounded-2xl border border-transparent bg-surface p-10 text-center shadow-card">
        <p className="text-sm text-body-ink">Release not found.</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to={appRoutes.releases}>Back to releases</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={appRoutes.releases}
          className="inline-flex items-center gap-1 text-sm text-muted-ink outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Releases
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            {release.name}
          </h1>
          <ReleaseStatusSelect release={release} />
          {release.targetDate ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted-ink">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {format(new Date(`${release.targetDate}T00:00:00`), 'MMM d, yyyy')}
            </span>
          ) : null}
        </div>
      </div>

      <FeaturesSection release={release} />
      <NotesSection release={release} />
    </div>
  );
}
