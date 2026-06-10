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
