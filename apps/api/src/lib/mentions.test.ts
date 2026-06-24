import { describe, it, expect } from 'vitest';
import { parseMentionIds } from './mentions';

describe('parseMentionIds', () => {
  it('extracts the userId from a token', () => {
    expect(parseMentionIds('hey @[Alice Chen](u-123) look')).toEqual(['u-123']);
  });
  it('dedupes repeated ids, preserving first-seen order', () => {
    expect(parseMentionIds('@[A](u-1) @[B](u-2) @[A again](u-1)')).toEqual(['u-1', 'u-2']);
  });
  it('returns [] when there are no tokens', () => {
    expect(parseMentionIds('plain comment with an @ but no token')).toEqual([]);
  });
  it('ignores malformed tokens', () => {
    expect(parseMentionIds('@[no id]() and @[x] and @(u-9)')).toEqual([]);
  });
});
