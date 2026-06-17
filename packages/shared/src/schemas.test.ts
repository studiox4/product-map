import { describe, expect, it } from 'vitest';
import {
  featureCreate,
  featureUpdate,
  documentUpdate,
  generateDoc,
  userCreate,
  collaboratorsPut,
  commentCreate,
  commentUpdate,
  resolveBody,
  voteBody,
} from './schemas';
import { registerInput, loginInput, changePasswordInput, MIN_PASSWORD_LENGTH } from './index';

const UUID = '4b6f9f6e-3f1a-4c8e-9a64-6a3d2c1b0e9f';

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

  it('accepts descriptionMd', () => {
    expect(featureUpdate.safeParse({ descriptionMd: '## Notes' }).success).toBe(true);
    expect(featureUpdate.safeParse({ descriptionMd: '' }).success).toBe(true);
  });
});

describe('userCreate', () => {
  it('accepts 1..80 char names and rejects outside the range', () => {
    expect(userCreate.safeParse({ name: 'Corban' }).success).toBe(true);
    expect(userCreate.safeParse({ name: '' }).success).toBe(false);
    expect(userCreate.safeParse({ name: 'a'.repeat(80) }).success).toBe(true);
    expect(userCreate.safeParse({ name: 'a'.repeat(81) }).success).toBe(false);
  });
});

describe('collaboratorsPut', () => {
  it('accepts uuid arrays and rejects non-uuids', () => {
    expect(collaboratorsPut.safeParse({ userIds: [] }).success).toBe(true);
    expect(
      collaboratorsPut.safeParse({ userIds: ['4b6f9f6e-3f1a-4c8e-9a64-6a3d2c1b0e9f'] }).success,
    ).toBe(true);
    expect(collaboratorsPut.safeParse({ userIds: ['nope'] }).success).toBe(false);
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

describe('commentCreate', () => {
  it('requires exactly one of featureId/documentId', () => {
    expect(commentCreate.safeParse({ featureId: UUID, body: 'hi' }).success).toBe(true);
    expect(commentCreate.safeParse({ documentId: UUID, body: 'hi' }).success).toBe(true);
    expect(commentCreate.safeParse({ body: 'hi' }).success).toBe(false);
    expect(commentCreate.safeParse({ featureId: UUID, documentId: UUID, body: 'hi' }).success).toBe(false);
  });

  it('bounds body to 1..4000 chars and accepts optional parentId', () => {
    expect(commentCreate.safeParse({ featureId: UUID, body: '' }).success).toBe(false);
    expect(commentCreate.safeParse({ featureId: UUID, body: 'a'.repeat(4000) }).success).toBe(true);
    expect(commentCreate.safeParse({ featureId: UUID, body: 'a'.repeat(4001) }).success).toBe(false);
    expect(commentCreate.safeParse({ featureId: UUID, parentId: UUID, body: 'hi' }).success).toBe(true);
    expect(commentCreate.safeParse({ featureId: UUID, parentId: 'nope', body: 'hi' }).success).toBe(false);
  });
});

describe('commentUpdate', () => {
  it('accepts partial bodies within bounds', () => {
    expect(commentUpdate.safeParse({}).success).toBe(true);
    expect(commentUpdate.safeParse({ body: 'edited' }).success).toBe(true);
    expect(commentUpdate.safeParse({ body: '' }).success).toBe(false);
    expect(commentUpdate.safeParse({ body: 'a'.repeat(4001) }).success).toBe(false);
  });
});

describe('resolveBody', () => {
  it('requires a boolean resolved flag', () => {
    expect(resolveBody.safeParse({ resolved: true }).success).toBe(true);
    expect(resolveBody.safeParse({ resolved: false }).success).toBe(true);
    expect(resolveBody.safeParse({}).success).toBe(false);
    expect(resolveBody.safeParse({ resolved: 'yes' }).success).toBe(false);
  });
});

describe('voteBody', () => {
  it('accepts only 1, -1, 0', () => {
    expect(voteBody.safeParse({ value: 1 }).success).toBe(true);
    expect(voteBody.safeParse({ value: -1 }).success).toBe(true);
    expect(voteBody.safeParse({ value: 0 }).success).toBe(true);
    expect(voteBody.safeParse({ value: 2 }).success).toBe(false);
    expect(voteBody.safeParse({}).success).toBe(false);
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

describe('auth schemas', () => {
  it('registerInput requires email, name, and a password >= MIN_PASSWORD_LENGTH', () => {
    const ok = registerInput.safeParse({ email: 'a@b.co', name: 'A', password: 'x'.repeat(MIN_PASSWORD_LENGTH) });
    expect(ok.success).toBe(true);
    expect(registerInput.safeParse({ email: 'a@b.co', name: 'A', password: 'short' }).success).toBe(false);
    expect(registerInput.safeParse({ email: 'not-an-email', name: 'A', password: 'x'.repeat(MIN_PASSWORD_LENGTH) }).success).toBe(false);
  });

  it('loginInput requires email + password', () => {
    expect(loginInput.safeParse({ email: 'a@b.co', password: 'whatever' }).success).toBe(true);
    expect(loginInput.safeParse({ email: 'a@b.co' }).success).toBe(false);
  });

  it('changePasswordInput requires current + valid new password', () => {
    expect(changePasswordInput.safeParse({ currentPassword: 'old', newPassword: 'x'.repeat(MIN_PASSWORD_LENGTH) }).success).toBe(true);
    expect(changePasswordInput.safeParse({ currentPassword: 'old', newPassword: 'short' }).success).toBe(false);
  });
});
