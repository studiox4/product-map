import { describe, it, expect, vi, afterEach } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CalloutNode, CALLOUT_EMOJIS } from './CalloutNode';
import { TOGGLE_EXTENSIONS } from './ToggleNode';
import { filterSlashItems } from './slash-items';

function makeEditor(content = '<p>/x</p>'): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, CalloutNode, ...TOGGLE_EXTENSIONS],
    content,
  });
}

let editors: Editor[] = [];
function tracked(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

function runSlashItem(title: string, editor: Editor) {
  const item = filterSlashItems(title).find((i) => i.title === title);
  expect(item).toBeTruthy();
  // simulate the slash menu deleting the typed "/query" range, then inserting
  item!.command({
    editor,
    range: { from: 1, to: editor.state.doc.content.size - 1 },
    pickImage: vi.fn(),
  });
}

describe('slash menu callout/toggle insertion', () => {
  it('/callout inserts a callout block with the default 💡 emoji', () => {
    const editor = tracked(makeEditor());
    runSlashItem('Callout', editor);
    const json = editor.getJSON() as {
      content: Array<{ type: string; attrs?: { emoji?: string } }>;
    };
    const callout = json.content.find((n) => n.type === 'callout');
    expect(callout).toBeTruthy();
    expect(callout?.attrs?.emoji).toBe('💡');
    expect(CALLOUT_EMOJIS).toContain(callout?.attrs?.emoji);
  });

  it('/toggle inserts an open toggle with summary + content children', () => {
    const editor = tracked(makeEditor());
    runSlashItem('Toggle', editor);
    const json = editor.getJSON() as {
      content: Array<{
        type: string;
        attrs?: { open?: boolean };
        content?: Array<{ type: string }>;
      }>;
    };
    const toggle = json.content.find((n) => n.type === 'toggle');
    expect(toggle).toBeTruthy();
    expect(toggle?.attrs?.open).toBe(true);
    expect(toggle?.content?.map((c) => c.type)).toEqual([
      'toggleSummary',
      'toggleContent',
    ]);
  });

  it('callout and toggle are findable by their keywords', () => {
    expect(filterSlashItems('note').map((i) => i.title)).toContain('Callout');
    expect(filterSlashItems('collapse').map((i) => i.title)).toContain('Toggle');
  });
});
