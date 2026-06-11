import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TocRail, extractHeadings } from './TocRail';

function makeEditor(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit],
    content,
  });
}

const THREE_HEADINGS = [
  '<h1>Overview</h1>',
  '<p>intro</p>',
  '<h2>Goals</h2>',
  '<p>body</p>',
  '<h3>Non-goals</h3>',
  '<p>more</p>',
].join('');

let editors: Editor[] = [];
function tracked(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

afterEach(() => {
  cleanup();
  editors.forEach((e) => e.destroy());
  editors = [];
});

describe('extractHeadings', () => {
  it('returns H1-H3 headings in document order with levels', () => {
    const editor = tracked(makeEditor(THREE_HEADINGS));
    const headings = extractHeadings(editor);
    expect(headings.map((h) => h.text)).toEqual(['Overview', 'Goals', 'Non-goals']);
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3]);
  });

  it('skips empty headings', () => {
    const editor = tracked(makeEditor('<h1>Real</h1><h2></h2><p>x</p>'));
    expect(extractHeadings(editor).map((h) => h.text)).toEqual(['Real']);
  });
});

describe('TocRail', () => {
  it('renders nothing with fewer than 3 headings', () => {
    const editor = tracked(makeEditor('<h1>One</h1><h2>Two</h2><p>x</p>'));
    render(<TocRail editor={editor} />);
    expect(screen.queryByRole('navigation', { name: 'Table of contents' })).toBeNull();
  });

  it('lists all headings when the doc has ≥3', () => {
    const editor = tracked(makeEditor(THREE_HEADINGS));
    render(<TocRail editor={editor} />);
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(nav).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Goals' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Non-goals' })).toBeTruthy();
  });

  it('tracks heading edits: new headings appear in the rail', () => {
    const editor = tracked(makeEditor(THREE_HEADINGS));
    render(<TocRail editor={editor} />);
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size, '<h2>Rollout</h2>');
    });
    expect(screen.getByRole('button', { name: 'Rollout' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('marks exactly one heading as the active section', () => {
    const editor = tracked(makeEditor(THREE_HEADINGS));
    render(<TocRail editor={editor} />);
    const active = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'true');
    expect(active).toHaveLength(1);
  });
});
