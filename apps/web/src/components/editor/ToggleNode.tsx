import { Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@productmap/ui';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggle: {
      /** Insert a fresh toggle block (open, empty summary + paragraph). */
      insertToggle: () => ReturnType;
    };
  }
}

function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open as boolean;

  return (
    <NodeViewWrapper
      data-type="toggle"
      data-open={open}
      className="group/toggle relative my-3 pl-7"
    >
      <button
        type="button"
        contentEditable={false}
        onClick={() => updateAttributes({ open: !open })}
        aria-expanded={open}
        aria-label={open ? 'Collapse section' : 'Expand section'}
        className="absolute left-0 top-[3px] flex h-6 w-6 items-center justify-center rounded-md text-muted-ink transition-colors duration-150 ease-out hover:bg-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'h-4 w-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out',
            open && 'rotate-90',
          )}
        />
      </button>
      <NodeViewContent
        className={cn(
          // <summary> renders outside <details> here, so style it as a block label
          '[&_summary]:block [&_summary]:cursor-text [&_summary]:list-none [&_summary]:font-medium [&_summary]:text-ink [&_summary::-webkit-details-marker]:hidden',
          '[&_[data-type=toggle-content]]:mt-1',
          !open && '[&_[data-type=toggle-content]]:hidden',
        )}
      />
    </NodeViewWrapper>
  );
}

/**
 * Collapsible toggle block (spec 2.3). Markdown round-trip: raw
 * `<details><summary>…</summary>…</details>` HTML passthrough. Schema must
 * stay in sync with the server-side Toggle trio in
 * apps/api/src/lib/tiptap-extensions.ts.
 */
export const ToggleNode = Node.create({
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

  addCommands() {
    return {
      insertToggle:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { open: true },
              content: [
                { type: 'toggleSummary' },
                { type: 'toggleContent', content: [{ type: 'paragraph' }] },
              ],
            })
            // Land the cursor in the (empty) summary so typing names the toggle.
            .command(({ tr, dispatch }) => {
              const { from } = tr.selection;
              let summaryPos: number | null = null;
              tr.doc.nodesBetween(Math.max(0, from - 20), from, (node, pos) => {
                if (node.type.name === 'toggleSummary') summaryPos = pos + 1;
              });
              if (summaryPos !== null && dispatch) {
                tr.setSelection(TextSelection.create(tr.doc, summaryPos));
              }
              return true;
            })
            .run(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});

export const ToggleSummaryNode = Node.create({
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

export const ToggleContentNode = Node.create({
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

export const TOGGLE_EXTENSIONS = [ToggleNode, ToggleSummaryNode, ToggleContentNode];
