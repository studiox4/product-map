import type { Editor, Range } from '@tiptap/core';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Table as TableIcon,
  Code2,
  Quote,
  Image as ImageIcon,
  Minus,
  Lightbulb,
  ChevronsDownUp,
  type LucideIcon,
} from 'lucide-react';

export interface SlashCommandContext {
  editor: Editor;
  range: Range;
  /** Opens the hidden file picker wired up by the Editor component. */
  pickImage: () => void;
}

export interface SlashItem {
  title: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  command: (ctx: SlashCommandContext) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'title', 'heading'],
    icon: Heading1,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'heading', 'subtitle'],
    icon: Heading2,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', 'heading', 'subheading'],
    icon: Heading3,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    description: 'Unordered list',
    keywords: ['ul', 'unordered', 'bullets'],
    icon: List,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    description: 'Ordered list',
    keywords: ['ol', 'ordered', 'numbers'],
    icon: ListOrdered,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Task list',
    description: 'Checklist with checkboxes',
    keywords: ['todo', 'checkbox', 'checklist', 'tasks'],
    icon: ListTodo,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Table',
    description: 'Insert a 3×3 table',
    keywords: ['grid', 'rows', 'columns'],
    icon: TableIcon,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: 'Code block',
    description: 'Fenced code with monospace font',
    keywords: ['code', 'fence', 'snippet'],
    icon: Code2,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Callout',
    description: 'Tinted card with an emoji',
    keywords: ['callout', 'info', 'note', 'tip', 'warning'],
    icon: Lightbulb,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertCallout().run(),
  },
  {
    title: 'Toggle',
    description: 'Collapsible section',
    keywords: ['toggle', 'collapse', 'details', 'accordion', 'expand'],
    icon: ChevronsDownUp,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertToggle().run(),
  },
  {
    title: 'Quote',
    description: 'Blockquote',
    keywords: ['blockquote', 'citation'],
    icon: Quote,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Image',
    description: 'Upload an image from your computer',
    keywords: ['photo', 'picture', 'upload', 'img'],
    icon: ImageIcon,
    command: ({ editor, range, pickImage }) => {
      editor.chain().focus().deleteRange(range).run();
      pickImage();
    },
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    keywords: ['hr', 'rule', 'separator', 'line'],
    icon: Minus,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q)),
  );
}
