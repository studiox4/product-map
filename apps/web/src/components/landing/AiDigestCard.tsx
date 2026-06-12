import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Sparkles } from 'lucide-react';
import { useAiStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';

const STREAM_TIMEOUT_MS = 30_000;

/** sessionStorage key for today's cached digest (refreshes daily). */
export function digestCacheKey(now: Date = new Date()): string {
  return `pmDigest:${format(now, 'yyyy-MM-dd')}`;
}

function readCache(): string | null {
  try {
    return sessionStorage.getItem(digestCacheKey());
  } catch {
    return null;
  }
}

function writeCache(markdown: string) {
  try {
    sessionStorage.setItem(digestCacheKey(), markdown);
  } catch {
    // private mode etc. — digest simply regenerates next visit
  }
}

/** Parses an SSE buffer; returns parsed events and the unconsumed remainder. */
function parseSse(buffer: string): {
  events: { event: string; data: string }[];
  rest: string;
} {
  const events: { event: string; data: string }[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    events.push({ event, data: dataLines.join('\n') });
  }
  return { events, rest };
}

const proseClass =
  'space-y-2 text-sm leading-6 text-body-ink ' +
  '[&_h1]:font-display [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-ink ' +
  '[&_h2]:font-display [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-ink ' +
  '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 ' +
  '[&_a]:text-action [&_a]:underline [&_strong]:text-ink';

/**
 * "This week in ProductMap" — streams a ~120-word digest of the last 7 days
 * of activity over the existing AI SSE pipeline. Cached in sessionStorage for
 * the day; renders nothing when AI is disabled (no key).
 */
export function AiDigestCard() {
  const aiStatus = useAiStatus();
  const enabled = aiStatus.data?.enabled === true;
  const [markdown, setMarkdown] = useState<string>(() => readCache() ?? '');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  async function start() {
    setError(null);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

    let text = '';
    try {
      const res = await fetch('/api/ai/digest', {
        method: 'POST',
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`digest failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSse(buffer);
        buffer = rest;
        for (const e of events) {
          if (e.event === 'chunk') {
            try {
              const { text: chunk } = JSON.parse(e.data) as { text: string };
              text += chunk;
              setMarkdown(text);
            } catch {
              // skip malformed chunk
            }
          } else if (e.event === 'done') {
            writeCache(text);
          } else if (e.event === 'error') {
            throw new Error('generation_failed');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError("Couldn't write this week's digest — try again.");
      }
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  }

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    if (readCache() === null) void start();
    return () => {
      // Abort the in-flight stream on unmount; reset the guard so a
      // StrictMode remount (or future remount) restarts the stream.
      abortRef.current?.abort();
      startedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const html = useMemo(
    () =>
      markdown
        ? DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string)
        : '',
    [markdown],
  );

  if (!enabled) return null;

  return (
    <section
      data-testid="ai-digest-card"
      className="rounded-2xl border border-transparent bg-action-soft/45 p-5 shadow-card"
    >
      <div className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-action shadow-card">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        This week in ProductMap
        {streaming ? (
          <span className="ml-auto rounded-full bg-surface/70 px-3 py-1 text-xs font-medium text-muted-ink">
            Writing…
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void start()}>
            Retry
          </Button>
        </div>
      ) : (
        <div
          className={`mt-3 ${proseClass}`}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </section>
  );
}

export default AiDigestCard;
