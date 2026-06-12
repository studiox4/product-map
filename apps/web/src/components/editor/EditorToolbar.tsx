import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { DOC_STATUSES, type DocStatus } from '@productmap/shared';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AutosaveState } from './useAutosave';
import { CoverPicker } from './CoverPicker';

const STATUS_LABELS: Record<DocStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  final: 'Final',
};

export interface EditorToolbarProps {
  backHref: string;
  /** Feature title shown next to the back arrow. */
  backLabel: string;
  title: string;
  onRenameTitle: (title: string) => void;
  /** DocTypeChip element, injected by the route (3A owns the component). */
  typeChip?: ReactNode;
  status: DocStatus;
  onStatusChange: (status: DocStatus) => void;
  saveState: AutosaveState;
  exportHref: string;
  /** Unresolved comment thread count for the badge (comments pill renders when onToggleComments is set). */
  commentCount?: number;
  onToggleComments?: () => void;
  /** view-transition-name for the title (morph pair with the docs table row title). */
  titleTransitionName?: string;
  /** Word count for the meta line (reading time derived at ~200wpm). */
  wordCount?: number;
  /** Current cover gradient key (null = none). */
  cover?: string | null;
  onCoverChange?: (cover: string | null) => void;
  /** Reader view route for this doc (renders the ⋯ menu entry). */
  readerHref?: string;
  /** Opens the AI review sheet (⋯ menu entry; omit when AI is disabled). */
  onAiReview?: () => void;
}

/** "1,240 words · 6 min read" at ~200 wpm; minimum 1 min when non-empty. */
export function formatReadingMeta(wordCount: number): string {
  const words = `${wordCount.toLocaleString()} word${wordCount === 1 ? '' : 's'}`;
  if (wordCount === 0) return words;
  const minutes = Math.max(1, Math.round(wordCount / 200));
  return `${words} · ${minutes} min read`;
}

function SaveIndicator({ state }: { state: AutosaveState }) {
  if (state === 'saving') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-ink">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-xs font-medium text-sage">
        <Check className="h-3 w-3" aria-hidden />
        Saved
      </span>
    );
  }
  return null;
}

export function EditorToolbar({
  backHref,
  backLabel,
  title,
  onRenameTitle,
  typeChip,
  status,
  onStatusChange,
  saveState,
  exportHref,
  commentCount = 0,
  onToggleComments,
  titleTransitionName,
  wordCount,
  cover,
  onCoverChange,
  readerHref,
  onAiReview,
}: EditorToolbarProps) {
  const [draftTitle, setDraftTitle] = useState(title);
  useEffect(() => setDraftTitle(title), [title]);

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-transparent bg-surface px-3 py-2 shadow-card">
        <Link
          to={backHref}
          title={backLabel}
          className="flex max-w-[220px] shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-ink transition-colors duration-150 ease-out hover:bg-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{backLabel}</span>
        </Link>
        <input
          aria-label="Document title"
          title={draftTitle}
          style={
            titleTransitionName
              ? ({ viewTransitionName: titleTransitionName } as CSSProperties)
              : undefined
          }
          className="min-w-[240px] flex-1 rounded-full border-0 bg-transparent px-3 py-1 font-display text-2xl font-semibold leading-tight text-ink outline-none transition-colors duration-150 ease-out hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => {
            const next = draftTitle.trim();
            if (next && next !== title) onRenameTitle(next);
            else setDraftTitle(title);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setDraftTitle(title);
          }}
        />
        {typeChip}
        <Select value={status} onValueChange={(v) => onStatusChange(v as DocStatus)}>
          <SelectTrigger
            className="w-32 shrink-0 rounded-full border-transparent bg-secondary text-xs font-medium text-action shadow-none hover:bg-action-soft/60"
            aria-label="Document status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SaveIndicator state={saveState} />
        {onToggleComments ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={
              commentCount > 0 ? `Comments (${commentCount} unresolved)` : 'Comments'
            }
            className="shrink-0 rounded-full text-body-ink"
            onClick={onToggleComments}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {commentCount > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warm-soft px-1 text-[10px] font-semibold leading-none text-warm">
                {commentCount}
              </span>
            ) : null}
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm" className="shrink-0 text-body-ink">
          <a href={exportHref} download>
            <Download className="mr-1 h-4 w-4" aria-hidden />
            Export .md
          </a>
        </Button>
        {readerHref || onCoverChange || onAiReview ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="More options"
                className="shrink-0 rounded-full text-body-ink"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {onAiReview ? (
                <DropdownMenuItem onSelect={onAiReview}>
                  <Sparkles className="mr-2 h-4 w-4 text-action" aria-hidden />
                  AI review
                </DropdownMenuItem>
              ) : null}
              {onAiReview && (readerHref || onCoverChange) ? (
                <DropdownMenuSeparator />
              ) : null}
              {readerHref ? (
                <DropdownMenuItem asChild>
                  <Link to={readerHref}>
                    <BookOpen className="mr-2 h-4 w-4" aria-hidden />
                    Reader view
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {readerHref && onCoverChange ? <DropdownMenuSeparator /> : null}
              {onCoverChange ? (
                <>
                  <DropdownMenuLabel className="text-xs font-medium text-muted-ink">
                    Cover
                  </DropdownMenuLabel>
                  <CoverPicker value={cover ?? null} onChange={onCoverChange} />
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {typeof wordCount === 'number' ? (
        <p className="mt-2 px-4 text-xs text-muted-ink">
          {formatReadingMeta(wordCount)}
        </p>
      ) : null}
      {saveState === 'error' ? (
        <div
          role="alert"
          className="mt-3 flex w-fit items-center gap-2 rounded-full bg-warm-soft px-4 py-1.5 text-sm font-medium text-warm shadow-card"
        >
          <TriangleAlert className="h-4 w-4" aria-hidden />
          Unsaved changes — retrying…
        </div>
      ) : null}
    </div>
  );
}
