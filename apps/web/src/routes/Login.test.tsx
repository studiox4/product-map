import { describe, it, expect } from 'vitest';
import { safeNext } from './Login';

describe('safeNext (open-redirect guard)', () => {
  it('passes through a same-origin path', () => {
    expect(safeNext('/invite/tok1')).toBe('/invite/tok1');
    expect(safeNext('/board')).toBe('/board');
  });

  it('falls back to / for null/empty', () => {
    expect(safeNext(null)).toBe('/app');
    expect(safeNext('')).toBe('/app');
  });

  it('rejects protocol-relative and absolute URLs (no open redirect)', () => {
    expect(safeNext('//evil.com')).toBe('/app');
    expect(safeNext('https://evil.com')).toBe('/app');
    expect(safeNext('http://evil.com/path')).toBe('/app');
    expect(safeNext('evil.com')).toBe('/app');
  });

  it('rejects a backslash second char (browser may normalize \\ to /)', () => {
    expect(safeNext('/\\evil.com')).toBe('/app');
  });

  it('passes through the bare root path', () => {
    expect(safeNext('/')).toBe('/');
  });
});
