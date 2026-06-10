import { describe, expect, it } from 'vitest';
import {
  featureCreate,
  featureUpdate,
  documentUpdate,
  generateDoc,
} from './schemas';

describe('featureUpdate', () => {
  it('rejects startDate > endDate', () => {
    const result = featureUpdate.safeParse({
      startDate: '2026-06-10',
      endDate: '2026-06-09',
    });
    expect(result.success).toBe(false);
  });

  it('accepts equal dates', () => {
    const result = featureUpdate.safeParse({
      startDate: '2026-06-09',
      endDate: '2026-06-09',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null dates', () => {
    const result = featureUpdate.safeParse({
      startDate: null,
      endDate: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('featureCreate', () => {
  it('rejects empty title', () => {
    const result = featureCreate.safeParse({ title: '', horizon: 'now' });
    expect(result.success).toBe(false);
  });
});

describe('documentUpdate', () => {
  it('accepts partial bodies', () => {
    expect(documentUpdate.safeParse({}).success).toBe(true);
    expect(documentUpdate.safeParse({ title: 'New title' }).success).toBe(true);
    expect(documentUpdate.safeParse({ status: 'in_review' }).success).toBe(true);
    expect(
      documentUpdate.safeParse({ contentJson: { type: 'doc', content: [] } }).success,
    ).toBe(true);
  });
});

describe('generateDoc', () => {
  it('rejects 2001-char brief', () => {
    const result = generateDoc.safeParse({
      docType: 'prd',
      featureId: '4b6f9f6e-3f1a-4c8e-9a64-6a3d2c1b0e9f',
      brief: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
