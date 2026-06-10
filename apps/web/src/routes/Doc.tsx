import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { DocStatus } from '@productmap/shared';
import {
  useAiStatus,
  useComments,
  useDocument,
  useFeature,
  useUpdateDocument,
} from '@/lib/api';
import { DocTypeChip } from '@/components/DocTypeChip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { Editor } from '@/components/editor/Editor';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { useAutosave } from '@/components/editor/useAutosave';

function DocSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pb-16 pt-6 sm:px-6">
      <div className="flex items-center gap-3 rounded-full bg-white px-5 py-3 shadow-card">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-7 flex-1 rounded-full" />
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      <div className="mt-6 space-y-4 rounded-2xl bg-white px-8 py-12 shadow-card sm:px-14">
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
  const { id = '' } = useParams<{ id: string }>();
  const docQuery = useDocument(id);
  const doc = docQuery.data;
  const featureQuery = useFeature(doc?.featureId ?? '');
  const aiStatus = useAiStatus();
  const updateDocument = useUpdateDocument();
  const { mutateAsync: patchDocument, mutate: patchDocumentFireAndForget } =
    updateDocument;

  const [commentsOpen, setCommentsOpen] = useState(false);
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
    (json: Record<string, unknown>) => schedule(json),
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

  const aiConfig = useMemo(
    () => (doc ? { featureId: doc.featureId, docType: doc.type } : undefined),
    [doc],
  );

  if (docQuery.isLoading) return <DocSkeleton />;

  if (docQuery.isError || !doc) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="rounded-2xl border border-transparent bg-white p-6 shadow-card">
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

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pb-16 pt-6 sm:px-6">
      <EditorToolbar
        backHref={`/board?feature=${doc.featureId}`}
        backLabel={feature?.title ?? 'Back to board'}
        title={doc.title}
        onRenameTitle={handleRenameTitle}
        typeChip={<DocTypeChip type={doc.type} />}
        status={doc.status}
        onStatusChange={handleStatusChange}
        saveState={autosave.state}
        exportHref={`/api/documents/${doc.id}/export.md`}
        commentCount={unresolvedCount}
        onToggleComments={() => setCommentsOpen((open) => !open)}
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

      {/* Non-modal right sheet — the editor stays usable underneath. */}
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen} modal={false}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto bg-[#f4f6f9] sm:w-[480px] sm:max-w-[480px]"
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
