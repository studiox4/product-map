import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { GripVertical } from 'lucide-react';

interface HandleState {
  /** Document position of the hovered top-level block. */
  nodePos: number;
  /** Offset (px) from the top of the positioning container. */
  top: number;
}

export interface BlockDragHandleProps {
  editor: TiptapEditor | null;
  /** Positioning container — a `relative` ancestor wrapping the editor surface. */
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Hover gutter handle (⋮⋮) for top-level blocks (spec 2.3). Dragging the
 * handle starts a native ProseMirror node drag, so dropping reuses Tiptap's
 * built-in drop handling (drop cursor included).
 */
export function BlockDragHandle({ editor, containerRef }: BlockDragHandleProps) {
  const [handle, setHandle] = useState<HandleState | null>(null);
  const hideTimer = useRef<number | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!editor || editor.isDestroyed || !container) return;

    const onMouseMove = (event: MouseEvent) => {
      const view = editor.view;
      if (!view.editable) return;
      const found = view.posAtCoords({ left: event.clientX + 40, top: event.clientY });
      if (!found) return;
      const $pos = view.state.doc.resolve(found.pos);
      const nodePos = $pos.depth > 0 ? $pos.before(1) : found.pos;
      const node = view.state.doc.nodeAt(nodePos);
      if (!node) return;
      const dom = view.nodeDOM(nodePos);
      if (!(dom instanceof HTMLElement)) return;
      const rect = dom.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      clearHideTimer();
      setHandle({ nodePos, top: rect.top - containerRect.top + 2 });
    };

    const onMouseLeave = () => {
      clearHideTimer();
      hideTimer.current = window.setTimeout(() => setHandle(null), 300);
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      clearHideTimer();
    };
  }, [editor, containerRef]);

  // Hide while the document is being edited (positions go stale).
  useEffect(() => {
    if (!editor) return;
    const hide = () => setHandle(null);
    editor.on('update', hide);
    return () => {
      editor.off('update', hide);
    };
  }, [editor]);

  const onDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      if (!editor || !handle) return;
      const view = editor.view;
      if (handle.nodePos >= view.state.doc.content.size) return;
      const selection = NodeSelection.create(view.state.doc, handle.nodePos);
      view.dispatch(view.state.tr.setSelection(selection));
      const slice = selection.content();
      const { dom, text } = view.serializeForClipboard(slice);
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/html', dom.innerHTML);
      event.dataTransfer.setData('text/plain', text);
      const blockDom = view.nodeDOM(handle.nodePos);
      if (blockDom instanceof HTMLElement) {
        event.dataTransfer.setDragImage(blockDom, 0, 0);
      }
      view.dragging = { slice, move: true };
    },
    [editor, handle],
  );

  if (!editor || !handle) return null;

  return (
    <button
      type="button"
      draggable
      aria-label="Drag to move block"
      data-testid="block-drag-handle"
      contentEditable={false}
      onDragStart={onDragStart}
      onDragEnd={() => setHandle(null)}
      onMouseDown={(e) => e.preventDefault()}
      className="absolute left-1.5 z-10 hidden h-6 w-5 cursor-grab items-center justify-center rounded-md text-muted-ink/70 transition-colors duration-150 ease-out hover:bg-secondary hover:text-ink active:cursor-grabbing sm:left-5 sm:flex"
      style={{ top: handle.top }}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}
