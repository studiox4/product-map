import { generateHTML, generateJSON } from '@tiptap/html';
import { marked } from 'marked';
import TurndownService from 'turndown';
// @ts-expect-error no types shipped
import { gfm } from '@joplin/turndown-plugin-gfm';
import { extensions } from './tiptap-extensions';

marked.use({ gfm: true });

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});
turndown.use(gfm);

// Tiptap task lists render as
// <ul data-type="taskList"><li data-type="taskItem"><label><input …></label><div><p>…</p></div></li>
// Drop the label (checkbox UI) and emit GFM "- [x] " markers from the input state.
turndown.addRule('tiptapTaskItemLabel', {
  filter: (node) =>
    node.nodeName === 'LABEL' &&
    (node.parentNode as HTMLElement | null)?.getAttribute?.('data-type') === 'taskItem',
  replacement: () => '',
});
turndown.addRule('tiptapTaskItem', {
  filter: (node) =>
    node.nodeName === 'LI' &&
    (node as HTMLElement).getAttribute('data-type') === 'taskItem',
  replacement: (content, node) => {
    const checked = !!(node as HTMLElement).querySelector?.('input[checked]');
    const body = content
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
      .replace(/\n/gm, '\n    ');
    return `- [${checked ? 'x' : ' '}] ${body}\n`;
  },
});

// Callout serializes to an emoji-leading blockquote: `> 💡 first line…`.
turndown.addRule('tiptapCallout', {
  filter: (node) =>
    node.nodeName === 'DIV' &&
    (node as HTMLElement).getAttribute('data-type') === 'callout',
  replacement: (content, node) => {
    const emoji = (node as HTMLElement).getAttribute('data-emoji') || '💡';
    const body = content.replace(/^\n+/, '').replace(/\n+$/, '');
    const quoted = body
      .split('\n')
      .map((line) => (line.trim() ? `> ${line}` : '>'))
      .join('\n');
    return `\n\n${quoted.replace(/^> /, `> ${emoji} `)}\n\n`;
  },
});

// Toggle serializes as raw <details> HTML (markdown HTML passthrough).
turndown.addRule('tiptapToggle', {
  filter: (node) => node.nodeName === 'DETAILS',
  replacement: (_content, node) =>
    `\n\n${(node as HTMLElement).outerHTML}\n\n`,
});

/** Leading emoji (with optional variation selector) followed by whitespace. */
const LEADING_EMOJI = /^(\p{Extended_Pictographic}️?)\s+/u;

interface JsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  [key: string]: unknown;
}

/** Recursively rewrite emoji-leading blockquotes into callout nodes. */
function liftCallouts(node: JsonNode): JsonNode {
  const content = node.content?.map(liftCallouts);
  if (node.type !== 'blockquote' || !content?.length) {
    return content ? { ...node, content } : node;
  }
  const first = content[0];
  const firstText = first.type === 'paragraph' ? first.content?.[0] : undefined;
  const match =
    firstText?.type === 'text' && typeof firstText.text === 'string'
      ? LEADING_EMOJI.exec(firstText.text)
      : null;
  if (!match || !firstText) return { ...node, content };
  const stripped = (firstText.text as string).slice(match[0].length);
  const firstContent = stripped
    ? [{ ...firstText, text: stripped }, ...(first.content?.slice(1) ?? [])]
    : (first.content?.slice(1) ?? []);
  return {
    type: 'callout',
    attrs: { emoji: match[1] },
    content: [
      firstContent.length ? { ...first, content: firstContent } : { type: 'paragraph' },
      ...content.slice(1),
    ],
  };
}

/** Markdown → Tiptap doc JSON (marked → HTML → generateJSON). */
export function markdownToTiptap(md: string): unknown {
  if (!md.trim()) return { type: 'doc', content: [] };
  // GFM task list items: convert markers to Tiptap taskList HTML after parsing
  let html = marked.parse(md, { async: false }) as string;
  html = html
    .replace(/<li><input checked="" disabled="" type="checkbox">\s*/g, '<li data-checked="true" data-type="taskItem">')
    .replace(/<li><input disabled="" type="checkbox">\s*/g, '<li data-checked="false" data-type="taskItem">');
  // mark ULs that contain task items
  html = html.replace(/<ul>(\s*<li data-checked)/g, '<ul data-type="taskList">$1');
  const json = generateJSON(html, extensions) as JsonNode;
  return liftCallouts(json);
}

/** Tiptap doc JSON → markdown (generateHTML → turndown + gfm). */
export function tiptapToMarkdown(doc: unknown): string {
  const node = doc as { type?: string; content?: unknown[] } | null | undefined;
  if (!node || node.type !== 'doc' || !node.content?.length) return '';
  let html = generateHTML(node as Record<string, unknown>, extensions);
  // <colgroup> before <tbody> defeats turndown-gfm's heading-row detection
  html = html.replace(/<colgroup>.*?<\/colgroup>/gs, '');
  const md = turndown.turndown(html);
  return md.trim() ? md : '';
}
