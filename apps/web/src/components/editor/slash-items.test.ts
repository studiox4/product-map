import { describe, it, expect } from 'vitest';
import { SLASH_ITEMS, filterSlashItems } from './slash-items';

describe('slash-items', () => {
  it('contains all commands from the plan', () => {
    const titles = SLASH_ITEMS.map((i) => i.title);
    for (const expected of [
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bullet list',
      'Numbered list',
      'Task list',
      'Table',
      'Code block',
      'Quote',
      'Image',
      'Divider',
    ]) {
      expect(titles).toContain(expected);
    }
  });

  it('returns everything for an empty query', () => {
    expect(filterSlashItems('')).toHaveLength(SLASH_ITEMS.length);
  });

  it('filters by title prefix/substring, case-insensitive', () => {
    const headings = filterSlashItems('head');
    expect(headings.map((i) => i.title)).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
    ]);
    expect(filterSlashItems('TAB').map((i) => i.title)).toContain('Table');
  });

  it('matches keywords too', () => {
    expect(filterSlashItems('todo').map((i) => i.title)).toContain('Task list');
    expect(filterSlashItems('h1').map((i) => i.title)).toContain('Heading 1');
  });

  it('returns nothing for garbage queries', () => {
    expect(filterSlashItems('zzzzzz')).toHaveLength(0);
  });
});
