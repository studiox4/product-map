import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  };

  return (
    <form
      className={cn('rounded-2xl bg-surface p-3 shadow-card', className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        aria-label={placeholder}
        placeholder={placeholder}
        rows={2}
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
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
  );
}

export default CommentComposer;
