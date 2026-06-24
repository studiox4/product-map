import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases, kebabs, and strips symbols', () => {
    expect(slugify('My Cool Project!')).toBe('my-cool-project');
    expect(slugify('  Spaces  &  Symbols  ')).toBe('spaces-symbols');
    expect(slugify('Already-kebab')).toBe('already-kebab');
  });
  it('falls back to "project" for empty/symbol-only input', () => {
    expect(slugify('')).toBe('project');
    expect(slugify('!!!')).toBe('project');
  });
  it('caps length at 60 and trims a trailing hyphen', () => {
    const s = slugify('a'.repeat(100));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when free', async () => {
    expect(await uniqueSlug('Alpha', async () => false)).toBe('alpha');
  });
  it('appends -2, -3… until free', async () => {
    const taken = new Set(['alpha', 'alpha-2']);
    expect(await uniqueSlug('Alpha', async (s) => taken.has(s))).toBe('alpha-3');
  });
});
