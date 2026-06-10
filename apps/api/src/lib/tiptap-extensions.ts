import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import CodeBlock from '@tiptap/extension-code-block';
import type { Extensions } from '@tiptap/core';

/** CodeBlock whose parse rule reads the language class off the inner <code>
 *  via querySelector — `firstElementChild` is unreliable in the server-side DOM
 *  used by @tiptap/html, which drops the language otherwise. */
const ServerCodeBlock = CodeBlock.extend({
  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full' as const,
        getAttrs: (node) => {
          const el = node as HTMLElement;
          const cls =
            el.querySelector?.('code')?.getAttribute('class') ??
            el.getAttribute('class') ??
            '';
          const match = /language-(\S+)/.exec(cls);
          return { language: match?.[1] ?? null };
        },
      },
    ];
  },
});

/** Server-side Tiptap extension list shared by both conversion directions.
 *  Must stay in sync with the editor's extension set in apps/web. */
export const extensions: Extensions = [
  StarterKit.configure({ codeBlock: false }),
  ServerCodeBlock,
  Table,
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  Link.configure({ openOnClick: false }),
];
