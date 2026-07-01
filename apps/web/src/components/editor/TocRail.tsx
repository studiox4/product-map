import { useCallback, useEffect, useState } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { cn } from '@productmap/ui';
import { prefersReducedMotion } from '@/lib/delight';

export interface TocHeading {
  /** Document position of the heading node. */
  pos: number;
  level: number;
  text: string;
}

/** H1–H3 headings (with text) from a Tiptap document, in order. */
export function extractHeadings(editor: TiptapEditor): TocHeading[] {
  const headings: TocHeading[] = [];
  editor.state.doc.forEach((node, offset) => {
    if (
      node.type.name === 'heading' &&
      (node.attrs.level as number) <= 3 &&
      node.textContent.trim().length > 0
    ) {
      headings.push({
        pos: offset,
        level: node.attrs.level as number,
        text: node.textContent.trim(),
      });
    }
  });
  return headings;
}

const LEVEL_INDENT: Record<number, string> = { 1: 'pl-0', 2: 'pl-2', 3: 'pl-4' };

/**
 * Right-floating minimal rail of dots + labels (spec 2.3). Appears when the
 * doc has ≥3 headings; labels reveal on hover; click scrolls smoothly
 * (instant under reduced motion); active section highlighted on scroll.
 */
export function TocRail({ editor }: { editor: TiptapEditor | null }) {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const update = () => setHeadings(extractHeadings(editor));
    update();
    editor.on('update', update);
    return () => {
      editor.off('update', update);
    };
  }, [editor]);

  const headingDom = useCallback(
    (pos: number): HTMLElement | null => {
      if (!editor || editor.isDestroyed) return null;
      if (pos >= editor.state.doc.content.size) return null;
      const dom = editor.view.nodeDOM(pos);
      return dom instanceof HTMLElement ? dom : null;
    },
    [editor],
  );

  // Active section: last heading whose top edge has crossed the tracking line.
  useEffect(() => {
    if (!editor || headings.length < 3) return;
    const onScroll = () => {
      let active = 0;
      for (let i = 0; i < headings.length; i++) {
        const dom = headingDom(headings[i].pos);
        if (dom && dom.getBoundingClientRect().top <= 140) active = i;
      }
      setActiveIndex(active);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [editor, headings, headingDom]);

  if (!editor || headings.length < 3) return null;

  const scrollTo = (heading: TocHeading) => {
    const dom = headingDom(heading.pos);
    dom?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <nav
      aria-label="Table of contents"
      className="group fixed right-5 top-1/2 z-30 hidden max-h-[70vh] -translate-y-1/2 flex-col gap-0.5 overflow-y-auto xl:flex"
    >
      {headings.map((heading, i) => (
        <button
          key={`${heading.pos}-${heading.text}`}
          type="button"
          onClick={() => scrollTo(heading)}
          aria-current={i === activeIndex ? 'true' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-full px-2 py-1 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            LEVEL_INDENT[heading.level],
          )}
        >
          <span
            aria-hidden
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150 ease-out',
              i === activeIndex ? 'bg-action' : 'bg-line-strong group-hover:bg-line-dash',
            )}
          />
          <span
            className={cn(
              'max-w-[180px] truncate text-xs opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100',
              i === activeIndex ? 'font-medium text-action' : 'text-muted-ink',
            )}
          >
            {heading.text}
          </span>
        </button>
      ))}
    </nav>
  );
}
