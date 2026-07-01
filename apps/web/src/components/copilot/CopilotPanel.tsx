import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  CalendarOff,
  FileClock,
  Loader2,
  MessageSquareDot,
  Scaling,
  Send,
  Sparkles,
} from 'lucide-react';
import type { CopilotNudge, DocumentListItem } from '@productmap/shared';
import { useAllDocuments, useCopilotNudges, apiPath } from '@/lib/api';
import { useProjectId } from '@/lib/project';
import { appRoutes } from '@/lib/routes';
import { Button, Skeleton, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, cn } from '@productmap/ui';
import { streamSse, STREAM_TIMEOUT_MS } from './sse';

const proseClass =
  'space-y-2 text-sm leading-6 text-body-ink ' +
  '[&_h1]:font-display [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-ink ' +
  '[&_h2]:font-display [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-ink ' +
  '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 ' +
  '[&_a]:text-action [&_a]:underline [&_strong]:text-ink';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The chat model cites docs by exact title in bold (**Title**). Turn those
 * `<strong>Title</strong>` runs into doc links so citations click through.
 * Exported for tests.
 */
export function linkifyDocTitles(
  html: string,
  docs: Pick<DocumentListItem, 'id' | 'title'>[],
): string {
  let out = html;
  for (const doc of docs) {
    if (!doc.title) continue;
    const needle = `<strong>${escapeHtml(doc.title)}</strong>`;
    out = out.split(needle).join(
      `<a href="${appRoutes.doc(doc.id)}" data-doc-link="${doc.id}"><strong>${escapeHtml(doc.title)}</strong></a>`,
    );
  }
  return out;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function AssistantMessage({
  content,
  docs,
  onNavigate,
}: {
  content: string;
  docs: Pick<DocumentListItem, 'id' | 'title'>[];
  onNavigate: (href: string) => void;
}) {
  const html = useMemo(
    () =>
      linkifyDocTitles(
        DOMPurify.sanitize(marked.parse(content, { async: false }) as string, {
          ADD_ATTR: ['data-doc-link'],
        }),
        docs,
      ),
    [content, docs],
  );
  return (
    <div
      className={cn('rounded-2xl bg-surface px-4 py-3 shadow-card', proseClass)}
      onClick={(e) => {
        const anchor = (e.target as HTMLElement).closest('a[data-doc-link]');
        if (anchor instanceof HTMLAnchorElement) {
          e.preventDefault();
          onNavigate(anchor.getAttribute('href') ?? '/');
        }
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ChatTab({ onNavigate }: { onNavigate: (href: string) => void }) {
  const pid = useProjectId();
  const docs = useAllDocuments().data ?? [];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function ask(q: string) {
    setError(null);
    setStreaming(true);
    setMessages((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
    try {
      await streamSse({
        url: apiPath(pid, 'ai', 'chat'),
        body: { question: q },
        signal: controller.signal,
        onText: (text) =>
          setMessages((m) => {
            const next = [...m];
            next[next.length - 1] = { role: 'assistant', content: text };
            return next;
          }),
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError("Couldn't answer that — try again.");
        // drop the empty assistant bubble
        setMessages((m) => (m[m.length - 1]?.content === '' ? m.slice(0, -1) : m));
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setStreaming(false);
    }
  }

  const submit = () => {
    const q = question.trim();
    if (!q || streaming) return;
    setQuestion('');
    void ask(q);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-label="Copilot conversation">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-dash px-3 py-4 text-center text-sm text-muted-ink">
            Ask anything about this workspace — the copilot answers from your
            docs and roadmap, citing the documents it used.
          </p>
        ) : (
          messages.map((m, i) =>
            m.role === 'user' ? (
              <p
                key={i}
                className="ml-8 rounded-2xl bg-action-soft/60 px-4 py-2.5 text-sm text-ink"
              >
                {m.content}
              </p>
            ) : m.content === '' ? (
              <div key={i} className="flex items-center gap-2 px-1 text-xs text-muted-ink">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Thinking…
              </div>
            ) : (
              <AssistantMessage key={i} content={m.content} docs={docs} onNavigate={onNavigate} />
            ),
          )
        )}
        {error ? <p className="px-1 text-sm text-destructive">{error}</p> : null}
        <div ref={endRef} />
      </div>
      <form
        className="mt-3 flex shrink-0 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="Ask the copilot"
          placeholder="Ask about your workspace…"
          className="h-10 flex-1 rounded-full border-0 bg-surface px-4 text-sm text-ink shadow-card outline-none placeholder:text-muted-ink focus-visible:ring-2 focus-visible:ring-action/40"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          aria-label="Send"
          className="h-10 w-10 shrink-0 rounded-full p-0"
          disabled={!question.trim() || streaming}
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}

const NUDGE_META: Record<
  CopilotNudge['kind'],
  { label: string; icon: typeof FileClock }
> = {
  stale_draft: { label: 'Draft untouched for 2+ weeks', icon: FileClock },
  dateless_now: { label: 'Now feature missing dates', icon: CalendarOff },
  oversized: { label: 'Large Now feature with no docs', icon: Scaling },
  stale_thread: { label: 'Thread unresolved for a week', icon: MessageSquareDot },
};

function nudgeHref(nudge: CopilotNudge): string {
  switch (nudge.kind) {
    case 'stale_draft':
      return appRoutes.doc(nudge.documentId);
    case 'dateless_now':
    case 'oversized':
      return appRoutes.feature(nudge.featureId);
    case 'stale_thread':
      return nudge.featureId
        ? appRoutes.feature(nudge.featureId)
        : appRoutes.doc(nudge.documentId ?? '');
  }
}

function NudgesTab({ active, onPick }: { active: boolean; onPick: () => void }) {
  const { data, isLoading } = useCopilotNudges(active);
  const nudges = data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    );
  }
  if (nudges.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-dash px-3 py-4 text-center text-sm text-muted-ink">
        All tidy — nothing needs a nudge right now.
      </p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Nudges">
      {nudges.map((nudge, i) => {
        const meta = NUDGE_META[nudge.kind];
        const Icon = meta.icon;
        return (
          <li key={`${nudge.kind}-${i}`}>
            <Link
              to={nudgeHref(nudge)}
              onClick={onPick}
              className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card outline-none transition-colors duration-150 ease-out hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warm-soft text-warm">
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {nudge.title || 'Untitled'}
                </span>
                <span className="block text-xs text-muted-ink">{meta.label}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export interface CopilotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = 'chat' | 'nudges';

/**
 * Right-side copilot panel (sparkle button in AppShell, ⌘J): workspace-grounded
 * Chat with doc-title citation links, and derived hygiene Nudges.
 */
export function CopilotPanel({ open, onOpenChange }: CopilotPanelProps) {
  const [tab, setTab] = useState<Tab>('chat');
  const navigate = useNavigate();

  const go = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden bg-panel sm:w-[440px] sm:max-w-[440px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2 font-display text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-action shadow-card">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            Copilot
          </SheetTitle>
          <SheetDescription className="sr-only">
            Workspace copilot — chat and nudges
          </SheetDescription>
        </SheetHeader>
        <div role="tablist" aria-label="Copilot tabs" className="mt-3 flex shrink-0 gap-1.5">
          {(
            [
              ['chat', 'Chat'],
              ['nudges', 'Nudges'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
                tab === value
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-body-ink hover:bg-surface/60 hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-4 min-h-0 flex-1 overflow-y-auto pb-1">
          {tab === 'chat' ? (
            <ChatTab onNavigate={go} />
          ) : (
            <NudgesTab active={open && tab === 'nudges'} onPick={() => onOpenChange(false)} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default CopilotPanel;
