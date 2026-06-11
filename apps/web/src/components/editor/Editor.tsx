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
  'min-h-[60vh] text-[16px] leading-[1.7] text-body-ink focus:outline-none',
  '[&_.ProseMirror]:min-h-[60vh] [&_.ProseMirror]:outline-none',
  '[&_h1]:mt-10 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-ink [&_h1:first-child]:mt-0',
  '[&_h2]:mt-9 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink',
  '[&_h3]:mt-7 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-ink',
  '[&_p]:my-3 [&_p]:leading-[1.7]',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_blockquote]:my-4 [&_blockquote]:rounded-r-xl [&_blockquote]:border-l-[3px] [&_blockquote]:border-action [&_blockquote]:bg-[var(--pm-quote)] [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:pr-4 [&_blockquote]:italic [&_blockquote]:text-body-ink',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[var(--pm-code)] [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm',
  '[&_code]:rounded-md [&_code]:bg-[var(--pm-code)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  // tables: rounded corners + soft row stripes, hairline separators only
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:overflow-hidden [&_table]:rounded-xl',
  '[&_th]:border-b [&_th]:border-line-strong [&_th]:bg-wash [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink',
  '[&_th:first-child]:rounded-tl-xl [&_th:last-child]:rounded-tr-xl',
  '[&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2',
  '[&_tbody_tr:nth-child(even)_td]:bg-[var(--pm-stripe)]',
  '[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:shadow-card',
  '[&_hr]:my-8 [&_hr]:border-line-strong',
  '[&_a]:text-action [&_a]:underline [&_a]:decoration-action/40 [&_a]:underline-offset-2',
  // task lists: rounded checkboxes with a sage check
  '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-1',
  '[&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2',
  '[&_li[data-type=taskItem]_label]:mt-1',
  '[&_input[type=checkbox]]:h-4 [&_input[type=checkbox]]:w-4 [&_input[type=checkbox]]:rounded [&_input[type=checkbox]]:accent-sage',
  // placeholder
  '[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-ink [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
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
    <div className="rounded-2xl border border-transparent bg-surface px-6 py-12 shadow-card sm:px-14">
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
