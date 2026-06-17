import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Archive, PenLine, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { IdeaStatus, IdeaWithVotes } from '@productmap/shared';
import { useCreatePitch, useDocument, useUpdateIdea } from '@/lib/api';
import { useCanEdit } from '@/lib/project';
import { countWords } from '@/components/editor/word-count';
import { DocTypeChip } from '@/components/DocTypeChip';
import { StatusBadge } from '@/components/StatusBadge';
import { UserAvatar } from '@/components/UserAvatar';
import { IdeaVotePills } from '@/components/inbox/IdeaVotePills';
import { timeAgoShort } from '@/components/inbox/time-ago';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_LABELS: Record<IdeaStatus, string> = {
  inbox: 'Inbox',
  triaged: 'Triaged',
  promoted: 'Promoted',
  archived: 'Archived',
};

/** Statuses pickable from the detail select — promotion goes through the promote flow. */
const SELECTABLE_STATUSES: IdeaStatus[] = ['inbox', 'triaged', 'archived'];

/** "by Priya · 3d ago" — creator avatar + relative capture time. */
export function IdeaByline({
  idea,
  className,
}: {
  idea: Pick<IdeaWithVotes, 'creator' | 'createdAt'>;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-1.5 text-xs text-muted-ink ${className ?? ''}`}>
      {idea.creator ? <UserAvatar user={idea.creator} size="sm" /> : null}
      <span>
        {idea.creator ? `by ${idea.creator.name} · ` : ''}
        {timeAgoShort(idea.createdAt)}
      </span>
    </span>
  );
}

/** Pitch block: doc card when the idea has a pitch, otherwise the create button. */
function PitchBlock({ idea }: { idea: IdeaWithVotes }) {
  const navigate = useNavigate();
  const createPitch = useCreatePitch();
  const pitch = idea.pitchDoc;
  // Full doc fetch drives the word count on the card (meta carries none) and
  // doubles as a prefetch so opening the editor feels instant.
  const docQuery = useDocument(pitch?.id ?? '');
  const words = docQuery.data ? countWords(docQuery.data.contentJson) : null;

  if (!pitch) {
    return (
      <Button
        variant="outline"
        className="rounded-full"
        disabled={createPitch.isPending}
        onClick={() =>
          createPitch.mutate(idea.id, {
            onSuccess: (doc) => navigate(`/docs/${doc.id}`),
            onError: () => toast.error("Couldn't create the pitch doc"),
          })
        }
      >
        <PenLine className="h-4 w-4" aria-hidden />
        Write the pitch
      </Button>
    );
  }

  return (
    <Link
      to={`/docs/${pitch.id}`}
      aria-label={`Open pitch: ${pitch.title}`}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm-card transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
        {pitch.title}
      </span>
      <DocTypeChip type="idea_pitch" />
      <StatusBadge status={pitch.status} />
      {words !== null ? (
        <span className="whitespace-nowrap text-xs text-muted-ink">
          {words.toLocaleString()} word{words === 1 ? '' : 's'}
        </span>
      ) : null}
    </Link>
  );
}

interface IdeaDetailPaneProps {
  idea: IdeaWithVotes;
  /** Opens the promote dialog (owned by the route). */
  onPromote: () => void;
}

/** Right-hand detail pane: editable title/source/status, byline, pitch block, quick summary. */
export function IdeaDetailPane({ idea, onPromote }: IdeaDetailPaneProps) {
  const updateIdea = useUpdateIdea();
  const canEdit = useCanEdit();
  const [draftTitle, setDraftTitle] = useState(idea.title);
  const [draftSource, setDraftSource] = useState(idea.source);
  const [draftBody, setDraftBody] = useState(idea.bodyMd);

  useEffect(() => {
    setDraftTitle(idea.title);
    setDraftSource(idea.source);
    setDraftBody(idea.bodyMd);
  }, [idea.id, idea.title, idea.source, idea.bodyMd]);

  const save = (patch: { title?: string; source?: string; bodyMd?: string }, label: string) => {
    updateIdea.mutate(
      { id: idea.id, ...patch },
      { onError: () => toast.error(`Couldn't save the ${label}`) },
    );
  };

  const setStatus = (status: IdeaStatus, errorLabel: string) => {
    updateIdea.mutate(
      { id: idea.id, status },
      { onError: () => toast.error(`Couldn't ${errorLabel} '${idea.title}'`) },
    );
  };

  return (
    <section className="self-start rounded-2xl bg-panel p-6" aria-label="Idea detail">
      <div className="flex items-start justify-between gap-4">
        <input
          aria-label="Idea title"
          readOnly={!canEdit}
          className="min-w-0 flex-1 rounded-xl border-0 bg-transparent px-2 py-1 -mx-2 font-display text-lg font-semibold text-ink outline-none transition-colors duration-150 ease-out hover:bg-surface/60 focus-visible:ring-2 focus-visible:ring-ring"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => {
            const next = draftTitle.trim();
            if (next && next !== idea.title) save({ title: next }, 'title');
            else setDraftTitle(idea.title);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setDraftTitle(idea.title);
          }}
        />
        {idea.status === 'promoted' ? (
          <span className="inline-flex items-center rounded-full bg-sage-soft px-2 py-0.5 text-xs font-medium text-sage">
            Promoted
          </span>
        ) : (
          <Select
            value={idea.status}
            disabled={!canEdit}
            onValueChange={(v) => setStatus(v as IdeaStatus, 'update')}
          >
            <SelectTrigger
              className="w-28 shrink-0 rounded-full border-transparent bg-surface text-xs font-medium text-body-ink shadow-none"
              aria-label="Idea status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECTABLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="mt-2">
        <IdeaByline idea={idea} />
      </div>

      <div className="mt-4">
        <IdeaVotePills idea={idea} size="full" />
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="idea-source">Source</Label>
        <Input
          id="idea-source"
          readOnly={!canEdit}
          value={draftSource}
          placeholder="sales call, support ticket, hallway chat…"
          onChange={(e) => setDraftSource(e.target.value)}
          onBlur={() => {
            const next = draftSource.trim();
            if (next !== idea.source) save({ source: next }, 'source');
          }}
        />
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-medium text-ink">Pitch</p>
        <PitchBlock idea={idea} />
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="idea-summary">Quick summary</Label>
        <Textarea
          id="idea-summary"
          readOnly={!canEdit}
          value={draftBody}
          placeholder="One or two lines on what this is — the pitch doc carries the full story."
          className="min-h-24 rounded-xl text-sm leading-6"
          onChange={(e) => setDraftBody(e.target.value)}
          onBlur={() => {
            if (draftBody !== idea.bodyMd) save({ bodyMd: draftBody }, 'summary');
          }}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {idea.status === 'promoted' && idea.promotedFeatureId ? (
          <Button asChild variant="outline" className="rounded-full">
            <Link to={`/features/${idea.promotedFeatureId}`}>
              <ArrowUpRight className="h-4 w-4" aria-hidden />
              View feature
            </Link>
          </Button>
        ) : null}
        {canEdit && (idea.status === 'inbox' || idea.status === 'triaged') ? (
          <>
            <Button className="rounded-full" onClick={onPromote}>
              <ArrowUpRight className="h-4 w-4" aria-hidden />
              Promote to feature
            </Button>
            {idea.status === 'inbox' ? (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setStatus('triaged', 'triage')}
              >
                Mark triaged
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => setStatus('archived', 'archive')}
            >
              <Archive className="h-4 w-4" aria-hidden />
              Archive
            </Button>
          </>
        ) : null}
        {canEdit && idea.status === 'archived' ? (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => setStatus('inbox', 'restore')}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Restore to inbox
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export default IdeaDetailPane;
