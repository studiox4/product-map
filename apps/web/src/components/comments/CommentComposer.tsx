import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@productmap/ui';
import { cn } from '@productmap/ui/lib/utils';
import { useProjectId } from '@/lib/project';
import { useProjectMembers } from '@/lib/api';
import { activeMentionQuery, insertMentionToken } from '@/lib/mentions';

export interface CommentComposerProps {
  onSubmit: (body: string) => void;
  placeholder?: string;
  submitLabel?: string;
  /** Prefill (edit mode). */
  initialValue?: string;
  autoFocus?: boolean;
  pending?: boolean;
  onCancel?: () => void;
  className?: string;
}

/** Rounded-2xl comment card with an autosizing textarea. Cmd/Ctrl+Enter submits. */
export function CommentComposer({
  onSubmit,
  placeholder = 'Add a comment…',
  submitLabel = 'Comment',
  initialValue = '',
  autoFocus = false,
  pending = false,
  onCancel,
  className,
}: CommentComposerProps) {
  const [body, setBody] = useState(initialValue);
  const [caret, setCaret] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pid = useProjectId();
  const { data: members = [] } = useProjectMembers(pid);

  const query = activeMentionQuery(body, caret);
  const matches = query !== null
    ? members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  // Reset highlight when matches change
  useEffect(() => {
    setHighlightIndex(0);
  }, [matches.length, query]);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [body, resize]);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    onSubmit(trimmed);
    setBody('');
    setCaret(0);
  };

  const pick = (m: { userId: string; name: string }) => {
    const res = insertMentionToken(body, caret, m);
    if (!res) return;
    setBody(res.next);
    // restore focus + caret after render
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(res.caret, res.caret);
        setCaret(res.caret);
      }
    });
  };

  const updateCaret = (el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart ?? 0);
  };

  return (
    <div className={cn('relative', className)}>
      <form
        className="rounded-2xl bg-surface p-3 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches.length === 0) submit();
        }}
      >
        <textarea
          ref={textareaRef}
          aria-label={placeholder}
          placeholder={placeholder}
          rows={2}
          value={body}
          autoFocus={autoFocus}
          onChange={(e) => {
            setBody(e.target.value);
            setCaret(e.target.selectionStart ?? 0);
          }}
          onKeyUp={(e) => updateCaret(e.currentTarget)}
          onClick={(e) => updateCaret(e.currentTarget)}
          onSelect={(e) => updateCaret(e.currentTarget)}
          onKeyDown={(e) => {
            if (matches.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightIndex((i) => Math.min(i + 1, matches.length - 1));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                pick(matches[highlightIndex]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                // force-close by blurring caret awareness — move caret back to collapse query
                // Simplest: clear caret so query becomes null
                setCaret(0);
                return;
              }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape' && onCancel) onCancel();
          }}
          className="w-full resize-none bg-transparent px-1 py-0.5 text-sm text-body-ink outline-none placeholder:text-muted-ink"
        />
        <div className="mt-1 flex items-center justify-end gap-2">
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-ink"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : null}
          <Button
            type="submit"
            size="sm"
            className="rounded-full"
            disabled={!body.trim() || pending}
          >
            {submitLabel}
          </Button>
        </div>
      </form>

      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="mention suggestions"
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          {matches.map((m, i) => (
            <li
              key={m.userId}
              role="option"
              aria-selected={i === highlightIndex}
              onMouseDown={(e) => {
                // prevent blur before click
                e.preventDefault();
                pick(m);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                i === highlightIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: m.color }}
              >
                {m.name[0]}
              </span>
              <span>{m.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CommentComposer;
