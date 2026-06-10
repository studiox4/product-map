import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Download, Loader2, TriangleAlert } from 'lucide-react';
import { DOC_STATUSES, type DocStatus } from '@productmap/shared';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AutosaveState } from './useAutosave';

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
}

function SaveIndicator({ state }: { state: AutosaveState }) {
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Check className="h-3 w-3 text-green-600" aria-hidden />
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
}: EditorToolbarProps) {
  const [draftTitle, setDraftTitle] = useState(title);
  useEffect(() => setDraftTitle(title), [title]);

  return (
    <div className="border-b bg-background">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-6 py-3">
        <Link
          to={backHref}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>
        <input
          aria-label="Document title"
          className="min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 py-1 text-lg font-semibold text-foreground outline-none transition-colors duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
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
          <SelectTrigger className="w-32" aria-label="Document status">
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
        <Button asChild variant="outline" size="sm">
          <a href={exportHref} download>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Export .md
          </a>
        </Button>
      </div>
      {saveState === 'error' ? (
        <div
          role="alert"
          className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800"
        >
          <TriangleAlert className="h-4 w-4" aria-hidden />
          Unsaved changes — retrying…
        </div>
      ) : null}
    </div>
  );
}
