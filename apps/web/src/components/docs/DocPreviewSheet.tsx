import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  DOC_TYPE_COLORS,
  DOC_TYPE_LABELS,
  type DocumentListItem,
} from '@productmap/shared';
import { useDocument } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Button, Skeleton, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, cn } from '@productmap/ui';
import { navigateWithTransition } from '@/lib/transitions';
import { appRoutes } from '@/lib/routes';

interface DocPreviewSheetProps {
  /** List item for the doc being previewed (null closes the sheet). */
  doc: DocumentListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Read-only typography — mirrors the editor's PROSE_CLASSES (Editor.tsx) minus editing affordances. */
const PREVIEW_PROSE_CLASSES = cn(
  'text-[15px] leading-[1.7] text-body-ink',
  '[&_h1]:mt-8 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-ink [&_h1:first-child]:mt-0',
  '[&_h2]:mt-7 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink',
  '[&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-ink',
  '[&_p]:my-3 [&_p]:leading-[1.7]',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_blockquote]:my-4 [&_blockquote]:rounded-r-xl [&_blockquote]:border-l-[3px] [&_blockquote]:border-action [&_blockquote]:bg-[var(--pm-quote)] [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:pr-4 [&_blockquote]:italic [&_blockquote]:text-body-ink',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[var(--pm-code)] [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm',
  '[&_code]:rounded-md [&_code]:bg-[var(--pm-code)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:overflow-hidden [&_table]:rounded-xl',
  '[&_th]:border-b [&_th]:border-line-strong [&_th]:bg-wash [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink',
  '[&_th:first-child]:rounded-tl-xl [&_th:last-child]:rounded-tr-xl',
  '[&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2',
  '[&_tbody_tr:nth-child(even)_td]:bg-[var(--pm-stripe)]',
  '[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:shadow-card',
  '[&_hr]:my-8 [&_hr]:border-line-strong',
  '[&_a]:text-action [&_a]:underline [&_a]:decoration-action/40 [&_a]:underline-offset-2',
);

function PreviewBody({ docId }: { docId: string }) {
  const query = useDocument(docId);

  const html = useMemo(() => {
    if (!query.data) return '';
    const raw = marked.parse(query.data.contentMd ?? '', { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mt-6 rounded-xl bg-panel p-4">
        <p className="text-sm text-body-ink">Couldn't load this doc's content.</p>
        <Button
          variant="outline"
          className="mt-3 rounded-full"
          onClick={() => void query.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn('mt-6', PREVIEW_PROSE_CLASSES)}
      // eslint-disable-next-line react/no-danger -- sanitized via DOMPurify above
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Right-hand 520px preview sheet: doc meta, feature link, sanitized markdown render, open-in-editor. */
export function DocPreviewSheet({ doc, open, onOpenChange }: DocPreviewSheetProps) {
  const navigate = useNavigate();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto rounded-l-2xl sm:max-w-[520px]"
      >
        {doc && (
          <>
            <SheetHeader className="pr-8 text-left">
              <SheetTitle className="font-display text-xl font-bold tracking-tight text-ink">
                {doc.title}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Preview of {doc.title}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span
                  className={cn(
                    'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
                    DOC_TYPE_COLORS[doc.type].chip,
                  )}
                >
                  {DOC_TYPE_LABELS[doc.type]}
                </span>
                <StatusBadge status={doc.status} />
                <Link
                  to={appRoutes.feature(doc.featureId ?? '')}
                  className="rounded-full text-xs font-medium text-body-ink underline-offset-2 outline-none transition-colors duration-150 ease-out hover:text-action hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {doc.featureTitle}
                </Link>
                <Button asChild size="sm" className="ml-auto rounded-full">
                  <Link
                    to={appRoutes.doc(doc.id)}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateWithTransition(() => navigate(appRoutes.doc(doc.id)));
                    }}
                  >
                    Open in editor
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>
            </SheetHeader>
            <PreviewBody docId={doc.id} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default DocPreviewSheet;
