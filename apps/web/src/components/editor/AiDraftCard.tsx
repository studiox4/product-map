import { useEffect, useRef, useState } from 'react';
import { Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { DocType } from '@productmap/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const STREAM_TIMEOUT_MS = 30_000;

export interface AiDraftCardProps {
  featureId: string;
  docType: DocType;
  /** Called with the cumulative markdown after every SSE chunk. */
  onMarkdown: (markdown: string) => void;
  /** Called with the final markdown when the stream completes. */
  onDone: (markdown: string) => void;
  onStreamingChange: (streaming: boolean) => void;
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

export function AiDraftCard({
  featureId,
  docType,
  onMarkdown,
  onDone,
  onStreamingChange,
}: AiDraftCardProps) {
  const [brief, setBrief] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const setStreamingState = (v: boolean) => {
    setStreaming(v);
    onStreamingChange(v);
  };

  async function start() {
    if (!brief.trim() || streaming) return;
    setError(null);
    setStreamingState(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => {
      controller.abort();
      toast.error('Drafting timed out — partial draft kept', {
        action: { label: 'Retry', onClick: () => void start() },
      });
    }, STREAM_TIMEOUT_MS);

    let markdown = '';
    try {
      const res = await fetch('/api/ai/generate-doc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docType, featureId, brief: brief.trim() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`generate-doc failed (${res.status})`);
      }
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
              const { text } = JSON.parse(e.data) as { text: string };
              markdown += text;
              onMarkdown(markdown);
            } catch {
              // skip malformed chunk
            }
          } else if (e.event === 'done') {
            onDone(markdown);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // partial content already in the editor — keep it
      } else {
        setError("Couldn't draft this document — try again.");
        toast.error("Couldn't draft this document", {
          action: { label: 'Retry', onClick: () => void start() },
        });
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setStreamingState(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
        <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden />
        Draft this document with AI
      </div>
      <Textarea
        className="mt-3"
        rows={3}
        placeholder="Describe the feature in a sentence or two"
        value={brief}
        disabled={streaming}
        onChange={(e) => setBrief(e.target.value)}
      />
      {error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        {streaming ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => abortRef.current?.abort()}
          >
            <Square className="mr-2 h-3 w-3" aria-hidden />
            Stop
          </Button>
        ) : (
          <Button type="button" disabled={!brief.trim()} onClick={() => void start()}>
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
            Draft with AI
          </Button>
        )}
        {streaming ? (
          <span className="text-sm text-muted-foreground">Drafting…</span>
        ) : null}
      </div>
    </div>
  );
}
