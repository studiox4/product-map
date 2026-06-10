import { memo, useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import { toast } from 'sonner';
import type { DocType } from '@productmap/shared';
import { cn } from '@/lib/utils';
import { SlashCommand } from './SlashMenu';
import { AiDraftCard } from './AiDraftCard';

export interface EditorProps {
  /** Tiptap doc JSON — read once on mount. */
  initialContent: unknown;
  /** Fires on every document change with the new Tiptap JSON (debounce upstream). */
  onChange: (json: Record<string, unknown>) => void;
  /** Uploads a file, resolves to its public url (/uploads/…). */
  uploadImage: (file: File) => Promise<string>;
  /** Whether AI drafting is available (from /api/ai/status). */
  aiEnabled: boolean;
  aiConfig?: { featureId: string; docType: DocType };
  /** Final Tiptap JSON when an AI draft completes (trigger autosave). */
  onAiDone?: (json: Record<string, unknown>) => void;
}

function docHasText(editor: TiptapEditor): boolean {
  return editor.state.doc.textContent.trim().length > 0;
}

/** Typography for ProseMirror content — scoped here since the app has no tailwind typography plugin. */
const PROSE_CLASSES = cn(
  'min-h-[60vh] focus:outline-none',
  '[&_.ProseMirror]:min-h-[60vh] [&_.ProseMirror]:outline-none',
  '[&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight',
  '[&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight',
  '[&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold',
  '[&_p]:my-3 [&_p]:leading-7',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md [&_img]:border',
  '[&_hr]:my-6 [&_hr]:border-border',
  '[&_a]:text-blue-600 [&_a]:underline',
  // task lists
  '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-1',
  '[&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2',
  '[&_li[data-type=taskItem]_label]:mt-1',
  // placeholder
  '[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
);

export const Editor = memo(function Editor({
  initialContent,
  onChange,
  uploadImage,
  aiEnabled,
  aiConfig,
  onAiDone,
}: EditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);

  const insertUploadedImage = useCallback(
    (editor: TiptapEditor, file: File) => {
      uploadImage(file)
        .then((url) => {
          editor.chain().focus().setImage({ src: url, alt: file.name }).run();
        })
        .catch(() => {
          toast.error(`Couldn't upload "${file.name}"`);
        });
    },
    [uploadImage],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Type '/' for commands…" }),
      SlashCommand.configure({
        pickImage: () => fileInputRef.current?.click(),
      }),
    ],
    content: (initialContent as object) ?? undefined,
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
        'aria-label': 'Document body',
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (!files.length) return false;
        event.preventDefault();
        const e = (view as unknown as { editor?: TiptapEditor }).editor;
        for (const file of files) {
          if (e) insertUploadedImage(e, file);
        }
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (!files.length) return false;
        event.preventDefault();
        const e = (view as unknown as { editor?: TiptapEditor }).editor;
        for (const file of files) {
          if (e) insertUploadedImage(e, file);
        }
        return true;
      },
    },
    onCreate: ({ editor }) => {
      setIsEmpty(!docHasText(editor));
    },
    onUpdate: ({ editor }) => {
      setIsEmpty(!docHasText(editor));
      onChange(editor.getJSON() as Record<string, unknown>);
    },
  });

  const handleAiMarkdown = useCallback(
    (markdown: string) => {
      if (!editor) return;
      const html = marked.parse(markdown, { async: false }) as string;
      // Don't emit update per chunk — avoids PATCH spam while streaming.
      editor.commands.setContent(html, false);
    },
    [editor],
  );

  const handleAiDone = useCallback(
    (markdown: string) => {
      if (!editor) return;
      const html = marked.parse(markdown, { async: false }) as string;
      editor.commands.setContent(html, true); // emits update → autosave path
      setIsEmpty(!docHasText(editor));
      onAiDone?.(editor.getJSON() as Record<string, unknown>);
    },
    [editor, onAiDone],
  );

  const showAiCard =
    aiEnabled && !!aiConfig && !!editor && (isEmpty || aiStreaming);

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      {showAiCard ? (
        <div className="mb-6">
          <AiDraftCard
            featureId={aiConfig.featureId}
            docType={aiConfig.docType}
            onMarkdown={handleAiMarkdown}
            onDone={handleAiDone}
            onStreamingChange={setAiStreaming}
          />
        </div>
      ) : null}
      <EditorContent editor={editor} className={PROSE_CLASSES} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && editor) insertUploadedImage(editor, file);
          e.target.value = '';
        }}
      />
    </div>
  );
});
