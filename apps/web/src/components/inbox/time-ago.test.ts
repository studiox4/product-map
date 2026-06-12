import { describe, it, expect } from 'vitest';
import { timeAgoShort } from './time-ago';

const now = new Date('2026-06-12T12:00:00.000Z');

describe('timeAgoShort', () => {
  it('formats each magnitude compactly', () => {
    expect(timeAgoShort('2026-06-12T11:59:40.000Z', now)).toBe('just now');
    expect(timeAgoShort('2026-06-12T11:55:00.000Z', now)).toBe('5m ago');
    expect(timeAgoShort('2026-06-12T09:00:00.000Z', now)).toBe('3h ago');
    expect(timeAgoShort('2026-06-09T12:00:00.000Z', now)).toBe('3d ago');
    expect(timeAgoShort('2026-04-01T12:00:00.000Z', now)).toBe('2mo ago');
    expect(timeAgoShort('2024-06-12T12:00:00.000Z', now)).toBe('2y ago');
  });

  it('clamps future timestamps to "just now"', () => {
    expect(timeAgoShort('2026-06-13T12:00:00.000Z', now)).toBe('just now');
  });
});
