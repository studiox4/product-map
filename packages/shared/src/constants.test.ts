import { describe, expect, it } from 'vitest';
import {
  DOC_TYPES,
  DOC_STATUSES,
  DOC_TYPE_COLORS,
  DOC_STATUS_COLORS,
  USER_COLORS,
  NOTIFICATION_KINDS,
} from './constants';

describe('NOTIFICATION_KINDS', () => {
  it('is the four E2a kinds in order', () => {
    expect(NOTIFICATION_KINDS).toEqual(['mention', 'comment', 'reply', 'project_invite']);
  });
});

describe('DOC_TYPE_COLORS', () => {
  it('covers every doc type with chip classes and a hex edge', () => {
    for (const type of DOC_TYPES) {
      const entry = DOC_TYPE_COLORS[type];
      expect(entry).toBeDefined();
      expect(entry.chip).toMatch(/^bg-\S+ text-\S+$/);
      expect(entry.edge).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('DOC_STATUS_COLORS', () => {
  it('covers every doc status', () => {
    for (const status of DOC_STATUSES) {
      expect(DOC_STATUS_COLORS[status]).toMatch(/^bg-\S+ text-\S+$/);
    }
  });
});

describe('USER_COLORS', () => {
  it('has six distinct hex colors', () => {
    expect(USER_COLORS).toHaveLength(6);
    expect(new Set(USER_COLORS).size).toBe(6);
    for (const color of USER_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
