import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useDocument } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { DocTypeChip } from '@/components/DocTypeChip';
import { Button } from '@productmap/ui';
import { Skeleton } from '@productmap/ui';
import { CONTENT_EXTENSIONS, PROSE_CLASSES } from './Editor';
import { coverCss } from './CoverPicker';
import { formatReadingMeta } from './EditorToolbar';
import { countWords } from './word-count';

/**
 * Reader view (spec 2.3): print-beautiful, chrome-free render of a doc.
 * Same Schibsted type, generous measure, cover band, and clean print output.
 */
export default function ReaderView() {
  const { id = '' } = useParams<{ id: string }>();
  const docQuery = useDocument(id);
  const doc = docQuery.data;

  const editor = useEditor(
    {
      extensions: CONTENT_EXTENSIONS,
      content: (doc?.contentJson as object) ?? undefined,
      editable: false,
      editorProps: {
        attributes: { 'aria-label': 'Document content', role: 'article' },
      },
    },
    [doc?.id, doc?.contentJson],
  );

  const wordCount = useMemo(
    () => (doc ? countWords(doc.contentJson) : 0),
    [doc],
  );

  if (docQuery.isLoading || (doc && !editor)) {
    return (
      <main className="mx-auto w-full max-w-[760px] px-6 py-12">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="mt-8 h-10 w-2/3" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </main>
    );
  }

  if (docQuery.isError || !doc) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-12">
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <p className="text-sm text-body-ink">Couldn't load this document.</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => void docQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </main>
    );
  }

  const cover = coverCss(doc.cover);

  return (
    <div className="min-h-screen print:min-h-0">
      {/* Print: white page, no app gradient (body carries the field gradient). */}
      <style>{`@media print { body { background: #fff !important; } }`}</style>

      <header className="mx-auto flex w-full max-w-[760px] items-center justify-between px-6 pt-6 print:hidden">
        <Link
          to={appRoutes.doc(doc.id)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-ink transition-colors duration-150 ease-out hover:bg-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to editor
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full text-body-ink"
          onClick={() => window.print()}
        >
          <Printer className="mr-1 h-4 w-4" aria-hidden />
          Print
        </Button>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-4 print:max-w-none print:px-0 print:pt-0">
        <article className="overflow-hidden rounded-2xl bg-surface shadow-card print:rounded-none print:shadow-none">
          {cover ? (
            <div
              aria-hidden
              data-testid="reader-cover"
              className="h-36 w-full sm:h-44 print:h-24"
              style={{ background: cover }}
            />
          ) : null}
          <div className="px-8 py-12 sm:px-14 print:px-0 print:py-6">
            <div className="flex items-center gap-3">
              <DocTypeChip type={doc.type} />
              <span className="text-xs text-muted-ink">
                {formatReadingMeta(wordCount)}
              </span>
            </div>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              {doc.title}
            </h1>
            <div className="mt-8 text-[17px] leading-[1.75]">
              <EditorContent editor={editor} className={PROSE_CLASSES} />
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
