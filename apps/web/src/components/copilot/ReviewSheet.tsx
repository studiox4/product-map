import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@productmap/ui';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@productmap/ui';
import { streamSse, STREAM_TIMEOUT_MS } from './sse';
import { apiPath } from '@/lib/api';
import { useProjectId } from '@/lib/project';

const proseClass =
  'space-y-2 text-sm leading-6 text-body-ink ' +
  '[&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-ink ' +
  '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 ' +
  '[&_code]:rounded [&_code]:bg-inset [&_code]:px-1 [&_code]:text-xs [&_strong]:text-ink';

export interface ReviewSheetProps {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "AI review" side sheet: streams a rubric review of the doc (problem clarity,
 * metrics, testable requirements, non-goals, risks) over SSE. A fresh review
 * starts every time the sheet opens.
 */
export function ReviewSheet({ documentId, open, onOpenChange }: ReviewSheetProps) {
  const pid = useProjectId();
  const [markdown, setMarkdown] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function start() {
    abortRef.current?.abort();
    setMarkdown('');
    setError(null);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
    try {
      await streamSse({
        url: apiPath(pid, 'ai', 'review-doc'),
        body: { documentId },
        signal: controller.signal,
        onText: setMarkdown,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError("Couldn't review this document — try again.");
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setStreaming(false);
    }
  }

  useEffect(() => {
    if (open) void start();
    return () => abortRef.current?.abort();
    // restart a fresh review on every open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  const html = useMemo(
    () =>
      markdown
        ? DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string)
        : '',
    [markdown],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto bg-panel sm:w-[480px] sm:max-w-[480px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-action shadow-card">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            AI review
            {streaming ? (
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-surface/70 px-3 py-1 text-xs font-medium text-muted-ink">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Reviewing…
              </span>
            ) : null}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Streaming rubric review of this document
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {error ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void start()}>
                Retry
              </Button>
            </div>
          ) : markdown ? (
            <div
              data-testid="review-content"
              className={proseClass}
              // Sanitized with DOMPurify above.
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : streaming ? (
            <p className="text-sm text-muted-ink">
              Reading the document against the rubric…
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ReviewSheet;
