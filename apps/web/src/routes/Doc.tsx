import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { DocStatus } from '@productmap/shared';
import {
  apiPath,
  useAiStatus,
  useComments,
  useDocument,
  useFeature,
  useIdea,
  useUpdateDocument,
} from '@/lib/api';
import { useProjectId } from '@/lib/project';
import { demoReady } from '@/demo/demoState';
import { appRoutes } from '@/lib/routes';
import { docBackLink } from './doc-back-link';
import { DocTypeChip } from '@/components/DocTypeChip';
import { Button } from '@productmap/ui';
import { Skeleton } from '@productmap/ui';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@productmap/ui';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { ReviewSheet } from '@/components/copilot/ReviewSheet';
import { Editor } from '@/components/editor/Editor';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { coverCss } from '@/components/editor/CoverPicker';
import { countWords } from '@/components/editor/word-count';
import { useAutosave } from '@/components/editor/useAutosave';
import { morphName } from '@/lib/transitions';
import { TOGGLE_COMMENTS_EVENT } from '@/components/command/useGlobalShortcuts';

function DocSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pb-16 pt-6 sm:px-6">
      <div className="flex items-center gap-3 rounded-full bg-surface px-5 py-3 shadow-card">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-7 flex-1 rounded-full" />
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      <div className="mt-6 space-y-4 rounded-2xl bg-surface px-8 py-12 shadow-card sm:px-14">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

export default function DocPage() {
  const pid = useProjectId();
  const { id = '' } = useParams<{ id: string }>();
  const docQuery = useDocument(id);
  const doc = docQuery.data;
  const featureQuery = useFeature(doc?.featureId ?? '');
  // Idea-owned docs (pitch pre-promotion): fetch the idea for the back-link title.
  const ideaQuery = useIdea(doc && !doc.featureId ? (doc.ideaId ?? '') : '');
  const aiStatus = useAiStatus();
  const updateDocument = useUpdateDocument();
  const { mutateAsync: patchDocument, mutate: patchDocumentFireAndForget } =
    updateDocument;

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [wordCount, setWordCount] = useState<number | null>(null);

  // Seed the word count from the loaded doc; live updates come from editor changes.
  const liveWordCount =
    wordCount ?? (doc ? countWords(doc.contentJson) : 0);

  // The ⌘K palette's "Toggle comments" action broadcasts this window event.
  useEffect(() => {
    const handler = () => setCommentsOpen((open) => !open);
    window.addEventListener(TOGGLE_COMMENTS_EVENT, handler);
    return () => window.removeEventListener(TOGGLE_COMMENTS_EVENT, handler);
  }, []);

  const commentsQuery = useComments({ documentId: id });
  const unresolvedCount =
    commentsQuery.data?.filter((t) => t.resolvedAt === null).length ?? 0;

  const saveContent = useCallback(
    async (contentJson: Record<string, unknown>) => {
      await patchDocument({ id, contentJson });
    },
    [id, patchDocument],
  );
  const autosave = useAutosave(saveContent);
  const { schedule, flush } = autosave;

  const handleEditorChange = useCallback(
    (json: Record<string, unknown>) => {
      setWordCount(countWords(json));
      schedule(json);
    },
    [schedule],
  );

  const handleAiDone = useCallback(
    (json: Record<string, unknown>) => {
      schedule(json);
      void flush();
    },
    [schedule, flush],
  );

  const uploadImage = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentId', id);
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const { url } = (await res.json()) as { url: string };
      return url;
    },
    [id],
  );

  const handleRenameTitle = useCallback(
    (title: string) => {
      patchDocumentFireAndForget(
        { id, title },
        { onError: () => toast.error(`Couldn't rename "${title}"`) },
      );
    },
    [id, patchDocumentFireAndForget],
  );

  const handleStatusChange = useCallback(
    (status: DocStatus) => {
      patchDocumentFireAndForget(
        { id, status },
        { onError: () => toast.error("Couldn't update document status") },
      );
    },
    [id, patchDocumentFireAndForget],
  );

  const handleCoverChange = useCallback(
    (cover: string | null) => {
      patchDocumentFireAndForget(
        { id, cover },
        { onError: () => toast.error("Couldn't update the cover") },
      );
    },
    [id, patchDocumentFireAndForget],
  );

  // AI drafting needs an owning feature for context — idea/release-owned docs
  // (featureId null) keep the editor but skip the AI seam.
  const aiConfig = useMemo(
    () =>
      doc?.featureId ? { featureId: doc.featureId, docType: doc.type } : undefined,
    [doc],
  );

  if (docQuery.isLoading) return <DocSkeleton />;

  if (docQuery.isError || !doc) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="rounded-2xl border border-transparent bg-surface p-6 shadow-card">
          <p className="text-sm text-body-ink">
            Couldn't load this document.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => void docQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const feature = featureQuery.data;
  const cover = coverCss(doc.cover);
  const back = docBackLink(doc, {
    featureTitle: feature?.title,
    ideaTitle: ideaQuery.data?.title,
  });

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pb-16 pt-6 sm:px-6">
      {cover ? (
        <div
          aria-hidden
          data-testid="doc-cover"
          className="mb-4 h-28 w-full rounded-2xl shadow-card sm:h-32"
          style={{ background: cover }}
        />
      ) : null}
      <EditorToolbar
        backHref={back.href}
        backLabel={back.label}
        title={doc.title}
        onRenameTitle={handleRenameTitle}
        typeChip={<DocTypeChip type={doc.type} />}
        status={doc.status}
        onStatusChange={handleStatusChange}
        saveState={autosave.state}
        exportHref={demoReady() ? undefined : apiPath(pid, 'documents', doc.id, 'export.md')}
        commentCount={unresolvedCount}
        onToggleComments={() => setCommentsOpen((open) => !open)}
        titleTransitionName={morphName('doc-title', doc.id)}
        wordCount={liveWordCount}
        cover={doc.cover ?? null}
        onCoverChange={handleCoverChange}
        readerHref={appRoutes.docRead(doc.id)}
        onAiReview={
          aiStatus.data?.enabled ? () => setReviewOpen(true) : undefined
        }
      />
      <Editor
        key={doc.id}
        initialContent={doc.contentJson}
        onChange={handleEditorChange}
        uploadImage={uploadImage}
        aiEnabled={aiStatus.data?.enabled ?? false}
        aiConfig={aiConfig}
        onAiDone={handleAiDone}
      />

      {/* AI review side sheet — streams the rubric review (AI-gated above). */}
      <ReviewSheet documentId={id} open={reviewOpen} onOpenChange={setReviewOpen} />

      {/* Non-modal right sheet — the editor stays usable underneath. */}
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen} modal={false}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto bg-panel sm:w-[480px] sm:max-w-[480px]"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle className="font-display text-ink">Comments</SheetTitle>
            <SheetDescription className="sr-only">
              Discussion threads for this document
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <CommentsSection target={{ documentId: id }} showHeader={false} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
