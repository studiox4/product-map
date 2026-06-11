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
import { Node, type Extensions } from '@tiptap/core';

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

/** Tinted emoji callout card. Markdown form: emoji-leading blockquote (`> 💡 …`).
 *  Schema (name + attrs) must match the web editor's CalloutNode. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      emoji: {
        default: '💡',
        parseHTML: (el) => el.getAttribute('data-emoji') ?? '💡',
        renderHTML: (attrs) => ({ 'data-emoji': attrs.emoji as string }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'callout', ...HTMLAttributes }, 0];
  },
});

/** Collapsible toggle block. Markdown form: raw <details><summary>…</summary>…</details>.
 *  Schema must match the web editor's ToggleNode trio. */
export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary toggleContent',
  defining: true,
  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.hasAttribute('open'),
        renderHTML: (attrs) => (attrs.open ? { open: 'open' } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'details' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['details', { 'data-type': 'toggle', ...HTMLAttributes }, 0];
  },
});

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  defining: true,
  selectable: false,
  parseHTML() {
    return [{ tag: 'summary' }];
  },
  renderHTML() {
    return ['summary', 0];
  },
});

export const ToggleContent = Node.create({
  name: 'toggleContent',
  content: 'block+',
  defining: true,
  selectable: false,
  parseHTML() {
    return [{ tag: 'div[data-type="toggle-content"]' }];
  },
  renderHTML() {
    return ['div', { 'data-type': 'toggle-content' }, 0];
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
  Callout,
  Toggle,
  ToggleSummary,
  ToggleContent,
];
