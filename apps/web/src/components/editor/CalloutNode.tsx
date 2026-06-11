import { Node } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';

/** Curated emoji set — clicking the badge cycles through these. */
export const CALLOUT_EMOJIS = ['💡', '⚠️', '✅', '❗', '📌', '🔥', '💬', '🎯'];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Insert a fresh callout block (💡 by default). */
      insertCallout: () => ReturnType;
    };
  }
}

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const emoji = (node.attrs.emoji as string) || '💡';

  const cycleEmoji = () => {
    if (!editor.isEditable) return;
    const i = CALLOUT_EMOJIS.indexOf(emoji);
    updateAttributes({
      emoji: CALLOUT_EMOJIS[(i + 1) % CALLOUT_EMOJIS.length],
    });
  };

  return (
    <NodeViewWrapper
      data-type="callout"
      data-emoji={emoji}
      className="my-4 flex items-start gap-3 rounded-xl bg-action-soft/50 px-4 py-3"
    >
      <button
        type="button"
        contentEditable={false}
        onClick={cycleEmoji}
        title={editor.isEditable ? 'Change emoji' : undefined}
        aria-label={`Callout emoji: ${emoji}${editor.isEditable ? ' (click to change)' : ''}`}
        className="mt-0.5 flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-lg text-lg leading-none transition-colors duration-150 ease-out enabled:hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={!editor.isEditable}
      >
        {emoji}
      </button>
      <NodeViewContent className="min-w-0 flex-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0" />
    </NodeViewWrapper>
  );
}

/**
 * Tinted emoji callout card (spec 2.3). Markdown round-trip: emoji-leading
 * blockquote (`> 💡 …`). Schema must stay in sync with the server-side
 * Callout node in apps/api/src/lib/tiptap-extensions.ts.
 */
export const CalloutNode = Node.create({
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

  addCommands() {
    return {
      insertCallout:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
