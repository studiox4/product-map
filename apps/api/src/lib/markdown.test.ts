import { describe, expect, it } from 'vitest';
import { markdownToTiptap, tiptapToMarkdown } from './markdown';

/** Normalize markdown for round-trip comparison:
 * trim trailing whitespace per line, collapse >2 blank lines, trim outer whitespace. */
function normalize(md: string): string {
  return md
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function roundTrip(md: string): string {
  return tiptapToMarkdown(markdownToTiptap(md));
}

describe('markdown <-> tiptap round trip', () => {
  it('heading + paragraph + bold/italic/code', () => {
    const md = [
      '# Title',
      '',
      'A paragraph with **bold**, _italic_ and `code` inline.',
    ].join('\n');
    expect(normalize(roundTrip(md))).toBe(normalize(md));
  });

  it('nested bullet + ordered lists', () => {
    const md = [
      '- alpha',
      '- beta',
      '  - beta child',
      '- gamma',
      '',
      '1. first',
      '2. second',
      '   1. second child',
      '3. third',
    ].join('\n');
    const out = normalize(roundTrip(md));
    // structural assertions (list markers may be re-styled by serializer)
    expect(out).toContain('alpha');
    expect(out).toContain('beta child');
    expect(out).toMatch(/1\. {2}first|1\. first/);
    // round-trip stability: converting twice equals converting once
    expect(normalize(tiptapToMarkdown(markdownToTiptap(out)))).toBe(out);
  });

  it('GFM table 3x3', () => {
    const md = [
      '| h1 | h2 | h3 |',
      '| --- | --- | --- |',
      '| a1 | a2 | a3 |',
      '| b1 | b2 | b3 |',
    ].join('\n');
    const out = normalize(roundTrip(md));
    expect(out).toMatch(/\| h1\s+\| h2\s+\| h3\s+\|/);
    expect(out).toContain('| --- |');
    expect(out).toMatch(/\| b1\s+\| b2\s+\| b3\s+\|/);
    expect(normalize(tiptapToMarkdown(markdownToTiptap(out)))).toBe(out);
  });

  it('task list with checked and unchecked items', () => {
    const md = ['- [ ] todo item', '- [x] done item'].join('\n');
    const out = normalize(roundTrip(md));
    expect(out).toMatch(/\[ \] todo item/);
    expect(out).toMatch(/\[x\] done item/);
    expect(normalize(tiptapToMarkdown(markdownToTiptap(out)))).toBe(out);
  });

  it('fenced code block with language', () => {
    const md = ['```ts', 'const x: number = 1;', 'console.log(x);', '```'].join('\n');
    const out = normalize(roundTrip(md));
    expect(out).toContain('```ts');
    expect(out).toContain('const x: number = 1;');
    expect(normalize(tiptapToMarkdown(markdownToTiptap(out)))).toBe(out);
  });

  it('blockquote', () => {
    const md = '> wisdom lives here';
    expect(normalize(roundTrip(md))).toBe(normalize(md));
  });

  it('image', () => {
    const md = '![alt](/uploads/x.png)';
    expect(normalize(roundTrip(md))).toBe(normalize(md));
  });

  it('link', () => {
    const md = 'See [the docs](https://example.com/docs) for more.';
    expect(normalize(roundTrip(md))).toBe(normalize(md));
  });

  it('callout round-trips as an emoji-leading blockquote', () => {
    const md = '> 💡 Remember to ship the cover band.';
    const doc = markdownToTiptap(md) as { content: Array<{ type: string; attrs?: { emoji?: string } }> };
    expect(doc.content[0].type).toBe('callout');
    expect(doc.content[0].attrs?.emoji).toBe('💡');
    const out = normalize(roundTrip(md));
    expect(out).toBe(normalize(md));
  });

  it('callout with a non-default emoji and multiple paragraphs round-trips', () => {
    const md = ['> ⚠️ Heads up about the migration.', '>', '> It renames a column.'].join('\n');
    const doc = markdownToTiptap(md) as { content: Array<{ type: string; attrs?: { emoji?: string }; content?: unknown[] }> };
    expect(doc.content[0].type).toBe('callout');
    expect(doc.content[0].attrs?.emoji).toBe('⚠️');
    expect(doc.content[0].content).toHaveLength(2);
    const out = normalize(roundTrip(md));
    expect(out).toContain('> ⚠️ Heads up about the migration.');
    expect(out).toContain('> It renames a column.');
    expect(normalize(tiptapToMarkdown(markdownToTiptap(out)))).toBe(out);
  });

  it('plain blockquote (no emoji) stays a blockquote', () => {
    const md = '> wisdom lives here';
    const doc = markdownToTiptap(md) as { content: Array<{ type: string }> };
    expect(doc.content[0].type).toBe('blockquote');
    expect(normalize(roundTrip(md))).toBe(normalize(md));
  });

  it('toggle round-trips via details/summary HTML passthrough', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'toggle',
          attrs: { open: true },
          content: [
            { type: 'toggleSummary', content: [{ type: 'text', text: 'Rollout plan' }] },
            {
              type: 'toggleContent',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Phase one is internal.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Phase two is everyone.' }] },
              ],
            },
          ],
        },
      ],
    };
    const md = tiptapToMarkdown(doc);
    expect(md).toContain('<details');
    expect(md).toContain('<summary>Rollout plan</summary>');
    const back = markdownToTiptap(md) as { content: Array<{ type: string; content?: Array<{ type: string; content?: Array<{ type: string }> }> }> };
    expect(back.content[0].type).toBe('toggle');
    expect(back.content[0].content?.[0].type).toBe('toggleSummary');
    expect(back.content[0].content?.[1].type).toBe('toggleContent');
    expect(back.content[0].content?.[1].content).toHaveLength(2);
    // serializing again is stable
    expect(normalize(tiptapToMarkdown(back))).toBe(normalize(md));
  });

  it('hand-authored details/summary markdown parses into a toggle', () => {
    const md = '<details><summary>FAQ</summary><p>It depends.</p></details>';
    const doc = markdownToTiptap(md) as { content: Array<{ type: string }> };
    expect(doc.content[0].type).toBe('toggle');
    const out = roundTrip(md);
    expect(out).toContain('<summary>FAQ</summary>');
    expect(out).toContain('It depends.');
  });

  it('markdownToTiptap("") returns an empty doc node', () => {
    const doc = markdownToTiptap('') as { type: string; content?: unknown[] };
    expect(doc.type).toBe('doc');
    const content = doc.content ?? [];
    // empty or a single empty paragraph — no text content either way
    expect(JSON.stringify(content)).not.toMatch(/"text"/);
  });

  it('tiptapToMarkdown(emptyDoc) returns ""', () => {
    expect(tiptapToMarkdown({ type: 'doc', content: [] })).toBe('');
  });
});
